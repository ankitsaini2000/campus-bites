const express = require("express");
const crypto = require("crypto");
const User = require("../models/User");
const { authMiddleware, adminMiddleware } = require("../middleware/authMiddleware");
const ApiError = require("../utils/ApiError");
const v = require("../utils/validators");

/**
 * User administration.
 *
 * ADMINISTRATOR ONLY. Everything here is gated by `adminMiddleware`
 * on the server — the UI hiding controls is cosmetic, this file is
 * the boundary.
 *
 * Role changes are deliberately limited to student <-> staff:
 * the bootstrap `admin` role is provisioned with `npm run seed:admin`
 * and never granted through the API.
 */

const router = express.Router();

/** Random 12-character temporary password for resets. */
function generateTempPassword() {
  return crypto.randomBytes(9).toString("base64url");
}

/** Projection shared by every read: never the password hash. */
const PUBLIC_FIELDS = "name email role phone isActive createdAt";

/** List users with search, role and active-state filtering. */
router.get("/", authMiddleware, adminMiddleware, async (req, res) => {
  const query = {};

  const search = v.optionalString(req.query.search, { field: "search", max: 100 });
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    query.$or = [{ name: rx }, { email: rx }];
  }
  if (req.query.role) {
    query.role = v.oneOf(req.query.role, ["student", "staff", "admin"], "role");
  }
  if (req.query.active !== undefined) {
    query.isActive = v.boolean(req.query.active, "active");
  }

  const limit = v.quantity(req.query.limit || 50, {
    field: "limit",
    min: 1,
    max: 200,
  });
  const page = v.quantity(req.query.page || 1, {
    field: "page",
    min: 1,
    max: 10000,
  });

  const [users, total] = await Promise.all([
    User.find(query)
      .select(PUBLIC_FIELDS)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments(query),
  ]);

  res.json({ users, total, page, limit });
});

/**
 * Update a user's role, phone or active state.
 *
 * Guards:
 *  - you cannot change your own role (no self-demotion accidents)
 *  - you cannot deactivate yourself (an admin always stays reachable)
 *  - the last active administrator can never be demoted/deactivated
 */
router.patch("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  const id = v.objectId(req.params.id, "user id");
  const body = v.object(req.body);

  const target = await User.findById(id);
  if (!target) throw ApiError.notFound("User not found");

  const isSelf = String(target._id) === String(req.user._id);
  const updates = {};

  if (body.role !== undefined) {
    const role = v.oneOf(body.role, ["student", "staff"], "role");
    if (role !== target.role) {
      if (isSelf) {
        throw ApiError.forbidden("You cannot change your own role");
      }
      // Demoting an admin is the only path that removes admin access.
      if (target.role === "admin") {
        const otherAdmins = await User.countDocuments({
          role: "admin",
          isActive: true,
          _id: { $ne: target._id },
        });
        if (otherAdmins === 0) {
          throw ApiError.conflict(
            "This is the last active administrator and cannot be demoted"
          );
        }
      }
      updates.role = role;
    }
  }

  if (body.isActive !== undefined) {
    const isActive = v.boolean(body.isActive, "isActive");
    if (!isActive && isSelf) {
      throw ApiError.forbidden("You cannot deactivate your own account");
    }
    if (!isActive && target.role === "admin") {
      const otherAdmins = await User.countDocuments({
        role: "admin",
        isActive: true,
        _id: { $ne: target._id },
      });
      if (otherAdmins === 0) {
        throw ApiError.conflict(
          "This is the last active administrator and cannot be deactivated"
        );
      }
    }
    updates.isActive = isActive;
  }

  if (body.phone !== undefined) {
    updates.phone =
      v.optionalString(body.phone, { field: "phone", max: 20 }) || null;
  }

  const updated = await User.findByIdAndUpdate(id, { $set: updates }, {
    new: true,
    runValidators: true,
  }).select(PUBLIC_FIELDS);

  res.json(updated);
});

/**
 * Reset a user's password.
 *
 * The admin may supply a new password; otherwise a temporary one is
 * generated and returned exactly once so it can be handed over
 * out-of-band. The old password stops working immediately.
 */
router.post("/:id/reset-password", authMiddleware, adminMiddleware, async (req, res) => {
  const id = v.objectId(req.params.id, "user id");
  const body = req.body ? v.object(req.body) : {};

  const target = await User.findById(id).select("+password");
  if (!target) throw ApiError.notFound("User not found");

  let password;
  let generated = false;
  if (body.password !== undefined && body.password !== null) {
    password = v.password(body.password, "password");
  } else {
    password = generateTempPassword();
    generated = true;
  }

  // The pre-save hook hashes on save.
  target.password = password;
  await target.save();

  res.json({
    reset: true,
    userId: target._id,
    ...(generated ? { tempPassword: password } : {}),
  });
});

module.exports = router;
