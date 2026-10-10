const mongoose = require("mongoose");

/**
 * Canteen announcement.
 *
 * Authored by an administrator, read by every signed-in user.
 * `active` and `expiresAt` control visibility; the /active
 * endpoint filters both, so expired notices never resurface.
 */
const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    body: { type: String, required: true, trim: true, maxlength: 2000 },

    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    active: { type: Boolean, default: true },
    pinned: { type: Boolean, default: false },
    // When set, the announcement stops appearing after this time.
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);

announcementSchema.index({ active: 1, pinned: -1, createdAt: -1 });

const Announcement = mongoose.model("Announcement", announcementSchema);

module.exports = Announcement;
