const express = require("express");
const Order = require("../models/Order");
const {
  authMiddleware,
  adminOrStaffMiddleware,
} = require("../middleware/authMiddleware");
const v = require("../utils/validators");

/**
 * Canteen analytics.
 *
 * READ-ONLY aggregate views over the existing orders collection —
 * no new state, no writes. Staff and administrators may read them;
 * students never see these endpoints.
 *
 * All money figures count COMPLETED orders only, so a revenue
 * number always reflects served food rather than pending carts.
 */

const router = express.Router();

/**
 * Pad a `$dateToString`-keyed series so charts have no gaps.
 * Days with no orders report zero rather than disappearing.
 */
function fillDays(entries, fromUtcMidnight, days) {
  const byKey = new Map(entries.map((e) => [e._id, e]));
  const out = [];
  const cursor = new Date(fromUtcMidnight);
  for (let i = 0; i < days; i += 1) {
    const key = cursor.toISOString().slice(0, 10);
    const found = byKey.get(key);
    out.push({
      date: key,
      orders: found ? found.orders : 0,
      revenue: found ? found.revenue : 0,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/**
 * One-call dashboard summary: totals, status split, revenue by day,
 * top-selling items and an hourly profile for the last `days` days.
 */
router.get("/summary", authMiddleware, adminOrStaffMiddleware, async (req, res) => {
  const days = v.quantity(req.query.days || 14, {
    field: "days",
    min: 1,
    max: 90,
  });

  // Aligned to UTC midnight so the `$dateToString` grouping keys and
  // the client-side gap-filling always agree, whatever the server TZ.
  const from = new Date();
  from.setUTCHours(0, 0, 0, 0);
  from.setUTCDate(from.getUTCDate() - (days - 1));

  const range = { date: { $gte: from } };
  // Completed orders only, for every revenue figure.
  const completedMoney = {
    $cond: [{ $eq: ["$status", "Completed"] }, "$total", 0],
  };

  const [totalsRaw, statusRaw, dailyRaw, itemsRaw, hoursRaw] =
    await Promise.all([
      Order.aggregate([
        { $match: range },
        {
          $group: {
            _id: null,
            orders: { $sum: 1 },
            revenue: { $sum: completedMoney },
            completed: {
              $sum: { $cond: [{ $eq: ["$status", "Completed"] }, 1, 0] },
            },
          },
        },
      ]),
      Order.aggregate([
        { $match: range },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Order.aggregate([
        { $match: range },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$date", timezone: "UTC" } },
            orders: { $sum: 1 },
            revenue: { $sum: completedMoney },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Order.aggregate([
        { $match: range },
        { $unwind: "$items" },
        {
          $group: {
            _id: "$items.name",
            quantity: { $sum: "$items.quantity" },
            revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
          },
        },
        { $sort: { quantity: -1 } },
        { $limit: 8 },
      ]),
      Order.aggregate([
        { $match: range },
        { $group: { _id: { $hour: "$date" }, orders: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
    ]);

  const totals = totalsRaw[0] || { orders: 0, revenue: 0, completed: 0 };

  const byStatus = {};
  for (const row of statusRaw) byStatus[row._id] = row.count;

  const hours = Array.from({ length: 24 }, (_, hour) => {
    const found = hoursRaw.find((h) => h._id === hour);
    return { hour, orders: found ? found.orders : 0 };
  });

  res.json({
    period: { days, from: from.toISOString() },
    totals: {
      orders: totals.orders,
      revenue: totals.revenue,
      completed: totals.completed,
      avgOrderValue:
        totals.completed > 0
          ? Math.round((totals.revenue / totals.completed) * 100) / 100
          : 0,
    },
    byStatus,
    revenueByDay: fillDays(dailyRaw, from, days),
    topItems: itemsRaw.map((r) => ({
      name: r._id,
      quantity: r.quantity,
      revenue: r.revenue,
    })),
    ordersByHour: hours,
  });
});

module.exports = router;
