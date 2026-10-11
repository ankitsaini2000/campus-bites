const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const config = require("../config");
const { authMiddleware } = require("../middleware/authMiddleware");
const { authLimiter } = require("../middleware/rateLimit");
const ApiError = require("../utils/ApiError");
const v = require("../utils/validators");

const router = express.Router();

/**
 * Campus sign-up policy.
 *
 * Only IET Lucknow addresses may register. The
 * OTP flow in routes/otp.js enforces it — the
 * code delivered to the inbox proves ownership,
 * so any roll-number format at the college
 * domain may register. Accounts that predate
 * the policy are untouched: login keeps
 * working for every existing address.
 */

/** Sign a session token for a user document. */
function issueToken(user) {
  return jwt.sign({ id: user._id.toString() }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
}

// Exported for routes/otp.js, which signs the
// session the same way after verification.
router.issueToken = issueToken;

// Signup — REMOVED. Registration now requires
// email verification: POST /api/auth/request-otp
// delivers a code to the campus address and
// POST /api/auth/verify-otp creates the account
// (see routes/otp.js). An unverified address can
// never create or sign in to an account.
// The body's `role` was always ignored —
// administrators are provisioned through
// `npm run seed:admin`, never through a public
// endpoint.

// Login
router.post("/login", authLimiter, async (req, res) => {
  const body = v.object(req.body);
  const email = v.email(body.email);

  // Only presence is enforced here, not minimum length. Accounts created
  // before validation existed may hold short passwords, and applying the
  // signup length rule at login would lock those users out.
  if (typeof body.password !== "string" || !body.password) {
    throw ApiError.badRequest("password is required");
  }

  const user = await User.findOne({ email }).select("+password");

  // A single generic message for both branches prevents user enumeration.
  const invalid = ApiError.unauthorized("Invalid email or password");
  if (!user) throw invalid;

  const isMatch = await user.comparePassword(body.password);
  if (!isMatch) throw invalid;

  if (user.isActive === false) {
    throw ApiError.forbidden("This account has been deactivated");
  }

  // Contract preserved: { token, role, name }. `id`/`email` are additive.
  res.json({
    token: issueToken(user),
    role: user.role,
    name: user.name,
    id: user._id.toString(),
    email: user.email,
  });
});

/**
 * Current authenticated user.
 *
 * The frontend has always called this to restore a session on page load, but
 * the route did not exist — the 404 triggered a `catch` that wiped the stored
 * token, logging everyone out on every refresh.
 */
router.get("/me", authMiddleware, async (req, res) => {
  res.json(req.user.toPublicJSON());
});

// Update the signed-in user's own profile (never their role).
router.put("/me", authMiddleware, async (req, res) => {
  const body = v.object(req.body);
  const user = req.user;

  if (body.name !== undefined) user.name = v.name(body.name);
  if (body.notificationPrefs !== undefined) {
    const prefs = v.object(body.notificationPrefs, "notificationPrefs");
    for (const key of ["orderUpdates", "promotions", "sound"]) {
      if (prefs[key] !== undefined) {
        user.notificationPrefs[key] = v.boolean(prefs[key], key);
      }
    }
  }

  await user.save();
  res.json(user.toPublicJSON());
});

// Favorites (add/remove/toggle) — additive, used by Phase 3.
router.get("/me/favorites", authMiddleware, async (req, res) => {
  const user = await User.findById(req.user._id).populate("favorites");
  res.json(user.favorites || []);
});

router.post("/me/favorites/:foodId", authMiddleware, async (req, res) => {
  const foodId = v.objectId(req.params.foodId, "foodId");
  const Food = require("../models/FoodItem");
  const food = await Food.findById(foodId);
  if (!food) throw ApiError.notFound("Food item not found");

  const user = await User.findById(req.user._id);
  const already = user.favorites.some((id) => id.toString() === foodId);
  if (!already) user.favorites.push(foodId);
  await user.save();

  res.status(already ? 200 : 201).json({ favorited: true, foodId });
});

router.delete("/me/favorites/:foodId", authMiddleware, async (req, res) => {
  const foodId = v.objectId(req.params.foodId, "foodId");
  const user = await User.findById(req.user._id);
  user.favorites = user.favorites.filter((id) => id.toString() !== foodId);
  await user.save();
  res.json({ favorited: false, foodId });
});

/**
 * Logout.
 *
 * Tokens are stateless JWTs, so the token is cleared client-side and a
 * short-lived "not after" hint is returned. Real revocation arrives with the
 * Phase 4 tokenVersion work.
 */
router.post("/logout", authMiddleware, async (req, res) => {
  res.json({ message: "Logged out", tokenDiscardedAt: new Date().toISOString() });
});

module.exports = router;