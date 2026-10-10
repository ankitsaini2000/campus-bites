const express = require("express");
const PromoCode = require("../models/PromoCode");
const { authMiddleware, adminMiddleware } = require("../middleware/authMiddleware");
const ApiError = require("../utils/ApiError");
const v = require("../utils/validators");

/**
 * Promo code management.
 *
 * CRUD is ADMINISTRATOR ONLY. The `GET /validate` endpoint is open
 * to every signed-in user so students can check a code before
 * checkout — it reveals only the discount, never usage counts.
 */

const router = express.Router();

/** Validate and shape the discount fields: exactly one of the two. */
function parseDiscount(body) {
  const hasPercent = body.percentOff !== undefined && body.percentOff !== null;
  const hasFixed = body.fixedOff !== undefined && body.fixedOff !== null;
  if (hasPercent === hasFixed) {
    throw ApiError.badRequest(
      "Provide exactly one of percentOff or fixedOff"
    );
  }
  return hasPercent
    ? {
        percentOff: v.quantity(body.percentOff, {
          field: "percentOff",
          min: 1,
          max: 100,
        }),
      }
    : { fixedOff: v.price(body.fixedOff, "fixedOff") };
}

/** Parse an optional expiry date from a request value. */
function parseDate(value, field) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw ApiError.badRequest(`${field} must be a valid date`);
  }
  return parsed;
}

/** Admin: list every code, newest first. */
router.get("/", authMiddleware, adminMiddleware, async (req, res) => {
  const promos = await PromoCode.find().sort({ createdAt: -1 }).limit(200);
  res.json(promos);
});

/** Admin: create a code. */
router.post("/", authMiddleware, adminMiddleware, async (req, res) => {
  const body = v.object(req.body);

  const code = v.optionalString(body.code, { field: "code", max: 30 });
  if (!code) throw ApiError.badRequest("code is required");

  const payload = {
    code: code.toUpperCase(),
    description:
      v.optionalString(body.description, { field: "description", max: 200 }) ||
      "",
    ...parseDiscount(body),
    createdBy: req.user._id,
  };
  if (body.minSubtotal !== undefined) {
    payload.minSubtotal = v.quantity(body.minSubtotal, {
      field: "minSubtotal",
      min: 0,
      max: 100000,
    });
  }
  if (body.maxUses !== undefined) {
    payload.maxUses = v.quantity(body.maxUses, {
      field: "maxUses",
      min: 1,
      max: 1000000,
    });
  }
  if (body.validUntil !== undefined && body.validUntil !== null) {
    payload.validUntil = parseDate(body.validUntil, "validUntil");
  }

  try {
    const promo = await PromoCode.create(payload);
    res.status(201).json(promo);
  } catch (err) {
    if (err.code === 11000) {
      throw ApiError.conflict(`Promo code "${payload.code}" already exists`);
    }
    throw err;
  }
});

/** Admin: update activation, window, thresholds or the discount. */
router.patch("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  const id = v.objectId(req.params.id, "promo id");
  const body = v.object(req.body);

  const promo = await PromoCode.findById(id);
  if (!promo) throw ApiError.notFound("Promo code not found");

  const updates = {};
  if (body.description !== undefined) {
    updates.description =
      v.optionalString(body.description, {
        field: "description",
        max: 200,
      }) || "";
  }
  if (body.active !== undefined) {
    updates.active = v.boolean(body.active, "active");
  }
  if (body.minSubtotal !== undefined) {
    updates.minSubtotal = v.quantity(body.minSubtotal, {
      field: "minSubtotal",
      min: 0,
      max: 100000,
    });
  }
  if (body.maxUses !== undefined) {
    updates.maxUses = v.quantity(body.maxUses, {
      field: "maxUses",
      min: 1,
      max: 1000000,
    });
  }
  if (body.validUntil !== undefined) {
    updates.validUntil =
      body.validUntil === null ? null : parseDate(body.validUntil, "validUntil");
  }
  if (body.percentOff !== undefined || body.fixedOff !== undefined) {
    Object.assign(updates, parseDiscount(body));
    // Keep the "exactly one" invariant on the stored document.
    if (updates.percentOff !== undefined) updates.fixedOff = null;
    if (updates.fixedOff !== undefined) updates.percentOff = null;
  }

  const updated = await PromoCode.findByIdAndUpdate(id, { $set: updates }, {
    new: true,
    runValidators: true,
  });
  res.json(updated);
});

/** Admin: delete a code. Orders that already used it keep their discount. */
router.delete("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  const id = v.objectId(req.params.id, "promo id");
  const result = await PromoCode.findByIdAndDelete(id);
  if (!result) throw ApiError.notFound("Promo code not found");
  res.json({ message: "Promo code deleted" });
});

/**
 * Any signed-in user: check a code against a cart subtotal.
 *
 * Read-only — it never claims a use, so browsing with a code does
 * not spend it. The actual claim happens atomically at checkout.
 */
router.get("/validate", authMiddleware, async (req, res) => {
  const code = v.optionalString(req.query.code, { field: "code", max: 30 });
  if (!code) throw ApiError.badRequest("code is required");

  const subtotal = v.price(req.query.subtotal, "subtotal");
  const promo = await PromoCode.findOne({ code: code.toUpperCase() });

  const evaluation = PromoCode.evaluate(promo, subtotal);
  if (!evaluation.valid) {
    return res.json({
      valid: false,
      code: code.toUpperCase(),
      message: evaluation.message,
    });
  }

  res.json({
    valid: true,
    code: promo.code,
    description: promo.description,
    percentOff: promo.percentOff,
    fixedOff: promo.fixedOff,
    discount: evaluation.discount,
  });
});

module.exports = router;
