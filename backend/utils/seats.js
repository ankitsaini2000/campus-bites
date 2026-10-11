const Seat = require("../models/Seat");

/** Dining capacity of a fresh canteen, before an admin changes it. */
const DEFAULT_CAPACITY = 40;

/** The highest seat number — i.e. the current capacity. */
async function currentCapacity() {
  const highest = await Seat.findOne()
    .sort({ seatNumber: -1 })
    .select("seatNumber")
    .lean();
  return highest ? highest.seatNumber : 0;
}

/** Create any missing seats up to `capacity`. Idempotent. */
async function ensureCapacity(capacity) {
  const current = await currentCapacity();
  if (capacity <= current) return current;

  const missing = [];
  for (let n = current + 1; n <= capacity; n += 1) {
    missing.push({ seatNumber: n });
  }
  try {
    await Seat.insertMany(missing);
  } catch (err) {
    // A concurrent bootstrap may have created some of these
    // already; the unique index guarantees the end state is
    // identical either way.
    if (!/duplicate key/i.test(String(err.message))) throw err;
  }
  return capacity;
}

/**
 * A canteen that has never been configured boots with the
 * default capacity. Every endpoint that reads or mutates the
 * map runs this first, so a fresh (or wiped) database is
 * never a special case — including seat claims made from
 * places that never loaded the map (e.g. opening a table).
 */
async function bootstrapIfEmpty() {
  if ((await currentCapacity()) === 0) {
    await ensureCapacity(DEFAULT_CAPACITY);
  }
}

module.exports = {
  currentCapacity,
  ensureCapacity,
  bootstrapIfEmpty,
  DEFAULT_CAPACITY,
};
