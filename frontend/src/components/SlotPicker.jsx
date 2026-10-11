import React, { useMemo, useState } from "react";

/**
 * Pre-order window picker.
 *
 * The parent fetches the bookable windows in the
 * background (so the picker opens instantly — the
 * API may have been idle long enough to spin
 * down), then the student picks a day and a
 * window. Only windows that still have room are
 * offered; picking "Now" clears the selection and
 * places a live order.
 */
export default function SlotPicker({
  slots = [],
  loading,
  selected,
  onSelect,
}) {
  const [day, setDay] = useState(null);

  /** Slots grouped by date, oldest day first. */
  const days = useMemo(() => {
    const map = new Map();
    for (const s of slots) {
      if (!map.has(s.date)) map.set(s.date, []);
      map.get(s.date).push(s);
    }
    return [...map.entries()];
  }, [slots]);

  /** The day currently shown (defaults to the first). */
  const activeDay = day || days[0]?.[0];
  const daySlots =
    days.find(([date]) => date === activeDay)?.[1] || [];

  const labelFor = (date) => {
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const key = (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (date === key(today)) return "Today";
    if (date === key(tomorrow)) return "Tomorrow";
    const d = new Date(`${date}T12:00:00`);
    return d.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div data-testid="slot-picker">
      <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
        {days.map(([date]) => (
          <button
            key={date}
            type="button"
            onClick={() => setDay(date)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap ${
              date === activeDay
                ? "bg-brand-500 text-white"
                : "bg-stone-100 text-stone-700 hover:bg-stone-200"
            }`}
          >
            {labelFor(date)}
          </button>
        ))}
      </div>

      {loading && (
        <p className="text-sm text-ink-mute mb-2">
          Loading pickup windows…
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {daySlots.map((s) => {
          const full = s.available <= 0;
          const isSelected =
            selected && String(selected._id) === String(s._id);
          return (
            <button
              key={s._id}
              type="button"
              disabled={full}
              onClick={() => onSelect(isSelected ? null : s)}
              data-testid="slot-option"
              className={`px-4 py-2 rounded-xl text-sm font-semibold border ${
                isSelected
                  ? "bg-brand-500 border-brand-500 text-white"
                  : full
                    ? "bg-stone-50 border-stone-200 text-stone-400 cursor-not-allowed"
                    : "bg-white border-stone-200 text-ink-soft hover:border-brand-300"
              }`}
            >
              {s.start} – {s.end}
              <span className="block text-[10px] font-normal opacity-80">
                {full
                  ? "Full"
                  : `${s.available} of ${s.capacity} left`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
