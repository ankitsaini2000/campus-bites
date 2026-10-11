const mongoose = require("mongoose");

/**
 * A single canteen seat.
 *
 * Seats are created on demand up to the configured capacity
 * (PUT /api/seats/capacity). A seat is free while `occupiedBy`
 * is null. Claiming is an atomic findOneAndUpdate on that
 * condition, so two students can never take the same seat.
 */
const seatSchema = new mongoose.Schema(
  {
    seatNumber: { type: Number, required: true, min: 1, unique: true },
    occupiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    occupiedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

seatSchema.index({ occupiedBy: 1 });

module.exports = mongoose.model("Seat", seatSchema);
