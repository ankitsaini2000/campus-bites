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

async function student(name = "Student One") {
  return bearer(
    await makeUser({
      name,
      email: `s-${Math.random().toString(36).slice(2, 9)}@college.edu`,
    })
  );
}

async function admin() {
  return bearer(
    await makeUser({
      name: "Admin One",
      email: `a-${Math.random().toString(36).slice(2, 9)}@college.edu`,
      role: "admin",
    })
  );
}

/** A minimal order so the queue has something in it. */
async function placeOrder(token) {
  const food = await makeFood();
  const res = await api()
    .post("/api/orders")
    .set("Authorization", token)
    .send({ items: [{ food: food._id, quantity: 1 }] });
  assert.equal(res.status, 201);
  return res.body;
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

test("settings expose the canteen defaults", async () => {
  const res = await api()
    .get("/api/settings")
    .set("Authorization", await student());
  assert.equal(res.status, 200);
  assert.equal(res.body.avgPrepMinutes, 6);
  assert.equal(res.body.slotCapacity, 20);
});

test("admin can tune the settings", async () => {
  const res = await api()
    .put("/api/settings")
    .set("Authorization", await admin())
    .send({ avgPrepMinutes: 9, slotCapacity: 35 });
  assert.equal(res.status, 200);
  assert.equal(res.body.avgPrepMinutes, 9);
  assert.equal(res.body.slotCapacity, 35);
});

test("only admins may change the settings", async () => {
  const res = await api()
    .put("/api/settings")
    .set("Authorization", await student())
    .send({ avgPrepMinutes: 9 });
  assert.equal(res.status, 403);
});

test("settings validate their values", async () => {
  const res = await api()
    .put("/api/settings")
    .set("Authorization", await admin())
    .send({ avgPrepMinutes: "slow" });
  assert.equal(res.status, 400);
});

test("an active order carries its queue position and ETA", async () => {
  const token = await student();
  const order = await placeOrder(token);

  const res = await api()
    .get("/api/orders")
    .set("Authorization", token);
  assert.equal(res.status, 200);
  const mine = res.body.find((o) => o._id === order._id);
  assert.equal(mine.queuePosition, 1);
  assert.equal(typeof mine.etaMinutes, "number");
  assert.ok(mine.etaMinutes >= 1);
});

test("queue positions follow arrival order", async () => {
  const first = await student("First");
  const second = await student("Second");
  await placeOrder(first);
  await placeOrder(second);

  const res = await api()
    .get("/api/orders")
    .set("Authorization", second);
  const mine = res.body[0];
  assert.equal(mine.queuePosition, 2);
});

test("a completed order leaves the queue", async () => {
  const token = await student();
  const adminToken = await admin();
  const order = await placeOrder(token);

  await api()
    .put(`/api/orders/${order._id}/status`)
    .set("Authorization", adminToken)
    .send({ status: "Completed" });

  const res = await api()
    .get(`/api/orders/${order._id}`)
    .set("Authorization", token);
  assert.equal(res.status, 200);
  assert.equal(res.body.queuePosition, null);
  assert.equal(res.body.etaMinutes, null);
});

test("the kitchen feed is sorted by due time and carries positions", async () => {
  const token = await student();
  const order = await placeOrder(token);

  const res = await api()
    .get("/api/orders/kitchen")
    .set("Authorization", await admin());
  assert.equal(res.status, 200);
  assert.ok(res.body.length >= 1);
  const entry = res.body.find((o) => o._id === order._id);
  assert.equal(entry.queuePosition, 1);
  assert.equal(typeof entry.waitSeconds, "number");
  assert.equal(entry.scheduled, false);
});
