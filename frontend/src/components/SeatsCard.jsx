import React from "react";
import { FaChair, FaCheckCircle, FaSignOutAlt } from "react-icons/fa";

/**
 * Live canteen seat map (student view).
 *
 * The parent owns the data and the actions; this card is
 * purely presentational. Seat squares are green when free
 * and red when taken, with the signed-in student's own
 * seat highlighted in the brand colour.
 */
export default function SeatsCard({ seats, mySeat, onTake, onLeave, busy }) {
  const occupied = seats ? seats.occupied : 0;
  const capacity = seats ? seats.capacity : 0;

  return (
    <section className="rounded-2xl bg-white shadow-lift p-6" data-testid="seats-card">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-xl font-extrabold text-ink flex items-center gap-2">
          <FaChair className="text-brand-500" /> Canteen Seats
        </h2>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="px-3 py-1 rounded-full bg-green-50 text-green-700">
            {seats ? seats.available : "–"} free
          </span>
          <span className="px-3 py-1 rounded-full bg-stone-100 text-stone-600">
            {occupied}/{capacity} occupied
          </span>
        </div>
      </div>

      {seats ? (
        <>
          <div
            className="grid grid-cols-5 sm:grid-cols-8 lg:grid-cols-10 gap-2 mb-4"
            aria-label="Seat map"
          >
            {seats.seats.map((s) => {
              const mine = mySeat !== null && s.seatNumber === mySeat;
              return (
                <div
                  key={s.seatNumber}
                  title={
                    s.occupied
                      ? `Seat ${s.seatNumber} — ${s.occupant?.name || "occupied"}`
                      : `Seat ${s.seatNumber} — free`
                  }
                  className={`aspect-square rounded-lg flex items-center justify-center text-xs font-bold border ${
                    mine
                      ? "bg-brand-100 text-brand-700 border-brand-400"
                      : s.occupied
                        ? "bg-red-50 text-red-500 border-red-200"
                        : "bg-green-50 text-green-600 border-green-200"
                  }`}
                >
                  {s.seatNumber}
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {mySeat !== null ? (
              <button
                type="button"
                onClick={onLeave}
                disabled={busy}
                className="flex items-center bg-white text-brand-700 hover:bg-brand-50 border border-brand-200 px-4 py-2 rounded-full shadow-sm font-semibold text-sm disabled:opacity-50"
              >
                <FaSignOutAlt className="mr-1.5" /> Done — leave seat {mySeat}
              </button>
            ) : (
              <button
                type="button"
                onClick={onTake}
                disabled={busy || seats.available === 0}
                className="flex items-center bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-full shadow-sm font-semibold text-sm disabled:opacity-50"
              >
                <FaCheckCircle className="mr-1.5" /> Take a seat
              </button>
            )}
            {mySeat !== null && (
              <p className="text-sm text-ink-mute">
                You&apos;re on seat {mySeat} — it&apos;s yours until you press done.
              </p>
            )}
          </div>
        </>
      ) : (
        <p className="text-sm text-ink-mute">Loading the seat map…</p>
      )}
    </section>
  );
}
