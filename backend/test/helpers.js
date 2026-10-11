/**
 * Shared test bootstrap.
 *
 * Environment is configured BEFORE the app is required, because config.js
 * reads process.env once at module load. Tests run against a throwaway
 * in-memory MongoDB; the real canteenDB is never touched.
 */
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-not-used-anywhere-else-0123456789";
process.env.MONGO_URI = "mongodb://127.0.0.1:27017/never-used-in-tests";
process.env.RATE_LIMIT_ENABLED = "false";
process.env.CORS_ORIGINS = "http://localhost:5173";

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const request = require("supertest");

let mongod;

const createApp = require("../app");
const app = createApp();

/** Boot an in-memory database and connect Mongoose to it. */
async function startDb() {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri("canteenTest"));
}

/** Drop all collections so each suite starts clean. */
async function resetDb() {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
}

async function stopDb() {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
}

const api = () => request(app);

/** Create a user directly in the database (bypasses HTTP signup). */
async function makeUser({ name = "Test User", email, password = "password123", role = "student" }) {
  const User = require("../models/User");
  return User.create({ name, email, password, role });
}

/**
 * Register a student over HTTP through the full
 * OTP verification flow and return the session.
 *
 * The mailer runs in "log" mode under NODE_ENV=test,
 * so the code is read from the in-memory send log
 * — no real email is spent.
 */
async function registerAndLogin(overrides = {}) {
  const creds = {
    name: "Test Student",
    // The campus gate admits IET Lucknow
    // addresses, so tests register as
    // campus students.
    email: `2400520100${String(
      Math.floor(Math.random() * 1000)
    ).padStart(3, "0")}@ietlucknow.ac.in`,
    password: "password123",
    ...overrides,
  };
  const send = await api()
    .post("/api/auth/request-otp")
    .send({ email: creds.email });
  if (send.status !== 201) {
    throw new Error(
      `request-otp failed: ${send.status} ${send.body?.message}`
    );
  }
  const { sentLog } = require("../services/otpMailer");
  const entry = [...sentLog]
    .reverse()
    .find((s) => s.email === creds.email);
  if (!entry) throw new Error("no OTP was logged");
  const res = await api().post("/api/auth/verify-otp").send({
    email: creds.email,
    otp: entry.code,
    name: creds.name,
    password: creds.password,
  });
  if (res.status !== 201) {
    throw new Error(
      `verify-otp failed: ${res.status} ${res.body?.message}`
    );
  }
  return { token: res.body.token, ...res.body, credentials: creds };
}

/** Create a food item directly, bypassing admin HTTP routes. */
async function makeFood(overrides = {}) {
  const Food = require("../models/FoodItem");
  return Food.create({
    name: "Test Item",
    description: "Delicious test food",
    price: 100,
    ...overrides,
  });
}

module.exports = {
  app,
  api,
  startDb,
  resetDb,
  stopDb,
  makeUser,
  makeFood,
  registerAndLogin,
};