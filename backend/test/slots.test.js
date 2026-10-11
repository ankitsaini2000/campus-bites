const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { api, startDb, resetDb, stopDb, makeUser } = require("./helpers");

before(startDb);
after(stopDb);
beforeEach(resetDb);

async function bearer(user) {
  const res = await api()
    .post("/api/auth/login")
    .send({ email: user.email, password: "password123" });
  return `Bearer ${res.body.token}`;
}

async function student(name = "Student One") {
  return bearer(
    await makeUser({
      name,
      email: `s-${Math.random().toString(36).slice(2, 9)}@college.edu`,
    })
  );
}

let foodSeq = 0;
async function makeFood() {
  const Food = require("../models/FoodItem");
  foodSeq += 1;
  return Food.create({
    name: `Dish ${foodSeq}`,
    price: 10,
    category: "Mains",
  });
}

/** Today's yyyy-mm-dd key, so tests can pick a future day. */
function todayKey() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

test("the slot list bootstraps a week of windows", async () => {
  const res = await api()
    .get("/api/slots")
    .set("Authorization", await student());

  assert.equal(res.status, 200);
  // 7 days × 8 windows per day
  assert.equal(res.body.length, 56);
  assert.equal(res.body[0].capacity, 20);
  assert.equal(res.body[0].available, 20);
  assert.equal(res.body[0].taken, 0);
  // Sorted by date then start time.
  assert.equal(res.body[0].start, "11:30");
  assert.ok(res.body[0].date >= todayKey());
});

test("bootstrap is idempotent", async () => {
  await api().get("/api/slots").set("Authorization", await student());
  const res = await api()
    .get("/api/slots")
    .set("Authorization", await student());
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 56);
});

test("an order can be placed into a future slot", async () => {
  const token = await student();
  const food = await makeFood();

  const slots = await api()
    .get("/api/slots")
    .set("Authorization", token);
  const future = slots.body.find((s) => s.date > todayKey());
  assert.ok(future, "a future slot exists");

  const res = await api()
    .post("/api/orders")
    .set("Authorization", token)
    .send({ items: [{ food: food._id, quantity: 1 }], slotId: future._id });

  assert.equal(res.status, 201);
  assert.equal(String(res.body.slot), String(future._id));
  assert.ok(res.body.scheduledFor);
  assert.ok(new Date(res.body.scheduledFor) > new Date());
});

test("a slot that is too soon is refused", async () => {
  const token = await student();
  const food = await makeFood();

  const res = await api()
    .post("/api/orders")
    .set("Authorization", token)
    .send({ items: [{ food: food._id, quantity: 1 }], slotId: "0123456789abcdef01234567" });

  assert.equal(res.status, 404);
});

test("a full slot refuses further bookings", async () => {
  const token = await student();
  const food = await makeFood();
  const TimeSlot = require("../models/TimeSlot");

  // A two-seat window tomorrow, created before the bootstrap.
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  await TimeSlot.create({
    date: key,
    start: "12:00",
    end: "12:30",
    capacity: 2,
  });

  const slots = await api()
    .get("/api/slots")
    .set("Authorization", token);
  const small = slots.body.find(
    (s) => s.date === key && s.start === "12:00"
  );
  assert.equal(small.capacity, 2);

  await api()
    .post("/api/orders")
    .set("Authorization", token)
    .send({ items: [{ food: food._id, quantity: 1 }], slotId: small._id });
  await api()
    .post("/api/orders")
    .set("Authorization", token)
    .send({ items: [{ food: food._id, quantity: 1 }], slotId: small._id });

  const third = await api()
    .post("/api/orders")
    .set("Authorization", token)
    .send({ items: [{ food: food._id, quantity: 1 }], slotId: small._id });
  assert.equal(third.status, 409);
  assert.match(third.body.message, /slot is full/i);

  // The list reflects the bookings.
  const after = await api()
    .get("/api/slots")
    .set("Authorization", token);
  const row = after.body.find((s) => String(s._id) === String(small._id));
  assert.equal(row.taken, 2);
  assert.equal(row.available, 0);
});

test("a cancelled order frees its slot again", async () => {
  const token = await student();
  const food = await makeFood();

  const slots = await api()
    .get("/api/slots")
    .set("Authorization", token);
  const future = slots.body.find((s) => s.date > todayKey());

  const placed = await api()
    .post("/api/orders")
    .set("Authorization", token)
    .send({ items: [{ food: food._id, quantity: 1 }], slotId: future._id });
  assert.equal(placed.status, 201);

  const cancelled = await api()
    .post(`/api/orders/${placed.body._id}/cancel`)
    .set("Authorization", token);
  assert.equal(cancelled.status, 200);

  const after = await api()
    .get("/api/slots")
    .set("Authorization", token);
  const row = after.body.find((s) => String(s._id) === String(future._id));
  assert.equal(row.taken, 0);
});

test("an admin can raise the slot capacity", async () => {
  const adminToken = await bearer(
    await makeUser({
      name: "Admin One",
      email: `a-${Math.random().toString(36).slice(2, 9)}@college.edu`,
      role: "admin",
    })
  );

  const res = await api()
    .put("/api/settings")
    .set("Authorization", adminToken)
    .send({ slotCapacity: 50 });
  assert.equal(res.status, 200);
  assert.equal(res.body.slotCapacity, 50);

  // Newly created windows inherit the new capacity.
  const slots = await api()
    .get("/api/slots")
    .set("Authorization", adminToken);
  assert.equal(slots.body[0].capacity, 50);
});
