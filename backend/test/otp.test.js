const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { api, startDb, resetDb, stopDb } = require("./helpers");
const { sentLog } = require("../services/otpMailer");
const OtpRequest = require("../models/OtpRequest");

before(startDb);
after(stopDb);
beforeEach(resetDb);

/** The most recent code "sent" to an address (log mode). */
function lastCodeFor(email) {
  return [...sentLog].reverse().find((s) => s.email === email)?.code;
}

/**
 * Age every OTP request past the resend
 * cooldown while keeping it inside the
 * hour and the day, so limits can be
 * stacked in tests without waiting.
 *
 * The raw driver is required: Mongoose's
 * update middleware strips $set on
 * createdAt.
 */
async function ageOtpRequests() {
  await OtpRequest.collection.updateMany(
    {},
    { $set: { createdAt: new Date(Date.now() - 120_000) } }
  );
}

/** A unique unregistered campus address. */
let seq = 0;
function freshEmail() {
  seq += 1;
  return `stu${seq}@ietlucknow.ac.in`;
}

// --- request-otp: delivery and policy ---

test("request-otp sends a code to a campus address", async () => {
  const email = freshEmail();
  const res = await api().post("/api/auth/request-otp").send({ email });

  assert.equal(res.status, 201);
  assert.equal(res.body.sent, true);
  assert.equal(res.body.email, email);
  assert.equal(res.body.cooldownSeconds, 60);
  assert.equal(res.body.expiresIn, 600);
  assert.equal(res.body.usedToday, 1);
  assert.equal(res.body.dailyLimit, 5);
  // The code was "delivered" through the log mailer.
  assert.ok(lastCodeFor(email));
});

test("an unverified code creates no account", async () => {
  const email = freshEmail();
  await api().post("/api/auth/request-otp").send({ email });
  const users = await mongoose.connection
    .collection("users")
    .countDocuments({ email });
  assert.equal(users, 0);
});

test("immediate resend is blocked by the cooldown", async () => {
  const email = freshEmail();
  await api().post("/api/auth/request-otp").send({ email });
  const res = await api().post("/api/auth/request-otp").send({ email });
  assert.equal(res.status, 429);
  assert.match(res.body.message, /wait/i);
  assert.match(res.body.message, /second/i);
});

test("at most 3 codes per email per hour", async () => {
  const email = freshEmail();
  for (let i = 0; i < 3; i += 1) {
    const res = await api().post("/api/auth/request-otp").send({ email });
    assert.equal(res.status, 201);
    await ageOtpRequests();
  }
  const blocked = await api().post("/api/auth/request-otp").send({ email });
  assert.equal(blocked.status, 429);
  assert.match(blocked.body.message, /hour/i);
});

test("at most 5 codes per email per day", async () => {
  const email = freshEmail();
  // Five sends today, each outside the resend
  // cooldown. They may fall inside the current
  // hour — the daily cap is checked first, so
  // the daily limit is the one that trips.
  const stamps = [61, 90, 120, 150, 180].map(
    (s) => new Date(Date.now() - s * 1000)
  );
  await OtpRequest.collection.insertMany(
    stamps.map((createdAt) => ({
      email,
      ip: "10.0.0.1",
      otpHash: "x".repeat(64),
      expiresAt: new Date(Date.now() + 600_000),
      createdAt,
    }))
  );

  const blocked = await api()
    .post("/api/auth/request-otp")
    .send({ email });
  assert.equal(blocked.status, 429);
  assert.match(blocked.body.message, /daily/i);
});

test("at most 20 requests per IP per day", async () => {
  // Unique addresses keep the per-email limits
  // out of the way; the shared limit is the
  // one under test.
  for (let i = 0; i < 20; i += 1) {
    const res = await api()
      .post("/api/auth/request-otp")
      .send({ email: freshEmail() });
    assert.equal(res.status, 201);
    await ageOtpRequests();
  }
  const blocked = await api()
    .post("/api/auth/request-otp")
    .send({ email: freshEmail() });
  assert.equal(blocked.status, 429);
  assert.match(blocked.body.message, /network/i);
});

test("the global daily quota holds 10 back from the provider cap", async () => {
  // 90 sends from elsewhere (a different source IP) fill the
  // app-wide budget without touching the caller's per-IP count.
  const docs = Array.from({ length: 90 }, (_, i) => ({
    email: `quota${i}@ietlucknow.ac.in`,
    ip: "10.0.0.1",
    otpHash: "x".repeat(64),
    expiresAt: new Date(Date.now() + 600_000),
    createdAt: new Date(),
  }));
  await OtpRequest.collection.insertMany(docs);

  const blocked = await api()
    .post("/api/auth/request-otp")
    .send({ email: freshEmail() });
  assert.equal(blocked.status, 429);
  assert.match(blocked.body.message, /quota/i);
});

// --- verify-otp: account creation ---

test("the correct code creates the account and signs in", async () => {
  const email = freshEmail();
  await api().post("/api/auth/request-otp").send({ email });
  const code = lastCodeFor(email);

  const res = await api().post("/api/auth/verify-otp").send({
    name: "Otto",
    email,
    password: "password123",
    otp: code,
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.message, "Email verified — account created");
  assert.equal(res.body.role, "student");
  assert.ok(res.body.token);

  const stored = await mongoose.connection
    .collection("users")
    .findOne({ email });
  assert.equal(stored.role, "student");
  assert.notEqual(stored.password, "password123");

  const me = await api()
    .get("/api/auth/me")
    .set("Authorization", `Bearer ${res.body.token}`);
  assert.equal(me.status, 200);
  assert.equal(me.body.email, email);
});

test("a wrong code is rejected and counted", async () => {
  const email = freshEmail();
  await api().post("/api/auth/request-otp").send({ email });

  const res = await api().post("/api/auth/verify-otp").send({
    name: "Otto",
    email,
    password: "password123",
    otp: "000000",
  });

  assert.equal(res.status, 400);
  assert.match(res.body.message, /wrong code/i);
  assert.match(res.body.message, /4 attempts remaining/i);

  const record = await OtpRequest.findOne({ email });
  assert.equal(record.attempts, 1);

  // No account was created by the failed attempt.
  const users = await mongoose.connection
    .collection("users")
    .countDocuments({ email });
  assert.equal(users, 0);
});

test("five wrong codes lock the request", async () => {
  const email = freshEmail();
  await api().post("/api/auth/request-otp").send({ email });

  for (let i = 0; i < 5; i += 1) {
    const res = await api().post("/api/auth/verify-otp").send({
      name: "Otto",
      email,
      password: "password123",
      otp: "000000",
    });
    assert.equal(res.status, 400);
  }

  const locked = await api().post("/api/auth/verify-otp").send({
    name: "Otto",
    email,
    password: "password123",
    otp: "000000",
  });
  assert.equal(locked.status, 429);
  assert.match(locked.body.message, /too many wrong attempts/i);
});

test("a code expires after its window", async () => {
  const email = freshEmail();
  await api().post("/api/auth/request-otp").send({ email });
  const code = lastCodeFor(email);
  await OtpRequest.updateOne(
    { email },
    { $set: { expiresAt: new Date(Date.now() - 1000) } }
  );

  const res = await api().post("/api/auth/verify-otp").send({
    name: "Otto",
    email,
    password: "password123",
    otp: code,
  });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /request a new one/i);
});

test("a fresh request supersedes an old code", async () => {
  const email = freshEmail();
  await api().post("/api/auth/request-otp").send({ email });
  const firstCode = lastCodeFor(email);
  await ageOtpRequests();
  await api().post("/api/auth/request-otp").send({ email });
  const secondCode = lastCodeFor(email);
  assert.notEqual(firstCode, secondCode);

  // The old code no longer verifies...
  const old = await api().post("/api/auth/verify-otp").send({
    name: "Otto",
    email,
    password: "password123",
    otp: firstCode,
  });
  assert.equal(old.status, 400);

  // ...but the new one does.
  const fresh = await api().post("/api/auth/verify-otp").send({
    name: "Otto",
    email,
    password: "password123",
    otp: secondCode,
  });
  assert.equal(fresh.status, 201);
});

test("a used code cannot be replayed", async () => {
  const email = freshEmail();
  await api().post("/api/auth/request-otp").send({ email });
  const code = lastCodeFor(email);

  const first = await api().post("/api/auth/verify-otp").send({
    name: "Otto",
    email,
    password: "password123",
    otp: code,
  });
  assert.equal(first.status, 201);

  const replay = await api().post("/api/auth/verify-otp").send({
    name: "Otto",
    email,
    password: "password123",
    otp: code,
  });
  assert.equal(replay.status, 400);
  assert.match(replay.body.message, /no valid code/i);
});

test("a code is never accepted for another address", async () => {
  const email = freshEmail();
  await api().post("/api/auth/request-otp").send({ email });
  const code = lastCodeFor(email);

  const other = freshEmail();
  await api().post("/api/auth/request-otp").send({ email: other });
  const otherCode = lastCodeFor(other);

  const res = await api().post("/api/auth/verify-otp").send({
    name: "Otto",
    email: other,
    password: "password123",
    otp: code, // the first address's code
  });
  assert.equal(res.status, 400);

  // The other address's own code still works.
  const ok = await api().post("/api/auth/verify-otp").send({
    name: "Otto",
    email: other,
    password: "password123",
    otp: otherCode,
  });
  assert.equal(ok.status, 201);
});
