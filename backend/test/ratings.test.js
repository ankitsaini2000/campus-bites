const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
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

async function student(name = "Rater") {
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

let foodSeq = 0;
async function makeFood() {
  const Food = require("../models/FoodItem");
  foodSeq += 1;
  return Food.create({
    name: `Dish ${foodSeq}`,
    price: 12,
    category: "Mains",
  });
}

/** Place an order and drive it to Completed, as the kitchen would. */
async function completedOrderWith(token, adminToken, foodId) {
  const placed = await api()
    .post("/api/orders")
    .set("Authorization", token)
    .send({ items: [{ food: foodId, quantity: 2 }] });
  assert.equal(placed.status, 201);

  const done = await api()
    .put(`/api/orders/${placed.body._id}/status`)
    .set("Authorization", adminToken)
    .send({ status: "Completed" });
  assert.equal(done.status, 200);
  return placed.body;
}

test("a dish cannot be rated without a completed order", async () => {
  const token = await student();
  const food = await makeFood();

  const res = await api()
    .post(`/api/food/${food._id}/rating`)
    .set("Authorization", token)
    .send({ rating: 5 });

  assert.equal(res.status, 403);
});

test("a completed order earns the right to rate", async () => {
  const token = await student();
  const adminToken = await admin();
  const food = await makeFood();
  await completedOrderWith(token, adminToken, food._id);

  const res = await api()
    .post(`/api/food/${food._id}/rating`)
    .set("Authorization", token)
    .send({ rating: 4, comment: "Tasty and fast" });

  assert.equal(res.status, 200);
  assert.equal(res.body.rating.rating, 4);
  assert.equal(res.body.rating.comment, "Tasty and fast");
  assert.equal(res.body.food.ratingAverage, 4);
  assert.equal(res.body.food.ratingCount, 1);
});

test("ratings validate the 1-5 range", async () => {
  const token = await student();
  const adminToken = await admin();
  const food = await makeFood();
  await completedOrderWith(token, adminToken, food._id);

  const res = await api()
    .post(`/api/food/${food._id}/rating`)
    .set("Authorization", token)
    .send({ rating: 9 });
  assert.equal(res.status, 400);
});

test("re-rating updates instead of duplicating", async () => {
  const token = await student();
  const adminToken = await admin();
  const food = await makeFood();
  await completedOrderWith(token, adminToken, food._id);

  await api()
    .post(`/api/food/${food._id}/rating`)
    .set("Authorization", token)
    .send({ rating: 2 });
  const again = await api()
    .post(`/api/food/${food._id}/rating`)
    .set("Authorization", token)
    .send({ rating: 5 });

  assert.equal(again.status, 200);
  assert.equal(again.body.food.ratingAverage, 5);
  assert.equal(again.body.food.ratingCount, 1);

  const Rating = require("../models/Rating");
  const count = await Rating.countDocuments({ food: food._id });
  assert.equal(count, 1);
});

test("the average reflects every rater", async () => {
  const adminToken = await admin();
  const food = await makeFood();

  for (const stars of [1, 5]) {
    const token = await student(`Rater ${stars}`);
    await completedOrderWith(token, adminToken, food._id);
    await api()
      .post(`/api/food/${food._id}/rating`)
      .set("Authorization", token)
      .send({ rating: stars });
  }

  const res = await api()
    .get(`/api/food/${food._id}/ratings`)
    .set("Authorization", await student("Bystander"));
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 2);

  const Food = require("../models/FoodItem");
  const dish = await Food.findById(food._id);
  assert.equal(dish.ratingAverage, 3);
  assert.equal(dish.ratingCount, 2);
});

test("reviews are listed newest first with the rater's name", async () => {
  const adminToken = await admin();
  const food = await makeFood();

  for (const name of ["Early", "Late"]) {
    const token = await student(name);
    await completedOrderWith(token, adminToken, food._id);
    await api()
      .post(`/api/food/${food._id}/rating`)
      .set("Authorization", token)
      .send({ rating: 3, comment: name });
  }

  const res = await api()
    .get(`/api/food/${food._id}/ratings`)
    .set("Authorization", await student("Bystander"));
  assert.equal(res.status, 200);
  assert.equal(res.body[0].user.name, "Late");
  assert.ok(res.body.every((r) => r.user && r.user.name));
});

test("a student can delete their own rating", async () => {
  const token = await student();
  const adminToken = await admin();
  const food = await makeFood();
  await completedOrderWith(token, adminToken, food._id);

  await api()
    .post(`/api/food/${food._id}/rating`)
    .set("Authorization", token)
    .send({ rating: 4 });

  const res = await api()
    .delete(`/api/food/${food._id}/rating`)
    .set("Authorization", token);
  assert.equal(res.status, 200);

  const Food = require("../models/FoodItem");
  const dish = await Food.findById(food._id);
  assert.equal(dish.ratingCount, 0);
  assert.equal(dish.ratingAverage, null);

  const repeat = await api()
    .delete(`/api/food/${food._id}/rating`)
    .set("Authorization", token);
  assert.equal(repeat.status, 404);
});

test("an admin can remove any review", async () => {
  const token = await student();
  const adminToken = await admin();
  const food = await makeFood();
  await completedOrderWith(token, adminToken, food._id);

  const created = await api()
    .post(`/api/food/${food._id}/rating`)
    .set("Authorization", token)
    .send({ rating: 4 });
  const ratingId = created.body.rating._id;

  const res = await api()
    .delete(`/api/ratings/${ratingId}`)
    .set("Authorization", adminToken);
  assert.equal(res.status, 200);

  const Rating = require("../models/Rating");
  assert.equal(await Rating.countDocuments(), 0);
});

test("a student cannot delete another student's rating", async () => {
  const adminToken = await admin();
  const food = await makeFood();

  const owner = await student("Owner");
  await completedOrderWith(owner, adminToken, food._id);
  const created = await api()
    .post(`/api/food/${food._id}/rating`)
    .set("Authorization", owner)
    .send({ rating: 4 });

  const other = await student("Other");
  const res = await api()
    .delete(`/api/ratings/${created.body.rating._id}`)
    .set("Authorization", other);
  assert.equal(res.status, 403);

  const Rating = require("../models/Rating");
  assert.equal(await Rating.countDocuments(), 1);
});

test("the menu exposes the rating summary", async () => {
  const adminToken = await admin();
  const food = await makeFood();
  const token = await student();
  await completedOrderWith(token, adminToken, food._id);
  await api()
    .post(`/api/food/${food._id}/rating`)
    .set("Authorization", token)
    .send({ rating: 5 });

  const res = await api()
    .get("/api/food")
    .set("Authorization", await student("Bystander"));
  assert.equal(res.status, 200);
  const dish = res.body.find((f) => String(f._id) === String(food._id));
  assert.equal(dish.ratingAverage, 5);
  assert.equal(dish.ratingCount, 1);
});
