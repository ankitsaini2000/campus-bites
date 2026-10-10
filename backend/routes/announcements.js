const express = require("express");
const Announcement = require("../models/Announcement");
const { authMiddleware, adminMiddleware } = require("../middleware/authMiddleware");
const ApiError = require("../utils/ApiError");
const v = require("../utils/validators");

/**
 * Canteen announcements.
 *
 * `GET /active` is open to every signed-in user (students see the
 * banner on their dashboard). Writing is ADMINISTRATOR ONLY.
 */

const router = express.Router();

/** Parse an optional expiry date from a request value. */
function parseDate(value, field) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw ApiError.badRequest(`${field} must be a valid date`);
  }
  return parsed;
}

/** Live announcements for every signed-in user: active and unexpired. */
router.get("/active", authMiddleware, async (req, res) => {
  const now = new Date();
  const list = await Announcement.find({
    active: true,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
  })
    .sort({ pinned: -1, createdAt: -1 })
    .limit(20)
    .populate("author", "name");
  res.json(list);
});

/** Admin: full list, including inactive and expired entries. */
router.get("/", authMiddleware, adminMiddleware, async (req, res) => {
  const list = await Announcement.find()
    .sort({ pinned: -1, createdAt: -1 })
    .limit(100)
    .populate("author", "name");
  res.json(list);
});

/** Admin: publish an announcement. */
router.post("/", authMiddleware, adminMiddleware, async (req, res) => {
  const body = v.object(req.body);

  const payload = {
    title: v.name(body.title, "title"),
    body: v.optionalString(body.body, { field: "body", max: 2000 }),
  };
  if (!payload.body) throw ApiError.badRequest("body is required");
  if (body.pinned !== undefined) {
    payload.pinned = v.boolean(body.pinned, "pinned");
  }
  if (body.active !== undefined) {
    payload.active = v.boolean(body.active, "active");
  }
  if (body.expiresAt !== undefined && body.expiresAt !== null) {
    payload.expiresAt = parseDate(body.expiresAt, "expiresAt");
  }
  payload.author = req.user._id;

  const announcement = await Announcement.create(payload);
  res.status(201).json(announcement);
});

/** Admin: edit or retire an announcement. */
router.patch("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  const id = v.objectId(req.params.id, "announcement id");
  const body = v.object(req.body);

  const announcement = await Announcement.findById(id);
  if (!announcement) throw ApiError.notFound("Announcement not found");

  const updates = {};
  if (body.title !== undefined) {
    updates.title = v.name(body.title, "title");
  }
  if (body.body !== undefined) {
    updates.body = v.optionalString(body.body, { field: "body", max: 2000 });
  }
  if (body.active !== undefined) {
    updates.active = v.boolean(body.active, "active");
  }
  if (body.pinned !== undefined) {
    updates.pinned = v.boolean(body.pinned, "pinned");
  }
  if (body.expiresAt !== undefined) {
    updates.expiresAt =
      body.expiresAt === null ? null : parseDate(body.expiresAt, "expiresAt");
  }

  const updated = await Announcement.findByIdAndUpdate(id, { $set: updates }, {
    new: true,
    runValidators: true,
  }).populate("author", "name");
  res.json(updated);
});

/** Admin: delete an announcement. */
router.delete("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  const id = v.objectId(req.params.id, "announcement id");
  const result = await Announcement.findByIdAndDelete(id);
  if (!result) throw ApiError.notFound("Announcement not found");
  res.json({ message: "Announcement deleted" });
});

module.exports = router;
