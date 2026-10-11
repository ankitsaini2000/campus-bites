const config = require("../config");

/**
 * OTP delivery.
 *
 * Production sends through the Anypost HTTP
 * API (https://anypost.com/docs). In "log"
 * mode (tests and development) the code is
 * recorded in memory instead, so no real
 * email — and none of the provider's daily
 * quota — is ever spent.
 */

// In-memory record of what "log" mode sent.
const sentLog = [];

async function sendOtpEmail(email, code) {
  if (config.otp.mailer === "log") {
    sentLog.push({ email, code, at: new Date() });
    console.log(`[otp] verification code for ${email}: ${code}`);
    return { id: `log_${sentLog.length}` };
  }

  const res = await fetch("https://api.anypost.com/v1/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.otp.anypostApiKey}`,
    },
    body: JSON.stringify({
      from: config.otp.anypostFrom,
      to: [email],
      subject: "Your Campus Bites verification code",
      text:
        `Your Campus Bites verification code is ${code}.\n\n` +
        `It expires in ${config.otp.expiresMinutes} minutes. ` +
        "If you did not request this, you can ignore this email.",
    }),
  });

  if (!res.ok) {
    // Anypost errors arrive as { error: { type, message } }
    // or a flat { error: "code" }.
    const body = await res.text().catch(() => "");
    let detail = body;
    try {
      const parsed = JSON.parse(body);
      detail =
        parsed?.error?.message || parsed?.error || body;
    } catch {
      /* keep the raw body */
    }
    throw new Error(`Anypost ${res.status}: ${String(detail).slice(0, 200)}`);
  }

  return res.json();
}

module.exports = { sendOtpEmail, sentLog };
