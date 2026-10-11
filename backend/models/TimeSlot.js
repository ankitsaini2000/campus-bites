const mongoose = require("mongoose");

/**
 * A pre-order pickup window.
 *
 * `date` is a server-local yyyy-mm-dd key and `start`/`end`
 * are HH:mm strings, so a slot is cheap to query and display.
 * Slots for the coming week are created lazily (on first read)
 * up to the configured capacity — see routes/slots.js.
 */
const slotSchema = new mongoose.Schema(
  {
    date: { type: String, required: true },
    start: { type: String, required: true },
    end: { type: String, required: true },
    // How many orders may be booked into this window.
    capacity: { type: Number, required: true, min: 1, max: 500 },
  },
  { timestamps: true }
);

slotSchema.index({ date: 1, start: 1 }, { unique: true });

module.exports = mongoose.model("TimeSlot", slotSchema);
