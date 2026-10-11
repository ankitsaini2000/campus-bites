const express = require("express");
const Seat = require("../models/Seat");
const { authMiddleware, adminMiddleware } = require("../middleware/authMiddleware");
const ApiError = require("../utils/ApiError");
const v = require("../utils/validators");
const { emitSeatUpdate } = require("../realtime");

const router = express.Router();

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

/**
 * A canteen that has never been configured boots with the
 * default capacity. Every endpoint that reads or mutates the
 * map runs this first, so a fresh (or wiped) database is
 * never a special case.
 */
async function bootstrapIfEmpty() {
  if ((await currentCapacity()) === 0) {
    await ensureCapacity(DEFAULT_CAPACITY);
  }
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
    // A concurrent bootstrap may have created some of these already;
    // the unique index guarantees the end state is identical either way.
    if (!/duplicate key/i.test(String(err.message))) throw err;
  }
  return capacity;
}

/** The seat map with a safe occupant projection (id, name, role only). */
async function seatMap() {
  const seats = await Seat.find()
    .sort({ seatNumber: 1 })
    .populate("occupiedBy", "name role")
    .lean();

  return seats.map((s) => ({
    seatNumber: s.seatNumber,
    occupied: Boolean(s.occupiedBy),
    occupant: s.occupiedBy
      ? {
          id: String(s.occupiedBy._id),
          name: s.occupiedBy.name,
          role: s.occupiedBy.role,
        }
      : null,
    occupiedAt: s.occupiedAt ? new Date(s.occupiedAt).toISOString() : null,
  }));
}

/** Summary payload shared by every read and mutation. */
async function snapshot(userId) {
  const seats = await seatMap();
  const occupied = seats.filter((s) => s.occupied).length;
  const mine = userId
    ? seats.find((s) => s.occupied && s.occupant?.id === String(userId))
    : null;
  return {
    capacity: seats.length,
    occupied,
    available: seats.length - occupied,
    // The caller's own seat, so the UI can highlight it
    // without a second round-trip.
    mySeat: mine ? mine.seatNumber : null,
    seats,
  };
}

/**
 * GET /api/seats — the live seat map.
 *
 * A canteen that has never been configured boots with the default
 * capacity, so the very first read is also the bootstrap.
 */
router.get("/", authMiddleware, async (req, res) => {
  await bootstrapIfEmpty();
  res.json(await snapshot(req.user._id));
});

/**
 * POST /api/seats/take — claim the lowest-numbered free seat.
 *
 * One active seat per student, enforced server-side. The claim
 * itself is an atomic findOneAndUpdate on `occupiedBy: null`,
 * sorted by seat number, so concurrent students never collide.
 */
router.post("/take", authMiddleware, async (req, res) => {
  await bootstrapIfEmpty();

  const existing = await Seat.findOne({ occupiedBy: req.user._id });
  if (existing) {
    throw ApiError.conflict(`You already have seat ${existing.seatNumber}`);
  }

  const claimed = await Seat.findOneAndUpdate(
    { occupiedBy: null },
    { occupiedBy: req.user._id, occupiedAt: new Date() },
    { sort: { seatNumber: 1 }, new: true }
  );
  if (!claimed) {
    throw ApiError.conflict("No free seats right now");
  }

  const data = await snapshot();
  emitSeatUpdate(data);
  res.json(data);
});

/**
 * POST /api/seats/leave — release a seat.
 *
 * Students release their own seat (the "Done eating" button).
 * Staff and admins may additionally free a specific seat by
 * number, which covers forgotten seats.
 */
router.post("/leave", authMiddleware, async (req, res) => {
  await bootstrapIfEmpty();

  let seat = null;

  if (req.user.role === "admin" || req.user.role === "staff") {
    const number = req.body?.seatNumber;
    if (number !== undefined) {
      seat = await Seat.findOne({
        seatNumber: v.quantity(number, {
          field: "seatNumber",
          min: 1,
          max: 100000,
        }),
      });
      if (!seat) throw ApiError.notFound("Seat not found");
    }
  }

  if (!seat) {
    seat = await Seat.findOne({ occupiedBy: req.user._id });
    if (!seat) throw ApiError.conflict("You do not have a seat");
  }

  seat.occupiedBy = null;
  seat.occupiedAt = null;
  await seat.save();

  const data = await snapshot();
  emitSeatUpdate(data);
  res.json(data);
});

/**
 * PUT /api/seats/capacity — admin: grow or shrink the capacity.
 *
 * Growing appends seats; shrinking removes only free seats and is
 * refused while a seat above the new capacity is still occupied.
 */
router.put("/capacity", authMiddleware, adminMiddleware, async (req, res) => {
  const capacity = v.quantity(req.body?.capacity, {
    field: "capacity",
    min: 1,
    max: 10000,
  });

  const blocked = await Seat.findOne({
    occupiedBy: { $ne: null },
    seatNumber: { $gt: capacity },
  })
    .select("seatNumber")
    .lean();
  if (blocked) {
    throw ApiError.conflict(
      `Seat ${blocked.seatNumber} is still occupied — free it before shrinking`
    );
  }

  const highest = await currentCapacity();
  if (capacity > highest) {
    await ensureCapacity(capacity);
  } else if (capacity < highest) {
    await Seat.deleteMany({ seatNumber: { $gt: capacity }, occupiedBy: null });
  }

  const data = await snapshot();
  emitSeatUpdate(data);
  res.json(data);
});

module.exports = router;
