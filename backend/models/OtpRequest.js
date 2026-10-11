const mongoose = require("mongoose");

/**
 * One OTP send and its verification state.
 *
 * One document is created per send attempt —
 * the rate limits (per email, per IP, global)
 * are derived from these documents, so the
 * counters can never drift from reality.
 * The code itself is stored only as a hash
 * peppered with the server secret.
 */
const otpSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true },
    // Origin of the request, for the per-IP limit.
    ip: { type: String, default: "" },
    otpHash: { type: String, required: true },
    // Wrong-code attempts; the code is locked
    // once this reaches the policy maximum.
    attempts: { type: Number, default: 0, min: 0 },
    resendCount: { type: Number, default: 0, min: 0 },
    lastSentAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
    verifiedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

otpSchema.index({ email: 1, createdAt: -1 });
otpSchema.index({ ip: 1, createdAt: -1 });

module.exports = mongoose.model("OtpRequest", otpSchema);
