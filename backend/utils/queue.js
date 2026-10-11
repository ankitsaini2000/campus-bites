const Order = require("../models/Order");

/** Statuses that hold a place in the live prep queue. */
const QUEUE_STATUSES = ["Pending", "Accepted", "Preparing"];

/**
 * The active prep queue in arrival order.
 */
async function activeQueue() {
  return Order.find({ status: { $in: QUEUE_STATUSES } })
    .sort({ date: 1 })
    .select("_id date scheduledFor")
    .lean();
}

/**
 * Attach `queuePosition` and `etaMinutes` to each order.
 *
 * Position is 1-based in arrival order among active orders.
 * The ETA assumes the kitchen works strictly in arrival
 * order and needs `avgPrepMinutes` per order; time already
 * spent waiting is subtracted, floored at one minute.
 */
async function withQueueInfo(orders, settings) {
  const queue = await activeQueue();
  const positionById = new Map(
    queue.map((o, i) => [o._id.toString(), i + 1])
  );
  const now = Date.now();

  return orders.map((o) => {
    const plain = typeof o.toObject === "function" ? o.toObject() : o;
    const position = positionById.get(String(plain._id)) || null;
    plain.queuePosition = position;
    if (position != null) {
      const elapsedMin = Math.max(
        0,
        (now - new Date(plain.date).getTime()) / 60000
      );
      plain.etaMinutes = Math.max(
        1,
        Math.ceil(position * settings.avgPrepMinutes - elapsedMin)
      );
    } else {
      plain.etaMinutes = null;
    }
    return plain;
  });
}

module.exports = { activeQueue, withQueueInfo, QUEUE_STATUSES };
