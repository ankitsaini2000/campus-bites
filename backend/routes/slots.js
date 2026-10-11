const express = require("express");
const TimeSlot = require("../models/TimeSlot");
const Settings = require("../models/Settings");
const Order = require("../models/Order");
const { authMiddleware } = require("../middleware/authMiddleware");
const ApiError = require("../utils/ApiError");

const router = express.Router();

/** Pickup windows offered every day (server-local time). */
const WINDOWS = [
  ["11:30", "12:00"],
  ["12:00", "12:30"],
  ["12:30", "13:00"],
  ["13:00", "13:30"],
  ["17:30", "18:00"],
  ["18:00", "18:30"],
  ["18:30", "19:00"],
  ["19:00", "19:30"],
];

/** How far ahead a slot can be booked. */
const HORIZON_DAYS = 7;

/** A slot must start at least this many minutes from now. */
const MIN_LEAD_MINUTES = 30;

/** Statuses that still hold a booking in a slot. */
const HOLDING_STATUSES = ["Pending", "Accepted", "Preparing", "Ready"];

/** yyyy-mm-dd in server-local time. */
function toDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Today at midnight, server-local. */
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** The absolute Date a slot's window starts at. */
function slotDateTime(slot) {
  const [h, m] = slot.start.split(":").map(Number);
  const d = new Date(`${slot.date}T00:00:00`);
  d.setHours(h, m, 0, 0);
  return d;
}

/**
 * Create any missing slots for the coming week.
 *
 * Idempotent: the unique index on { date, start } makes
 * concurrent bootstraps safe, and capacity is only set on
 * creation (an admin's capacity change applies to newly
 * created windows).
 */
async function bootstrapSlots() {
  // Fast path: when the latest window already covers
  // the horizon, the upserts below are redundant —
  // a single query says so, keeping repeat reads
  // cheap.
  const horizonKey = toDateKey(
    new Date(Date.now() + (HORIZON_DAYS - 1) * 24 * 60 * 60 * 1000)
  );
  const latest = await TimeSlot.findOne()
    .sort({ date: -1 })
    .select("date")
    .lean();
  if (latest && latest.date >= horizonKey) return;

  const settings = await Settings.load();
  const today = startOfToday();

  for (let i = 0; i < HORIZON_DAYS; i += 1) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const date = toDateKey(d);
    for (const [start, end] of WINDOWS) {
      try {
        await TimeSlot.findOneAndUpdate(
          { date, start },
          { $setOnInsert: { date, start, end, capacity: settings.slotCapacity } },
          { upsert: true }
        );
      } catch (err) {
        if (!/duplicate key/i.test(String(err.message))) throw err;
      }
    }
  }
}

/**
 * Validate that a slot exists, is far enough in the future,
 * is inside the booking horizon, and still has room.
 * Returns the slot document.
 */
async function validateSlot(slotId) {
  const slot = await TimeSlot.findById(slotId);
  if (!slot) throw ApiError.notFound("Time slot not found");

  const start = slotDateTime(slot);
  const now = new Date();
  const earliest = new Date(now.getTime() + MIN_LEAD_MINUTES * 60000);
  if (start < earliest) {
    throw ApiError.conflict(
      `Slots must start at least ${MIN_LEAD_MINUTES} minutes from now`
    );
  }

  const horizon = startOfToday();
  horizon.setDate(horizon.getDate() + HORIZON_DAYS);
  if (start >= horizon) {
    throw ApiError.conflict(
      `Slots can only be booked within the next ${HORIZON_DAYS} days`
    );
  }

  const taken = await Order.countDocuments({
    slot: slot._id,
    status: { $in: HOLDING_STATUSES },
  });
  if (taken >= slot.capacity) {
    throw ApiError.conflict("This time slot is full");
  }

  return slot;
}

/** Count active bookings per slot id. */
async function slotUsage(slotIds) {
  const rows = await Order.aggregate([
    {
      $match: {
        slot: { $in: slotIds },
        status: { $in: HOLDING_STATUSES },
      },
    },
    { $group: { _id: "$slot", count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.count]));
}

/**
 * GET /api/slots — the bookable windows for the coming
 * week, with live taken/available counts.
 */
router.get("/", authMiddleware, async (req, res) => {
  await bootstrapSlots();
  const todayKey = toDateKey(new Date());
  const slots = await TimeSlot.find({ date: { $gte: todayKey } })
    .sort({ date: 1, start: 1 })
    .lean();

  const usage = await slotUsage(slots.map((s) => s._id));
  res.json(
    slots.map((s) => {
      const taken = usage.get(String(s._id)) || 0;
      return { ...s, taken, available: Math.max(0, s.capacity - taken) };
    })
  );
});

module.exports = router;
module.exports.WINDOWS = WINDOWS;
module.exports.HORIZON_DAYS = HORIZON_DAYS;
module.exports.MIN_LEAD_MINUTES = MIN_LEAD_MINUTES;
module.exports.validateSlot = validateSlot;
module.exports.slotDateTime = slotDateTime;
