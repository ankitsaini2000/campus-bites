const express = require("express");
const GroupOrder = require("../models/GroupOrder");
const Order = require("../models/Order");
const Food = require("../models/FoodItem");
const Seat = require("../models/Seat");
const TimeSlot = require("../models/TimeSlot");
const { authMiddleware } = require("../middleware/authMiddleware");
const ApiError = require("../utils/ApiError");
const v = require("../utils/validators");
const inventory = require("../services/inventory");
const { emitOrderUpdate } = require("../realtime");
const { validateSlot, slotDateTime } = require("./slots");
const { bootstrapIfEmpty } = require("../utils/seats");

const router = express.Router();

const MAX_MEMBERS = 8;
const MAX_LINES = 30;
const MAX_QTY = 20;

// No 0/O/1/I so codes read cleanly aloud.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function makeCode() {
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

function assertMember(group, user) {
  const isMember =
    String(group.host) === String(user._id) ||
    group.members.some((m) => String(m) === String(user._id));
  if (!isMember) throw ApiError.forbidden("You are not part of this table");
}

/**
 * Attach viewer-relative flags so the UI never has to
 * know its own id: `isHost` drives the checkout and
 * close buttons.
 */
function decorate(group, user) {
  const plain = typeof group.toObject === "function" ? group.toObject() : group;
  const hostId = plain.host?._id
    ? String(plain.host._id)
    : String(plain.host);
  plain.isHost = hostId === String(user._id);
  return plain;
}

/** Claim the lowest-numbered free seat, if one is free. */
async function claimSeatFor(userId) {
  // The seat map may never have been read before (a fresh
  // canteen); make sure the seats exist before claiming.
  await bootstrapIfEmpty();
  const claimed = await Seat.findOneAndUpdate(
    { occupiedBy: null },
    { occupiedBy: userId, occupiedAt: new Date() },
    { sort: { seatNumber: 1 }, new: true }
  );
  return claimed ? claimed.seatNumber : null;
}

/** Release the seat a table claimed automatically. */
async function releaseSeatIfAuto(group) {
  if (!group.seatAuto || !group.seatNumber) return;
  await Seat.findOneAndUpdate(
    { seatNumber: group.seatNumber, occupiedBy: group.host },
    { occupiedBy: null, occupiedAt: null }
  );
}

/**
 * POST /api/groups — open a table order.
 *
 * The host's seat is claimed automatically when one is free,
 * so "sit down and order for the table" is one step.
 */
router.post("/", authMiddleware, async (req, res) => {
  const body = v.object(req.body || {});

  let seatNumber = null;
  let seatAuto = false;
  if (body.seatNumber !== undefined && body.seatNumber !== null) {
    seatNumber = v.quantity(body.seatNumber, {
      field: "seatNumber",
      min: 1,
      max: 100000,
    });
  } else {
    const mine = await Seat.findOne({ occupiedBy: req.user._id })
      .select("seatNumber")
      .lean();
    if (mine) {
      seatNumber = mine.seatNumber;
    } else {
      seatNumber = await claimSeatFor(req.user._id);
      seatAuto = seatNumber !== null;
    }
  }

  const slot = body.slotId
    ? await validateSlot(v.objectId(body.slotId, "slotId"))
    : null;

  let code;
  do {
    code = makeCode();
  } while (await GroupOrder.findOne({ code }));

  const created = await GroupOrder.create({
    code,
    host: req.user._id,
    members: [req.user._id],
    seatNumber,
    seatAuto,
    slot: slot ? slot._id : null,
    items: [],
    status: "open",
  });

  res.status(201).json(decorate(created, req.user));
});

/**
 * POST /api/groups/join — join an open table by code.
 */
router.post("/join", authMiddleware, async (req, res) => {
  const body = v.object(req.body);
  const code = (
    v.optionalString(body.code, { field: "code", max: 8 }) || ""
  ).toUpperCase();
  if (!code) throw ApiError.badRequest("A table code is required");

  const group = await GroupOrder.findOne({ code });
  if (!group || group.status !== "open") {
    throw ApiError.notFound("No open table with that code");
  }

  // Idempotent: rejoining your own table is a no-op.
  if (
    String(group.host) === String(req.user._id) ||
    group.members.some((m) => String(m) === String(req.user._id))
  ) {
    return res.json(decorate(group, req.user));
  }
  if (group.members.length >= MAX_MEMBERS) {
    throw ApiError.conflict(`A table seats at most ${MAX_MEMBERS}`);
  }

  group.members.push(req.user._id);
  await group.save();
  res.json(
    decorate(
      await GroupOrder.findById(group._id).populate("host", "name"),
      req.user
    )
  );
});

/**
 * GET /api/groups/mine — my tables, most recent first.
 */
router.get("/mine", authMiddleware, async (req, res) => {
  const groups = await GroupOrder.find({
    $or: [{ host: req.user._id }, { members: req.user._id }],
  })
    .sort({ createdAt: -1 })
    .limit(20)
    .populate("host", "name")
    .populate("members", "name")
    .populate("orderId", "status total");
  res.json(groups.map((g) => decorate(g, req.user)));
});

/**
 * GET /api/groups/:id — table details (members only).
 */
router.get("/:id", authMiddleware, async (req, res) => {
  const group = await GroupOrder.findById(
    v.objectId(req.params.id, "group id")
  )
    .populate("host", "name")
    .populate("members", "name")
    .populate("orderId", "status total");
  if (!group) throw ApiError.notFound("Table order not found");
  assertMember(group, req.user);
  res.json(decorate(group, req.user));
});

/**
 * POST /api/groups/:id/items — add a dish to the shared bill.
 */
router.post("/:id/items", authMiddleware, async (req, res) => {
  const group = await GroupOrder.findById(
    v.objectId(req.params.id, "group id")
  );
  if (!group) throw ApiError.notFound("Table order not found");
  assertMember(group, req.user);
  if (group.status !== "open") {
    throw ApiError.conflict("This table order is no longer open");
  }

  const body = v.object(req.body);
  const foodId = v.objectId(body.food, "food");
  const qty = v.quantity(body.quantity, {
    field: "quantity",
    min: 1,
    max: MAX_QTY,
  });

  const food = await Food.findById(foodId);
  if (!food) throw ApiError.notFound("Food item not found");
  if (food.available === false) {
    throw ApiError.conflict(`"${food.name}" is currently unavailable`);
  }
  const sellable = food.sellableQty();
  if (sellable !== Infinity && sellable < qty) {
    throw ApiError.conflict(
      sellable <= 0
        ? `"${food.name}" is sold out`
        : `Only ${sellable} of "${food.name}" left`
    );
  }

  // Same person + same dish merge into one line.
  const existing = group.items.find(
    (i) =>
      String(i.food) === String(foodId) &&
      String(i.addedBy) === String(req.user._id)
  );
  if (existing) {
    if (existing.quantity + qty > MAX_QTY) {
      throw ApiError.badRequest(`Maximum ${MAX_QTY} of any one item`);
    }
    existing.quantity += qty;
  } else {
    if (group.items.length >= MAX_LINES) {
      throw ApiError.conflict("This table order is full");
    }
    group.items.push({
      food: food._id,
      name: food.name,
      price: v.roundMoney(food.price),
      quantity: qty,
      addedBy: req.user._id,
      addedByName: req.user.name,
    });
  }

  await group.save();
  res.json(decorate(group, req.user));
});

/**
 * DELETE /api/groups/:id/items/:index — remove a line while
 * the table is open. Only whoever added it (or the host).
 */
router.delete("/:id/items/:index", authMiddleware, async (req, res) => {
  const group = await GroupOrder.findById(
    v.objectId(req.params.id, "group id")
  );
  if (!group) throw ApiError.notFound("Table order not found");
  assertMember(group, req.user);
  if (group.status !== "open") {
    throw ApiError.conflict("This table order is no longer open");
  }

  const index = v.quantity(req.params.index, {
    field: "item index",
    min: 0,
    max: 999,
  });
  const line = group.items[index];
  if (!line) throw ApiError.notFound("Item not found in this table order");

  const isHost = String(group.host) === String(req.user._id);
  if (!isHost && String(line.addedBy) !== String(req.user._id)) {
    throw ApiError.forbidden(
      "Only the person who added this item (or the host) can remove it"
    );
  }

  group.items.splice(index, 1);
  await group.save();
  res.json(decorate(group, req.user));
});

/**
 * POST /api/groups/:id/checkout — the host turns the table
 * into a real order.
 *
 * Every line is re-read from the database: prices may have
 * drifted since the dish was added, and stock is reserved
 * atomically at checkout exactly like a personal order.
 */
router.post("/:id/checkout", authMiddleware, async (req, res) => {
  const group = await GroupOrder.findById(
    v.objectId(req.params.id, "group id")
  );
  if (!group) throw ApiError.notFound("Table order not found");
  if (String(group.host) !== String(req.user._id)) {
    throw ApiError.forbidden("Only the host can check out the table order");
  }
  if (group.status !== "open") {
    throw ApiError.conflict("This table order is already closed");
  }
  if (group.items.length === 0) {
    throw ApiError.conflict("The table order is empty");
  }

  const foodIds = [...new Set(group.items.map((i) => String(i.food)))];
  const foods = await Food.find({ _id: { $in: foodIds } });
  if (foods.length !== foodIds.length) {
    throw ApiError.conflict("An item in this table order no longer exists");
  }
  const byId = new Map(foods.map((f) => [f._id.toString(), f]));

  // The full slot document (the group only stores its id).
  const slot = group.slot
    ? await TimeSlot.findById(group.slot)
    : null;

  const items = [];
  let subtotal = 0;
  let maxPrep = 0;

  for (const foodId of foodIds) {
    const food = byId.get(foodId);
    if (food.available === false) {
      throw ApiError.conflict(`"${food.name}" is currently unavailable`);
    }
    const wanted = group.items
      .filter((i) => String(i.food) === foodId)
      .reduce((sum, i) => sum + i.quantity, 0);
    const sellable = food.sellableQty();
    if (sellable !== Infinity && sellable < wanted) {
      throw ApiError.conflict(
        sellable <= 0
          ? `"${food.name}" is sold out`
          : `Only ${sellable} of "${food.name}" left`
      );
    }

    const unitPrice = v.roundMoney(food.price);
    subtotal = v.roundMoney(subtotal + unitPrice * wanted);
    maxPrep = Math.max(maxPrep, food.prepTimeMinutes || 0);

    items.push({
      food: food._id,
      name: food.name,
      price: unitPrice,
      quantity: wanted,
      inventoryTracked: food.trackInventory === true,
      reservedQty: food.trackInventory === true ? wanted : null,
    });
  }

  const order = await Order.create({
    student: group.host,
    items,
    subtotal,
    discount: 0,
    promo: null,
    total: v.roundMoney(subtotal),
    status: "Pending",
    statusHistory: [
      {
        status: "Pending",
        from: null,
        at: new Date(),
        by: group.host,
        role: req.user.role,
        reason: null,
      },
    ],
    statusHistoryTotal: 1,
    estimatedReadyAt: maxPrep
      ? new Date(Date.now() + maxPrep * 60 * 1000)
      : null,
    // The kitchen delivers to the table's seat, when it has one.
    pickupSlot: group.seatNumber ? `Seat ${group.seatNumber}` : null,
    notes: "Table order",
    slot: slot ? slot._id : null,
    scheduledFor: slot ? slotDateTime(slot) : null,
    group: group._id,
  });

  try {
    await inventory.reserveOrder({ order, items, actor: req.user });
  } catch (err) {
    await Order.deleteOne({ _id: order._id }).catch(() => {});
    if (err instanceof inventory.InventoryError) {
      throw ApiError.conflict(err.message);
    }
    throw err;
  }

  if (items.some((i) => i.inventoryTracked)) {
    await Order.updateOne(
      { _id: order._id },
      { $set: { "items.$[el].stockReserved": true } },
      { arrayFilters: [{ "el.inventoryTracked": true }] }
    ).catch(() => {});
  }

  group.status = "checkedout";
  group.orderId = order._id;
  await group.save();

  emitOrderUpdate({
    orderId: order._id,
    studentId: group.host,
    status: order.status,
    previousStatus: null,
    at: new Date(),
  });

  const fresh = await GroupOrder.findById(group._id)
    .populate("host", "name")
    .populate("members", "name")
    .populate("orderId", "status total");

  res.status(201).json({
    group: decorate(fresh, req.user),
    order,
  });
});

/**
 * POST /api/groups/:id/leave — leave the table.
 * The host leaving closes the table (and releases an
 * auto-claimed seat).
 */
router.post("/:id/leave", authMiddleware, async (req, res) => {
  const group = await GroupOrder.findById(
    v.objectId(req.params.id, "group id")
  );
  if (!group) throw ApiError.notFound("Table order not found");
  assertMember(group, req.user);

  if (String(group.host) === String(req.user._id)) {
    group.status = "closed";
    await releaseSeatIfAuto(group);
    await group.save();
  } else {
    group.members = group.members.filter(
      (m) => String(m) !== String(req.user._id)
    );
    await group.save();
  }
  res.json(decorate(group, req.user));
});

/**
 * POST /api/groups/:id/close — host: discard the table
 * before checkout.
 */
router.post("/:id/close", authMiddleware, async (req, res) => {
  const group = await GroupOrder.findById(
    v.objectId(req.params.id, "group id")
  );
  if (!group) throw ApiError.notFound("Table order not found");
  if (String(group.host) !== String(req.user._id)) {
    throw ApiError.forbidden("Only the host can close this table order");
  }
  if (group.status === "open") {
    group.status = "closed";
    await releaseSeatIfAuto(group);
    await group.save();
  }
  res.json(decorate(group, req.user));
});

module.exports = router;
module.exports.MAX_MEMBERS = MAX_MEMBERS;
module.exports.MAX_LINES = MAX_LINES;
