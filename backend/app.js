const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const config = require("./config");
const { apiLimiter } = require("./middleware/rateLimit");
const { notFoundHandler, errorHandler } = require("./middleware/errorHandler");

const authRoutes = require("./routes/auth");
const foodRoutes = require("./routes/food");
const orderRoutes = require("./routes/order");
const inventoryRoutes = require("./routes/inventory");
const analyticsRoutes = require("./routes/analytics");
const userRoutes = require("./routes/users");
const promoRoutes = require("./routes/promos");
const announcementRoutes = require("./routes/announcements");
const seatRoutes = require("./routes/seats");
const settingsRoutes = require("./routes/settings");
const ratingRoutes = require("./routes/ratings");
const slotRoutes = require("./routes/slots");
const groupRoutes = require("./routes/groups");
const otpRoutes = require("./routes/otp");

/**
 * Build the Express application.
 *
 * Separated from server.js so tests can mount the app without opening a
 * listening socket. `npm start` behaviour is unchanged.
 */
function createApp() {
  const app = express();

  // Behind a proxy this makes req.ip (and therefore rate limiting) correct.
  app.set("trust proxy", 1);

  // --- Security headers (no extra dependency) ---
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-DNS-Prefetch-Control", "off");
    // HSTS and a same-origin CSP close the two gaps the Antideploy
    // security scan flagged (both LOW). The built bundle, fonts,
    // images and the Socket.IO transport are all same-origin, so
    // default-src 'self' is sufficient for this app.
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; base-uri 'self'; frame-ancestors 'none'"
    );
    res.removeHeader("X-Powered-By");
    next();
  });

  // --- CORS: explicit allow-list instead of `cors()` open to everything ---
  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin, curl and native apps send no Origin header.
        if (!origin) return callback(null, true);
        if (config.corsOrigins.includes(origin)) return callback(null, true);
        return callback(new Error(`Origin ${origin} is not allowed by CORS`));
      },
      credentials: true,
    })
  );

  app.use(express.json({ limit: "100kb" }));
  app.use(express.urlencoded({ extended: true, limit: "100kb" }));

  // --- Routes ---
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  app.use("/api", apiLimiter);
  app.use("/api/auth", authRoutes);
  // OTP verification also lives under /api/auth
  // (request-otp / verify-otp); paths do not
  // overlap with the routes above.
  app.use("/api/auth", otpRoutes);
  app.use("/api/food", foodRoutes);
  app.use("/api/orders", orderRoutes);
  app.use("/api/inventory", inventoryRoutes);
  app.use("/api/analytics", analyticsRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/promos", promoRoutes);
  app.use("/api/announcements", announcementRoutes);
  app.use("/api/seats", seatRoutes);
  app.use("/api/settings", settingsRoutes);
  app.use("/api/slots", slotRoutes);
  app.use("/api/groups", groupRoutes);
  // Rating routes mount both /api/food/:id/rating(s) and /api/ratings/:id.
  app.use("/api", ratingRoutes);

  // --- Production: serve the built frontend ---
  // In development the Vite dev server (port 5173) serves the UI and
  // calls this API on localhost:5000. In production this Express app is
  // the single origin for both UI and API: it serves the built bundle
  // (frontend/dist in the monorepo, or public/ when only this package
  // is shipped) and falls back to index.html so client-side routes
  // resolve on a hard refresh.
  if (config.isProduction) {
    const distCandidates = [
      path.join(__dirname, "..", "frontend", "dist"),
      path.join(__dirname, "public"),
    ];
    const distDir = distCandidates.find((dir) =>
      fs.existsSync(path.join(dir, "index.html"))
    );

    if (distDir) {
      app.use(express.static(distDir));
      // SPA fallback: page routes (no file extension) render the app
      // shell. This app switches screens with state, not a router, so
      // every real page is the root path. A request with an extension
      // is an asset: a missing one (e.g. the old /vite.svg) stays a
      // 404 rather than returning the HTML shell with a 200.
      app.use((req, res, next) => {
        if (req.method !== "GET" || req.path.startsWith("/api/")) {
          return next();
        }
        if (path.extname(req.path)) {
          return next();
        }
        res.sendFile(path.join(distDir, "index.html"));
      });
    } else {
      console.warn(
        "[app] No built frontend found (frontend/dist or public/) - API only."
      );
    }
  }

  // --- Centralized fallbacks (must be registered last) ---
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;