const mongoose = require("mongoose");

/**
 * Canteen-wide configuration.
 *
 * A single document (_id: "canteen") holds the handful of
 * tunables that used to be constants: how long an order
 * takes to prepare (drives the live ETA) and how many
 * orders fit in one pre-order time slot.
 */
const settingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: "canteen" },
    // Average minutes the kitchen needs per order.
    avgPrepMinutes: { type: Number, min: 1, max: 120, default: 6 },
    // Orders allowed per pre-order window.
    slotCapacity: { type: Number, min: 1, max: 500, default: 20 },
  },
  { timestamps: true }
);

const DEFAULTS = { avgPrepMinutes: 6, slotCapacity: 20 };

/** The live settings, with defaults for keys never configured. */
settingsSchema.statics.load = function load() {
  return this.findById("canteen")
    .lean()
    .then((doc) => ({ ...DEFAULTS, ...(doc || {}) }));
};

module.exports = mongoose.model("Settings", settingsSchema);
module.exports.DEFAULTS = DEFAULTS;
