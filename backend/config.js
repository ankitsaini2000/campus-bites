/**
 * Environment-driven configuration.
 *
 * SECURITY NOTE: this module previously exported hardcoded defaults
 * (`MONGO_URI` and `JWT_SECRET`) and was dead code that no file required.
 * It is now the single source of truth for runtime configuration and it
 * contains no secrets of its own.
 */

const WEAK_SECRETS = new Set([
  "canteensecret123",
  "secret",
  "changeme",
  "your-secret-key",
]);

/** Read an integer env var, falling back to `fallback` when unset/invalid. */
function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Read a boolean env var. Accepts "1", "true", "yes", "on". */
function envBool(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(raw).toLowerCase());
}

function readJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error(
      "JWT_SECRET is not set. Copy .env.example to .env and provide a strong random value. " +
        "Generate one with: npm run generate:secret"
    );
  }

  if (WEAK_SECRETS.has(secret)) {
    const message =
      "JWT_SECRET is set to a well-known weak value. Generate a strong secret with: npm run generate:secret";
    if (process.env.NODE_ENV === "production") {
      throw new Error(message);
    }
    // Development only: keep booting so existing local setups are not broken,
    // but make the risk unmissable.
    console.warn(`\n[security] WARNING: ${message}\n`);
  }

  return secret;
}

const nodeEnv = process.env.NODE_ENV || "development";
const isProduction = nodeEnv === "production";
const isTest = nodeEnv === "test";

const config = {
  nodeEnv,
  isProduction,
  isTest,

  port: envInt("PORT", 5000),
  mongoUri: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/canteenDB",

  jwt: {
    secret: readJwtSecret(),
    expiresIn: process.env.JWT_EXPIRES_IN || "1d",
  },

  // Comma-separated origin allowlist. Defaults to the local Vite dev server.
  corsOrigins: (process.env.CORS_ORIGINS || "http://localhost:5173,http://localhost:5174")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),

  rateLimit: {
    enabled: envBool("RATE_LIMIT_ENABLED", !isTest),
    windowMs: envInt("RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000),
    authMax: envInt("RATE_LIMIT_AUTH_MAX", 10),
    apiMax: envInt("RATE_LIMIT_API_MAX", 300),
  },

  // Optional Socket.IO notification layer. When disabled, REST behaves
  // identically and no transport is attached.
  realtime: {
    enabled: envBool("REALTIME_ENABLED", true),
  },

  // Business rules — configurable without a code change.
  order: {
    maxQuantityPerItem: envInt("ORDER_MAX_QUANTITY", 20),
    maxItemsPerOrder: envInt("ORDER_MAX_ITEMS", 30),
    // Phase 2: when false (default) staff/admin may skip ahead along the
    // forward path, preserving the original admin UI behaviour of jumping
    // Pending -> Preparing / Pending -> Completed. When true, every stage
    // (Pending -> Accepted -> Preparing -> Ready -> Completed) is required.
    strictLifecycle: envBool("ORDER_STRICT_LIFECYCLE", false),

    // statusHistory retention. In practice the lifecycle already bounds an
    // order to ~5 transitions because terminal states cannot be reopened, so
    // this is a defensive ceiling rather than routine pruning. When it is
    // reached the oldest entries are trimmed from the display array, but
    // `statusHistoryTotal` keeps an exact count so no auditing information is
    // silently lost.
    statusHistoryLimit: envInt("ORDER_STATUS_HISTORY_LIMIT", 100),
  },

  // Sign-up policy. New registrations are limited to
  // campus addresses; ownership is proven by an
  // OTP delivered to that inbox, so any
  // roll-number format at the domain is fine.
  auth: {
    campusEmailPattern:
      process.env.AUTH_EMAIL_PATTERN ||
      "^[^@\\s]+@ietlucknow\\.ac\\.in$",
  },

  // Email verification (OTP) policy. The provider's
  // free tier caps sends at 100 emails a day, so
  // the app holds 10 back and enforces per-email,
  // per-IP and global limits before every send.
  otp: {
    // "anypost" sends through the Anypost HTTP
    // API; "log" records the code in memory
    // instead (tests and development) so no
    // real email is spent.
    mailer: process.env.OTP_MAILER || (isTest ? "log" : "anypost"),
    anypostApiKey: process.env.ANYPOST_API_KEY || "",
    anypostFrom:
      process.env.OTP_FROM_EMAIL || "campusbites@campusbites.in",
    cooldownSeconds: envInt("OTP_COOLDOWN_SECONDS", 60),
    perHour: envInt("OTP_PER_HOUR", 3),
    perDay: envInt("OTP_PER_DAY", 5),
    perIpDay: envInt("OTP_PER_IP_DAY", 20),
    globalDaily: envInt("OTP_GLOBAL_DAILY", 90),
    expiresMinutes: envInt("OTP_EXPIRES_MINUTES", 10),
    maxAttempts: envInt("OTP_MAX_ATTEMPTS", 5),
  },
};

module.exports = config;