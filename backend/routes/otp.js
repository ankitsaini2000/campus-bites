const express = require("express");
const OtpRequest = require("../models/OtpRequest");
const User = require("../models/User");
const config = require("../config");
const { authLimiter } = require("../middleware/rateLimit");
const ApiError = require("../utils/ApiError");
const v = require("../utils/validators");
const { sendOtpEmail } = require("../services/otpMailer");
const {
  generateCode,
  hashOtp,
  checkPolicy,
} = require("../services/otp");
const { issueToken } = require("./auth");

const router = express.Router();

/**
 * Campus domain gate. Any address at the college
 * domain may register — the OTP delivered to
 * that inbox proves ownership, so the part in
 * front of the @ is free to be any roll-number
 * format.
 */
const CAMPUS_EMAIL = new RegExp(
  config.auth.campusEmailPattern,
  "i"
);

/**
 * POST /api/auth/request-otp
 *
 * Send a verification code to a campus address.
 * The account is NOT created here — only when
 * the code is verified.
 */
router.post("/request-otp", authLimiter, async (req, res) => {
  const body = v.object(req.body);
  const email = v.email(body.email);

  if (!CAMPUS_EMAIL.test(email)) {
    throw ApiError.forbidden(
      "Registration is open to IET Lucknow email addresses only (…@ietlucknow.ac.in)"
    );
  }

  // Never spend a code on an existing account.
  const existing = await User.findOne({ email });
  if (existing) {
    throw ApiError.conflict("This email is already registered");
  }

  const policy = await checkPolicy(email, req.ip);
  if (!policy.ok) {
    throw ApiError.tooManyRequests(policy.message);
  }

  const code = generateCode();
  const record = await OtpRequest.create({
    email,
    ip: req.ip || "",
    otpHash: hashOtp(code),
    expiresAt: new Date(
      Date.now() + config.otp.expiresMinutes * 60 * 1000
    ),
    lastSentAt: new Date(),
  });

  try {
    await sendOtpEmail(email, code);
  } catch (err) {
    // The provider refused the send — do not
    // count it against any quota.
    await OtpRequest.deleteOne({ _id: record._id }).catch(
      () => {}
    );
    console.error(`[otp] send failed for ${email}:`, err.message);
    throw ApiError.badGateway(
      "Could not send the verification code. Please try again"
    );
  }

  res.status(201).json({
    sent: true,
    email,
    cooldownSeconds: config.otp.cooldownSeconds,
    expiresIn: config.otp.expiresMinutes * 60,
    usedToday: policy.usedToday,
    dailyLimit: config.otp.perDay,
    usedHour: policy.usedHour,
    hourlyLimit: config.otp.perHour,
  });
});

/**
 * POST /api/auth/verify-otp
 *
 * Verify the code and create the account in one
 * step. This is the ONLY path that creates a
 * student account — an unverified address can
 * never sign in.
 */
router.post("/verify-otp", authLimiter, async (req, res) => {
  const body = v.object(req.body);
  const email = v.email(body.email);
  const otp = v.optionalString(body.otp, {
    field: "otp",
    max: 10,
  }) || "";
  const name = v.name(body.name);
  const password = v.password(body.password);

  if (!CAMPUS_EMAIL.test(email)) {
    throw ApiError.forbidden(
      "Registration is open to IET Lucknow email addresses only (…@ietlucknow.ac.in)"
    );
  }

  // The most recent unverified request for this
  // address. A fresh request supersedes an old
  // one, so resending always works.
  const pending = await OtpRequest.findOne({
    email,
    verifiedAt: null,
  }).sort({ createdAt: -1 });

  if (
    !pending ||
    new Date(pending.expiresAt).getTime() < Date.now()
  ) {
    throw ApiError.badRequest(
      "No valid code for this email — request a new one"
    );
  }

  if (pending.attempts >= config.otp.maxAttempts) {
    throw ApiError.tooManyRequests(
      "Too many wrong attempts — request a new code"
    );
  }

  if (hashOtp(otp) !== pending.otpHash) {
    pending.attempts += 1;
    await pending.save();
    const left = config.otp.maxAttempts - pending.attempts;
    throw ApiError.badRequest(
      `Wrong code — ${left} attempt${left === 1 ? "" : "s"} remaining`
    );
  }

  // Verified: the account is created here, and
  // only here. `role` from the client is never
  // read — students are always students.
  pending.verifiedAt = new Date();
  await pending.save();

  const user = await User.create({
    name,
    email,
    password,
    role: "student",
  });

  console.log(`[auth] student registered via OTP: ${email}`);

  res.status(201).json({
    message: "Email verified — account created",
    token: issueToken(user),
    role: user.role,
    name: user.name,
    id: user._id.toString(),
    email: user.email,
  });
});

module.exports = router;
