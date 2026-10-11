const mongoose = require("mongoose");

/**
 * A shared table order.
 *
 * One student (the host) opens a table, shares the 6-character
 * code, and everyone at the table adds dishes to the same bill.
 * Lines snapshot name/price for display only — at checkout the
 * host converts the table into a real Order, re-reading every
 * price and re-validating stock from the database, exactly
 * like a personal order.
 *
 * Opening a table claims a seat for the host (the seat map
 * and the table are the same dining experience); the seat is
 * released again if the host closes the table before checkout.
 */
const groupItemSchema = new mongoose.Schema(
  {
    food: { type: mongoose.Schema.Types.ObjectId, ref: "FoodItem", required: true },
    // Display snapshot; the authoritative price is re-read at checkout.
    name: { type: String, default: "" },
    price: { type: Number, default: 0 },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      max: 20,
      validate: {
        validator: Number.isInteger,
        message: "Quantity must be a whole number",
      },
    },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    addedByName: { type: String, default: "" },
  },
  { _id: false }
);

const groupSchema = new mongoose.Schema(
  {
    // Uppercase, no 0/O/1/I so codes are readable aloud.
    code: { type: String, required: true, unique: true, uppercase: true, maxlength: 8 },
    host: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    // Seat claimed for the table, if one was free.
    seatNumber: { type: Number, default: null },
    // True when the seat was claimed automatically by opening the
    // table (and must be released when the table closes).
    seatAuto: { type: Boolean, default: false },
    // Optional pre-order window for the whole table.
    slot: { type: mongoose.Schema.Types.ObjectId, ref: "TimeSlot", default: null },
    items: [groupItemSchema],
    status: {
      type: String,
      enum: ["open", "checkedout", "closed"],
      default: "open",
    },
    // Set when the table is checked out into a real order.
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
  },
  { timestamps: true }
);

groupSchema.index({ host: 1, createdAt: -1 });
groupSchema.index({ members: 1 });

module.exports = mongoose.model("GroupOrder", groupSchema);
