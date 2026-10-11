import React, { useState } from "react";
import { FaStar, FaTimes } from "react-icons/fa";
import api from "../api";

/**
 * Rate a dish from a completed order.
 *
 * Stars are a plain 1–5 selector; the comment is
 * optional. The server verifies the completed order
 * before saving anything. `initialRating` presets
 * the selector when opened from a star row.
 */
export default function RatingModal({
  food,
  initialRating = 5,
  onClose,
  onRated,
}) {
  const [rating, setRating] = useState(initialRating);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await api.post(`/food/${food._id}/rating`, {
        rating,
        comment: comment.trim(),
      });
      onRated?.(food._id);
      onClose();
    } catch (err) {
      setError(err.message || "Could not save the rating");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      data-testid="rating-modal"
      role="dialog"
      aria-label={`Rate ${food.name}`}
    >
      <div className="bg-white rounded-2xl shadow-lift p-6 w-full max-w-sm">
        <div className="flex items-start justify-between mb-1">
          <h3 className="text-lg font-extrabold text-ink">
            Rate {food.name}
          </h3>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="text-ink-mute hover:text-ink"
          >
            <FaTimes />
          </button>
        </div>
        <p className="text-sm text-ink-mute mb-4">
          How was it? Ratings appear on the menu for everyone.
        </p>

        <div className="flex gap-1 mb-4" data-testid="rating-stars">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              aria-label={`${star} star${star > 1 ? "s" : ""}`}
              onClick={() => setRating(star)}
              className={`text-3xl transition-colors ${
                star <= rating
                  ? "text-amber-400 hover:text-amber-500"
                  : "text-stone-300 hover:text-stone-400"
              }`}
            >
              <FaStar />
            </button>
          ))}
        </div>

        <label className="block text-xs font-semibold text-ink-soft mb-1">
          Comment (optional)
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value.slice(0, 500))}
            rows={3}
            maxLength={500}
            placeholder="Tasty, quick, would order again…"
            className="mt-1 w-full p-2.5 rounded-xl border border-stone-200 bg-stone-50 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none text-sm resize-none"
          />
        </label>

        {error && (
          <p role="alert" className="text-sm text-red-600 mb-3">
            {error}
          </p>
        )}

        <div className="flex gap-2 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="flex-1 py-2.5 rounded-full bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-bold text-sm"
          >
            {busy ? "Saving…" : "Save rating"}
          </button>
        </div>
      </div>
    </div>
  );
}
