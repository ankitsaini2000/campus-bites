const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { api, startDb, resetDb, stopDb, makeUser } = require("./helpers");
const { sentLog } = require("../services/otpMailer");

before(startDb);
after(stopDb);
beforeEach(resetDb);

/** The most recent code "sent" to an address (log mode). */
function lastCodeFor(email) {
  return [...sentLog].reverse().find((s) => s.email === email)?.code;
}

test("verification creates a student and ignores a client-supplied role", async () => {
  await api()
    .post("/api/auth/request-otp")
    .send({ email: "2400520100101@ietlucknow.ac.in" });

  const res = await api().post("/api/auth/verify-otp").send({
    name: "Eve",
    email: "2400520100101@ietlucknow.ac.in",
    password: "password123",
    otp: lastCodeFor("2400520100101@ietlucknow.ac.in"),
    role: "admin", // attacker-controlled
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.role, "student");

  // Confirm at the database level, not just in the response.
  const stored = await mongoose.connection
    .collection("users")
    .findOne({ email: "2400520100101@ietlucknow.ac.in" });
  assert.equal(stored.role, "student");
});

test("verification cannot escalate via any privileged role value", async () => {
  const roles = ["admin", "staff", "Admin", "ADMIN", "superuser"];
  for (const [i, role] of roles.entries()) {
    const email = `2400520100${100 + i}@ietlucknow.ac.in`;
    await api().post("/api/auth/request-otp").send({ email });
    const res = await api().post("/api/auth/verify-otp").send({
      name: "Mallory",
      email,
      password: "password123",
      otp: lastCodeFor(email),
      role,
    });
    assert.equal(res.status, 201, `verification with role "${role}" failed`);
    assert.equal(res.body.role, "student", `role "${role}" was not ignored`);
  }
});

test("verification never returns or stores the password in plaintext", async () => {
  const email = "2400520100102@ietlucknow.ac.in";
  await api().post("/api/auth/request-otp").send({ email });
  const res = await api().post("/api/auth/verify-otp").send({
    name: "Safe",
    email,
    password: "password123",
    otp: lastCodeFor(email),
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.password, undefined);

  const raw = await mongoose.connection.collection("users").findOne({ email });
  assert.notEqual(raw.password, "password123");
  assert.match(raw.password, /^\$2[aby]\$/); // bcrypt hash
});

test("request-otp refuses a registered email with 409", async () => {
  const email = "2400520100103@ietlucknow.ac.in";
  const first = await api().post("/api/auth/request-otp").send({ email });
  assert.equal(first.status, 201);
  await api().post("/api/auth/verify-otp").send({
    name: "Dup",
    email,
    password: "password123",
    otp: lastCodeFor(email),
  });

  // The account exists now — no code is spent on it.
  const second = await api().post("/api/auth/request-otp").send({ email });
  assert.equal(second.status, 409);
  assert.match(second.body.message, /already registered/i);
});

test("registration is limited to IET Lucknow addresses", async () => {
  const cases = [
    ["outsider@gmail.com", "outside the college"],
    ["student@ietlucknow.edu", "wrong domain"],
    ["student@ietlucknow.ac.in.uk", "lookalike domain"],
    ["student@ietlucknow.ac.in.evil.com", "lookalike domain"],
  ];

  for (const [email, label] of cases) {
    const res = await api()
      .post("/api/auth/request-otp")
      .send({ email });
    assert.equal(res.status, 403, `${label}: ${email}`);
    assert.match(res.body.message, /IET Lucknow/i);
  }

  // Nothing was created by the refused attempts.
  const created = await mongoose.connection
    .collection("users")
    .countDocuments({ email: /gmail|ietlucknow/ });
  assert.equal(created, 0);
});

test("any roll-number format at the college domain may register", async () => {
  // Ownership is proven by the OTP delivered to the
  // inbox, so the part in front of the @ is free.
  for (const local of [
    "2400520100107",
    "24005201001000",
    "24005201001",
    "random.name",
  ]) {
    const email = `${local}@ietlucknow.ac.in`;
    const res = await api().post("/api/auth/request-otp").send({ email });
    assert.equal(res.status, 201, local);
  }
});

test("a campus address verifies end-to-end and signs in", async () => {
  const email = "2400520100107@ietlucknow.ac.in";
  const send = await api()
    .post("/api/auth/request-otp")
    .send({ email });
  assert.equal(send.status, 201);
  assert.equal(send.body.sent, true);
  assert.ok(send.body.cooldownSeconds >= 1);

  const res = await api().post("/api/auth/verify-otp").send({
    name: "Campus",
    email,
    password: "password123",
    otp: lastCodeFor(email),
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.email, email);
  assert.equal(res.body.role, "student");
  assert.ok(res.body.token);

  // The session issued at verification works at once.
  const me = await api()
    .get("/api/auth/me")
    .set("Authorization", `Bearer ${res.body.token}`);
  assert.equal(me.status, 200);
  assert.equal(me.body.email, email);
});

test("pre-policy accounts keep logging in", async () => {
  // The gate applies to registrations, not logins:
  // an address created before the policy stays usable.
  await makeUser({ name: "Legacy", email: "legacy@gmail.com", password: "password123" });
  const res = await api()
    .post("/api/auth/login")
    .send({ email: "legacy@gmail.com", password: "password123" });
  assert.equal(res.status, 200);
  assert.ok(res.body.token);
});

test("verification validates email, password length and name", async () => {
  const cases = [
    [{ name: "A", email: "not-an-email", password: "password123", otp: "123456" }, /valid email/i],
    [{ name: "A", email: "b@ietlucknow.ac.in", password: "short", otp: "123456" }, /at least 8/i],
    [{ name: "", email: "c@ietlucknow.ac.in", password: "password123", otp: "123456" }, /name is required/i],
    [{ name: "A", email: "d@ietlucknow.ac.in", password: "password123x".repeat(200), otp: "123456" }, /at most 128/i],
  ];

  for (const [payload, matcher] of cases) {
    const res = await api().post("/api/auth/verify-otp").send(payload);
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(payload)}`);
    if (matcher) assert.match(res.body.message, matcher);
  }
});

test("login returns the original { token, role, name } contract", async () => {
  await makeUser({ name: "Ada", email: "ada@college.edu", password: "password123" });

  const res = await api()
    .post("/api/auth/login")
    .send({ email: "ada@college.edu", password: "password123" });

  assert.equal(res.status, 200);
  assert.ok(res.body.token, "token must be present");
  assert.equal(res.body.role, "student");
  assert.equal(res.body.name, "Ada");
});

test("login is case-insensitive on email", async () => {
  await makeUser({ name: "Case", email: "case@college.edu", password: "password123" });
  const res = await api()
    .post("/api/auth/login")
    .send({ email: "CASE@College.EDU", password: "password123" });

  assert.equal(res.status, 200);
  assert.ok(res.body.token);
});

test("login with a wrong password and a wrong email give the same 401", async () => {
  await makeUser({ name: "Twin", email: "twin@college.edu", password: "password123" });

  const wrongPass = await api()
    .post("/api/auth/login")
    .send({ email: "twin@college.edu", password: "wrongpassword" });
  const noUser = await api()
    .post("/api/auth/login")
    .send({ email: "ghost@college.edu", password: "password123" });

  assert.equal(wrongPass.status, 401);
  assert.equal(noUser.status, 401);
  // Identical messages prevent user enumeration.
  assert.equal(wrongPass.body.message, noUser.body.message);
});

test("GET /api/auth/me returns the current user", async () => {
  await makeUser({ name: "Mia", email: "mia@college.edu", password: "password123", role: "admin" });
  const login = await api()
    .post("/api/auth/login")
    .send({ email: "mia@college.edu", password: "password123" });

  const res = await api()
    .get("/api/auth/me")
    .set("Authorization", `Bearer ${login.body.token}`);

  // This route did not exist before; session restoration silently failed.
  assert.equal(res.status, 200);
  assert.equal(res.body.name, "Mia");
  assert.equal(res.body.email, "mia@college.edu");
  assert.equal(res.body.role, "admin");
  assert.ok(res.body.id);
});

test("GET /api/auth/me accepts a bare token for backward compatibility", async () => {
  await makeUser({ name: "Bare", email: "bare@college.edu", password: "password123" });
  const login = await api()
    .post("/api/auth/login")
    .send({ email: "bare@college.edu", password: "password123" });

  const res = await api()
    .get("/api/auth/me")
    .set("Authorization", login.body.token); // no "Bearer" prefix

  assert.equal(res.status, 200);
  assert.equal(res.body.email, "bare@college.edu");
});

test("GET /api/auth/me rejects missing, invalid and foreign-scheme tokens", async () => {
  const noToken = await api().get("/api/auth/me");
  assert.equal(noToken.status, 401);

  const garbage = await api().get("/api/auth/me").set("Authorization", "Bearer nonsense");
  assert.equal(garbage.status, 401);

  const wrongScheme = await api().get("/api/auth/me").set("Authorization", "Basic abc123");
  assert.equal(wrongScheme.status, 401);
});

test("GET /api/auth/me 401s when the account has been deleted", async () => {
  const user = await makeUser({ name: "Ghost", email: "ghost2@college.edu", password: "password123" });
  const login = await api()
    .post("/api/auth/login")
    .send({ email: "ghost2@college.edu", password: "password123" });

  // Token is still cryptographically valid, but the user is gone.
  await mongoose.connection.collection("users").deleteOne({ _id: user._id });

  const res = await api()
    .get("/api/auth/me")
    .set("Authorization", `Bearer ${login.body.token}`);

  assert.equal(res.status, 401);
  assert.match(res.body.message, /no longer exists/i);
});

test("an expired token returns a clear 401 rather than a 500", async () => {
  const jwt = require("jsonwebtoken");
  const config = require("../config");
  const user = await makeUser({ email: "expired@college.edu" });

  const expired = jwt.sign({ id: user._id.toString() }, config.jwt.secret, {
    expiresIn: "-1s",
  });

  const res = await api().get("/api/auth/me").set("Authorization", `Bearer ${expired}`);
  assert.equal(res.status, 401);
  assert.match(res.body.message, /expired/i);
});

test("PUT /api/auth/me cannot change the caller's role", async () => {
  const { token } = await (async () => {
    await makeUser({ name: "Sneaky", email: "sneaky@college.edu", password: "password123" });
    const login = await api()
      .post("/api/auth/login")
      .send({ email: "sneaky@college.edu", password: "password123" });
    return { token: login.body.token };
  })();

  const res = await api()
    .put("/api/auth/me")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Still Student", role: "admin", email: "hacker@evil.com" });

  assert.equal(res.status, 200);

  const stored = await mongoose.connection.collection("users").findOne({ email: "sneaky@college.edu" });
  assert.equal(stored.role, "student", "role must not be escalatable");
  assert.equal(stored.email, "sneaky@college.edu", "email must not change here");
});