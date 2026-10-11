const crypto = require("crypto");
const OtpRequest = require("../models/OtpRequest");
const config = require("../config");

/** A 6-digit code. */
function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** Hash a code with the server secret as pepper. */
function hashOtp(code) {
  return crypto
    .createHash("sha256")
    .update(`${code}:${process.env.JWT_SECRET || "otp"}`)
    .digest("hex");
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Every gate from the OTP policy, checked before
 * a send. The provider's free tier allows 100
 * emails a day, so abuse protection matters:
 *
 *   - 1 code per email per cooldown (60s)
 *   - 3 codes per email per hour
 *   - 5 codes per email per day
 *   - 20 requests per IP per day
 *   - 90 sends app-wide per day (10 held back)
 *
 * Returns { ok: true, usedToday, usedHour } or
 * { ok: false, message }.
 */
async function checkPolicy(email, ip) {
  const now = Date.now();
  const hourAgo = new Date(now - 60 * 60 * 1000);
  const today = startOfToday();

  // Cooldown: one code per email per window.
  const latest = await OtpRequest.findOne({ email })
    .sort({ createdAt: -1 })
    .select("createdAt")
    .lean();
  if (latest) {
    const elapsed =
      (now - new Date(latest.createdAt).getTime()) / 1000;
    if (elapsed < config.otp.cooldownSeconds) {
      const wait = Math.ceil(config.otp.cooldownSeconds - elapsed);
      return {
        ok: false,
        message: `Please wait ${wait} second${wait === 1 ? "" : "s"} before requesting another code`,
        retryAfterSeconds: wait,
      };
    }
  }

  // Per email, per day. Checked before the
  // hourly cap: the daily budget is the one
  // that protects the provider's quota, and
  // a send that trips both should report it.
  const usedToday = await OtpRequest.countDocuments({
    email,
    createdAt: { $gt: today },
  });
  if (usedToday >= config.otp.perDay) {
    return {
      ok: false,
      message: "Daily code limit reached for this email. Try again tomorrow",
    };
  }

  // Per email, per hour.
  const usedHour = await OtpRequest.countDocuments({
    email,
    createdAt: { $gt: hourAgo },
  });
  if (usedHour >= config.otp.perHour) {
    return {
      ok: false,
      message: "Too many codes sent to this email this hour. Try again later",
    };
  }

  // Per IP, per day — stops one machine from
  // exhausting the shared quota.
  if (ip) {
    const usedIp = await OtpRequest.countDocuments({
      ip,
      createdAt: { $gt: today },
    });
    if (usedIp >= config.otp.perIpDay) {
      return {
        ok: false,
        message: "Too many requests from your network today. Try again tomorrow",
      };
    }
  }

  // Global daily quota, 10 under the provider's cap.
  const usedGlobal = await OtpRequest.countDocuments({
    createdAt: { $gt: today },
  });
  if (usedGlobal >= config.otp.globalDaily) {
    return {
      ok: false,
      message: "Verification is temporarily unavailable (daily quota reached). Please try again tomorrow",
    };
  }

  return { ok: true, usedToday: usedToday + 1, usedHour: usedHour + 1 };
}

module.exports = { generateCode, hashOtp, checkPolicy };
