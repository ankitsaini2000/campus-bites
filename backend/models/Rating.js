const mongoose = require("mongoose");

/**
 * A student's rating of a dish.
 *
 * One rating per student per dish (unique index) — rating
 * again updates the existing document. A rating is only
 * allowed for a dish that appeared in one of the student's
 * COMPLETED orders; the route verifies that before saving.
 *
 * The dish keeps a denormalized { ratingAverage, ratingCount }
 * summary that is recomputed on every write, so the menu
 * never pays for an aggregation.
 */
const ratingSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    food: { type: mongoose.Schema.Types.ObjectId, ref: "FoodItem", required: true },
    // The completed order that earned the right to rate.
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: {
        validator: Number.isInteger,
        message: "Rating must be a whole number between 1 and 5",
      },
    },
    comment: { type: String, trim: true, maxlength: 500, default: "" },
  },
  { timestamps: true }
);

ratingSchema.index({ user: 1, food: 1 }, { unique: true });
ratingSchema.index({ food: 1, createdAt: -1 });

module.exports = mongoose.model("Rating", ratingSchema);
