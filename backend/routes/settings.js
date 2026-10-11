const express = require("express");
const Settings = require("../models/Settings");
const { authMiddleware, adminMiddleware } = require("../middleware/authMiddleware");
const ApiError = require("../utils/ApiError");
const v = require("../utils/validators");

const router = express.Router();

/**
 * GET /api/settings — the canteen tunables
 * (average prep time, pre-order slot capacity).
 */
router.get("/", authMiddleware, async (req, res) => {
  res.json(await Settings.load());
});

/**
 * PUT /api/settings — admin: tune the canteen.
 *
 * Both fields are optional; only the ones present are updated.
 */
router.put("/", authMiddleware, adminMiddleware, async (req, res) => {
  const body = v.object(req.body);
  const set = {};
  if (body.avgPrepMinutes !== undefined) {
    set.avgPrepMinutes = v.quantity(body.avgPrepMinutes, {
      field: "avgPrepMinutes",
      min: 1,
      max: 120,
    });
  }
  if (body.slotCapacity !== undefined) {
    set.slotCapacity = v.quantity(body.slotCapacity, {
      field: "slotCapacity",
      min: 1,
      max: 500,
    });
  }
  if (Object.keys(set).length === 0) {
    throw ApiError.badRequest("Nothing to update");
  }

  const updated = await Settings.findOneAndUpdate(
    { _id: "canteen" },
    { $set: set },
    { new: true, upsert: true, runValidators: true }
  );
  res.json(updated);
});

module.exports = router;
