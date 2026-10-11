const express = require("express");
const mongoose = require("mongoose");
const Rating = require("../models/Rating");
const Food = require("../models/FoodItem");
const Order = require("../models/Order");
const { authMiddleware, adminMiddleware } = require("../middleware/authMiddleware");
const ApiError = require("../utils/ApiError");
const v = require("../utils/validators");

const router = express.Router();

/**
 * A student may rate a dish only if it appeared in one of
 * their COMPLETED orders. Returns that order as proof, or null.
 */
async function completedOrderFor(userId, foodId) {
  return Order.findOne({
    student: userId,
    status: "Completed",
    "items.food": foodId,
  })
    .sort({ date: -1 })
    .lean();
}

/** Recompute and persist the denormalized rating summary on the dish. */
async function refreshFoodSummary(foodId) {
  const rows = await Rating.aggregate([
    { $match: { food: new mongoose.Types.ObjectId(foodId) } },
    {
      $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } },
    },
  ]);
  const stats = rows[0];
  await Food.updateOne(
    { _id: foodId },
    {
      $set: {
        ratingAverage: stats ? Math.round(stats.avg * 10) / 10 : null,
        ratingCount: stats ? stats.count : 0,
      },
    }
  );
}

/**
 * POST /api/food/:id/rating — create or update your rating.
 *
 * Re-rating updates the existing document (unique user+food
 * index), so a dish always carries at most one review per
 * student.
 */
router.post("/food/:id/rating", authMiddleware, async (req, res) => {
  const foodId = v.objectId(req.params.id, "food id");
  const body = v.object(req.body);
  const rating = v.quantity(body.rating, { field: "rating", min: 1, max: 5 });
  const comment =
    v.optionalString(body.comment, { field: "comment", max: 500 }) || "";

  const food = await Food.findById(foodId);
  if (!food) throw ApiError.notFound("Food item not found");

  const order = await completedOrderFor(req.user._id, foodId);
  if (!order) {
    throw ApiError.forbidden(
      "You can only rate a dish after a completed order containing it"
    );
  }

  const existing = await Rating.findOne({ user: req.user._id, food: foodId });
  const saved = existing
    ? await existing.updateOne({ $set: { rating, comment } }).then(() =>
        Rating.findById(existing._id)
      )
    : await Rating.create({
        user: req.user._id,
        food: foodId,
        order: order._id,
        rating,
        comment,
      });

  await refreshFoodSummary(foodId);
  const summary = await Food.findById(foodId).select("ratingAverage ratingCount");

  res.json({ rating: saved, food: summary });
});

/**
 * GET /api/food/:id/ratings — recent reviews, newest first.
 */
router.get("/food/:id/ratings", authMiddleware, async (req, res) => {
  const foodId = v.objectId(req.params.id, "food id");
  const limit = v.quantity(req.query.limit || 20, {
    field: "limit",
    min: 1,
    max: 100,
  });
  const ratings = await Rating.find({ food: foodId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("user", "name");
  res.json(ratings);
});

/**
 * DELETE /api/food/:id/rating — delete your own rating.
 */
router.delete("/food/:id/rating", authMiddleware, async (req, res) => {
  const foodId = v.objectId(req.params.id, "food id");
  const result = await Rating.deleteOne({ user: req.user._id, food: foodId });
  if (result.deletedCount === 0) {
    throw ApiError.notFound("You have not rated this dish");
  }
  await refreshFoodSummary(foodId);
  res.json({ deleted: true });
});

/**
 * DELETE /api/ratings/:ratingId — admin: remove any review
 * (e.g. an inappropriate comment).
 */
router.delete("/ratings/:ratingId", authMiddleware, adminMiddleware, async (req, res) => {
  const rating = await Rating.findById(
    v.objectId(req.params.ratingId, "rating id")
  );
  if (!rating) throw ApiError.notFound("Rating not found");
  await Rating.deleteOne({ _id: rating._id });
  await refreshFoodSummary(rating.food);
  res.json({ deleted: true });
});

module.exports = router;
