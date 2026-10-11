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

test("opening a table claims a seat and returns a code", async () => {
  const token = await student("Host");

  const res = await api()
    .post("/api/groups")
    .set("Authorization", token)
    .send({});

  assert.equal(res.status, 201);
  assert.match(res.body.code, /^[A-Z2-9]{6}$/);
  assert.equal(res.body.status, "open");
  assert.equal(res.body.members.length, 1);
  // A fresh database boots 40 seats; the first table takes seat 1.
  assert.equal(res.body.seatNumber, 1);
});

test("a second table takes the next seat", async () => {
  const first = await student("First");
  const second = await student("Second");

  const a = await api()
    .post("/api/groups")
    .set("Authorization", first)
    .send({});
  const b = await api()
    .post("/api/groups")
    .set("Authorization", second)
    .send({});

  assert.equal(a.body.seatNumber, 1);
  assert.equal(b.body.seatNumber, 2);
});

test("students join by code", async () => {
  const host = await student("Host");
  const guest = await student("Guest");

  const created = await api()
    .post("/api/groups")
    .set("Authorization", host)
    .send({});

  const res = await api()
    .post("/api/groups/join")
    .set("Authorization", guest)
    .send({ code: created.body.code });

  assert.equal(res.status, 200);
  assert.equal(res.body.members.length, 2);

  // A wrong code is simply "no such table".
  const wrong = await api()
    .post("/api/groups/join")
    .set("Authorization", guest)
    .send({ code: "ZZZZZZ" });
  assert.equal(wrong.status, 404);
});

test("members add dishes to the shared bill", async () => {
  const host = await student("Host");
  const guest = await student("Guest");
  const food = await makeFood();

  const created = await api()
    .post("/api/groups")
    .set("Authorization", host)
    .send({});

  await api()
    .post("/api/groups/join")
    .set("Authorization", guest)
    .send({ code: created.body.code });

  const res = await api()
    .post(`/api/groups/${created.body._id}/items`)
    .set("Authorization", guest)
    .send({ food: food._id, quantity: 2 });

  assert.equal(res.status, 200);
  assert.equal(res.body.items.length, 1);
  assert.equal(res.body.items[0].name, food.name);
  assert.equal(res.body.items[0].price, food.price);
  assert.equal(res.body.items[0].quantity, 2);
  assert.equal(res.body.items[0].addedByName, "Guest");
});

test("a stranger cannot add to a table", async () => {
  const host = await student("Host");
  const stranger = await student("Stranger");
  const food = await makeFood();

  const created = await api()
    .post("/api/groups")
    .set("Authorization", host)
    .send({});

  const res = await api()
    .post(`/api/groups/${created.body._id}/items`)
    .set("Authorization", stranger)
    .send({ food: food._id, quantity: 1 });

  assert.equal(res.status, 403);
});

test("the same person's dishes merge into one line", async () => {
  const host = await student("Host");
  const food = await makeFood();

  const created = await api()
    .post("/api/groups")
    .set("Authorization", host)
    .send({});

  await api()
    .post(`/api/groups/${created.body._id}/items`)
    .set("Authorization", host)
    .send({ food: food._id, quantity: 1 });
  const again = await api()
    .post(`/api/groups/${created.body._id}/items`)
    .set("Authorization", host)
    .send({ food: food._id, quantity: 2 });

  assert.equal(again.status, 200);
  assert.equal(again.body.items.length, 1);
  assert.equal(again.body.items[0].quantity, 3);
});

test("only the adder or host can remove a line", async () => {
  const host = await student("Host");
  const guest = await student("Guest");
  const stranger = await student("Stranger");
  const food = await makeFood();

  const created = await api()
    .post("/api/groups")
    .set("Authorization", host)
    .send({});
  await api()
    .post("/api/groups/join")
    .set("Authorization", guest)
    .send({ code: created.body.code });

  const added = await api()
    .post(`/api/groups/${created.body._id}/items`)
    .set("Authorization", guest)
    .send({ food: food._id, quantity: 1 });
  assert.equal(added.body.items.length, 1);

  // A third party who is not even at the table cannot remove.
  const denied = await api()
    .delete(`/api/groups/${created.body._id}/items/0`)
    .set("Authorization", stranger);
  assert.equal(denied.status, 403);

  // The guest (the adder) can.
  const removed = await api()
    .delete(`/api/groups/${created.body._id}/items/0`)
    .set("Authorization", guest);
  assert.equal(removed.status, 200);
  assert.equal(removed.body.items.length, 0);
});

test("the host checks the table out into a real order", async () => {
  const host = await student("Host");
  const guest = await student("Guest");
  const foodA = await makeFood();
  const foodB = await makeFood();

  const created = await api()
    .post("/api/groups")
    .set("Authorization", host)
    .send({});
  await api()
    .post("/api/groups/join")
    .set("Authorization", guest)
    .send({ code: created.body.code });

  await api()
    .post(`/api/groups/${created.body._id}/items`)
    .set("Authorization", guest)
    .send({ food: foodA._id, quantity: 2 });
  await api()
    .post(`/api/groups/${created.body._id}/items`)
    .set("Authorization", host)
    .send({ food: foodB._id, quantity: 1 });

  const res = await api()
    .post(`/api/groups/${created.body._id}/checkout`)
    .set("Authorization", host);

  assert.equal(res.status, 201);
  assert.equal(res.body.order.items.length, 2);
  // 2× dish A + 1× dish B
  assert.equal(res.body.order.total, foodA.price * 2 + foodB.price);
  assert.equal(res.body.order.student, host ? res.body.order.student : null);
  // The kitchen delivers to the table's seat.
  assert.equal(res.body.order.pickupSlot, "Seat 1");
  assert.equal(res.body.group.status, "checkedout");
  assert.ok(res.body.group.orderId);

  // A checked-out table cannot be checked out again.
  const repeat = await api()
    .post(`/api/groups/${created.body._id}/checkout`)
    .set("Authorization", host);
  assert.equal(repeat.status, 409);
});

test("only the host may check out", async () => {
  const host = await student("Host");
  const guest = await student("Guest");
  const food = await makeFood();

  const created = await api()
    .post("/api/groups")
    .set("Authorization", host)
    .send({});
  await api()
    .post("/api/groups/join")
    .set("Authorization", guest)
    .send({ code: created.body.code });
  await api()
    .post(`/api/groups/${created.body._id}/items`)
    .set("Authorization", guest)
    .send({ food: food._id, quantity: 1 });

  const res = await api()
    .post(`/api/groups/${created.body._id}/checkout`)
    .set("Authorization", guest);
  assert.equal(res.status, 403);
});

test("closing the table releases an auto-claimed seat", async () => {
  const host = await student("Host");

  const created = await api()
    .post("/api/groups")
    .set("Authorization", host)
    .send({});
  assert.equal(created.body.seatNumber, 1);

  const res = await api()
    .post(`/api/groups/${created.body._id}/close`)
    .set("Authorization", host);
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "closed");

  const seats = await api()
    .get("/api/seats")
    .set("Authorization", host);
  assert.equal(seats.body.occupied, 0);
});

test("my tables are listed for host and member", async () => {
  const host = await student("Host");
  const guest = await student("Guest");

  const created = await api()
    .post("/api/groups")
    .set("Authorization", host)
    .send({});

  await api()
    .post("/api/groups/join")
    .set("Authorization", guest)
    .send({ code: created.body.code });

  const asHost = await api()
    .get("/api/groups/mine")
    .set("Authorization", host);
  assert.equal(asHost.status, 200);
  assert.equal(asHost.body.length, 1);

  const asGuest = await api()
    .get("/api/groups/mine")
    .set("Authorization", guest);
  assert.equal(asGuest.status, 200);
  assert.equal(asGuest.body.length, 1);

  const stranger = await student("Stranger");
  const asStranger = await api()
    .get("/api/groups/mine")
    .set("Authorization", stranger);
  assert.equal(asStranger.body.length, 0);
});

test("a table can be pre-ordered into a future slot", async () => {
  const host = await student("Host");
  const food = await makeFood();

  const slots = await api()
    .get("/api/slots")
    .set("Authorization", host);
  const future = slots.body.find((s) => s.date > todayKey());

  const created = await api()
    .post("/api/groups")
    .set("Authorization", host)
    .send({ slotId: future._id });
  assert.equal(created.status, 201);

  await api()
    .post(`/api/groups/${created.body._id}/items`)
    .set("Authorization", host)
    .send({ food: food._id, quantity: 1 });

  const res = await api()
    .post(`/api/groups/${created.body._id}/checkout`)
    .set("Authorization", host);

  assert.equal(res.status, 201);
  assert.equal(String(res.body.order.slot), String(future._id));
  assert.ok(res.body.order.scheduledFor);
});

function todayKey() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
