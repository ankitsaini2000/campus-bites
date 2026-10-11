const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { api, startDb, resetDb, stopDb, makeUser } = require("./helpers");

before(startDb);
after(stopDb);
beforeEach(resetDb);

/** Log a user in over HTTP and return the Authorization header value. */
async function bearer(user) {
  const res = await api()
    .post("/api/auth/login")
    .send({ email: user.email, password: "password123" });
  return `Bearer ${res.body.token}`;
}

/** A fresh student account. */
async function student(name = "Student One") {
  return bearer(
    await makeUser({
      name,
      email: `s-${Math.random().toString(36).slice(2, 9)}@college.edu`,
    })
  );
}

/** A fresh staff account. */
async function staff() {
  return bearer(
    await makeUser({
      name: "Staff One",
      email: `f-${Math.random().toString(36).slice(2, 9)}@college.edu`,
      role: "staff",
    })
  );
}

/** A fresh admin account. */
async function admin() {
  return bearer(
    await makeUser({
      name: "Admin One",
      email: `a-${Math.random().toString(36).slice(2, 9)}@college.edu`,
      role: "admin",
    })
  );
}

test("the seat map bootstraps the default capacity, all free", async () => {
  const res = await api().get("/api/seats").set("Authorization", await student());

  assert.equal(res.status, 200);
  assert.equal(res.body.capacity, 40);
  assert.equal(res.body.occupied, 0);
  assert.equal(res.body.available, 40);
  assert.equal(res.body.seats.length, 40);
  assert.equal(res.body.seats[0].seatNumber, 1);
  assert.equal(res.body.seats[0].occupied, false);
  assert.equal(res.body.seats[0].occupant, null);
});

test("taking a seat assigns the lowest-numbered free seat", async () => {
  const res = await api()
    .post("/api/seats/take")
    .set("Authorization", await student());

  assert.equal(res.status, 200);
  assert.equal(res.body.occupied, 1);
  const mine = res.body.seats.find((s) => s.occupied);
  assert.equal(mine.seatNumber, 1);
  assert.equal(mine.occupant.name, "Student One");
  assert.equal(mine.occupant.role, "student");
});

test("a second student gets the next seat, never the same one", async () => {
  await api().post("/api/seats/take").set("Authorization", await student("First"));
  const res = await api()
    .post("/api/seats/take")
    .set("Authorization", await student("Second"));

  assert.equal(res.status, 200);
  const taken = res.body.seats.filter((s) => s.occupied).map((s) => s.seatNumber);
  assert.deepEqual(taken, [1, 2]);
});

test("one seat per student — a second take is a 409", async () => {
  const token = await student();
  await api().post("/api/seats/take").set("Authorization", token);

  const again = await api().post("/api/seats/take").set("Authorization", token);
  assert.equal(again.status, 409);
  assert.match(again.body.message, /already have seat 1/i);
});

test("leaving releases the seat again", async () => {
  const token = await student();
  await api().post("/api/seats/take").set("Authorization", token);

  const res = await api().post("/api/seats/leave").set("Authorization", token);
  assert.equal(res.status, 200);
  assert.equal(res.body.occupied, 0);
  assert.equal(res.body.available, 40);
});

test("leaving without a seat is a 409", async () => {
  const res = await api()
    .post("/api/seats/leave")
    .set("Authorization", await student());
  assert.equal(res.status, 409);
});

test("staff may free a specific seat by number", async () => {
  await api().post("/api/seats/take").set("Authorization", await student());

  const res = await api()
    .post("/api/seats/leave")
    .set("Authorization", await staff())
    .send({ seatNumber: 1 });

  assert.equal(res.status, 200);
  assert.equal(res.body.occupied, 0);
});

test("a student cannot free another student's seat", async () => {
  await api().post("/api/seats/take").set("Authorization", await student());

  // The seatNumber field is ignored for students: they can only
  // release a seat they hold themselves.
  const res = await api()
    .post("/api/seats/leave")
    .set("Authorization", await student("Someone Else"))
    .send({ seatNumber: 1 });

  assert.equal(res.status, 409);
});

test("the seat map requires authentication", async () => {
  const res = await api().get("/api/seats");
  assert.equal(res.status, 401);
});

test("the map tells each student which seat is theirs", async () => {
  const token = await student();
  await api().post("/api/seats/take").set("Authorization", token);

  const res = await api().get("/api/seats").set("Authorization", token);
  assert.equal(res.status, 200);
  assert.equal(res.body.mySeat, 1);

  // A different student has no seat of their own.
  const other = await api()
    .get("/api/seats")
    .set("Authorization", await student("Someone Else"));
  assert.equal(other.status, 200);
  assert.equal(other.body.mySeat, null);
});

test("only admins may change the capacity", async () => {
  const res = await api()
    .put("/api/seats/capacity")
    .set("Authorization", await student())
    .send({ capacity: 50 });
  assert.equal(res.status, 403);
});

test("capacity must be a whole number within bounds", async () => {
  const res = await api()
    .put("/api/seats/capacity")
    .set("Authorization", await admin())
    .send({ capacity: "lots" });
  assert.equal(res.status, 400);
});

test("admin can grow the capacity", async () => {
  const res = await api()
    .put("/api/seats/capacity")
    .set("Authorization", await admin())
    .send({ capacity: 45 });

  assert.equal(res.status, 200);
  assert.equal(res.body.capacity, 45);
  assert.equal(res.body.seats.length, 45);
  assert.equal(res.body.seats[44].seatNumber, 45);
});

test("admin can shrink the capacity while the removed seats are free", async () => {
  await api()
    .put("/api/seats/capacity")
    .set("Authorization", await admin())
    .send({ capacity: 45 });

  const res = await api()
    .put("/api/seats/capacity")
    .set("Authorization", await admin())
    .send({ capacity: 42 });

  assert.equal(res.status, 200);
  assert.equal(res.body.capacity, 42);
  assert.equal(res.body.seats.length, 42);
});

test("shrinking past an occupied seat is refused with 409", async () => {
  // Occupy seats 1-5; seat 5 is the highest occupied seat.
  for (let i = 0; i < 5; i += 1) {
    await api()
      .post("/api/seats/take")
      .set("Authorization", await student(`S${i}`));
  }

  const res = await api()
    .put("/api/seats/capacity")
    .set("Authorization", await admin())
    .send({ capacity: 4 });

  assert.equal(res.status, 409);
  assert.match(res.body.message, /seat 5 is still occupied/i);
});
