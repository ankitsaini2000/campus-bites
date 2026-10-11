import React, { useCallback, useEffect, useState } from "react";
import { FaChair } from "react-icons/fa";
import api from "../api";
import { createRealtimeClient } from "../realtime";

/**
 * Seat management (administrators).
 *
 * Capacity editor plus the live seat map. An admin
 * (or staff) can free a forgotten seat directly —
 * students can only release a seat they hold.
 */
export default function SeatsPanel() {
  const [map, setMap] = useState(null);
  const [capacity, setCapacity] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [liveStatus, setLiveStatus] = useState("connecting");

  const refresh = useCallback(async () => {
    try {
      const res = await api.get("/seats");
      setMap(res.data || null);
      setCapacity(String((res.data || {}).capacity ?? ""));
      setError("");
    } catch (err) {
      setError(err.message || "Could not load the seat map");
    }
  }, []);

  useEffect(() => {
    refresh();
    // The seat room is joined by the server for every
    // authenticated socket, so no explicit subscription
    // is needed — just listen and re-read.
    const client = createRealtimeClient({
      onStatusChange: setLiveStatus,
      onSeatsChanged: () => refresh(),
    });
    return () => client.close();
  }, [refresh]);

  const saveCapacity = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.put("/seats/capacity", {
        capacity: Number(capacity),
      });
      setMap(res.data);
      setCapacity(String(res.data.capacity));
      setError("");
    } catch (err) {
      setError(err.message || "Could not change the capacity");
    } finally {
      setSaving(false);
    }
  };

  const freeSeat = async (seatNumber) => {
    setBusy(true);
    try {
      const res = await api.post("/seats/leave", { seatNumber });
      setMap(res.data);
      setError("");
    } catch (err) {
      setError(err.message || "Could not free the seat");
    } finally {
      setBusy(false);
    }
  };

  const occupied = map ? map.occupied : 0;
  const total = map ? map.capacity : 0;

  return (
    <section data-testid="seats-panel">
      {/* Capacity editor */}
      <div className="rounded-2xl bg-white shadow-lift p-6 mb-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-xl font-extrabold text-ink flex items-center gap-2">
              <FaChair className="text-brand-500" /> Dining Capacity
            </h2>
            <p className="text-sm text-ink-mute mt-1">
              Add or remove seats. Shrinking is refused while a seat above
              the new total is still occupied.
            </p>
          </div>
          <form onSubmit={saveCapacity} className="flex items-end gap-2">
            <label className="text-xs font-semibold text-ink-soft">
              Total seats
              <input
                type="number"
                required
                min={1}
                max={10000}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                className="block mt-1 w-28 p-2.5 rounded-xl border border-stone-200 bg-stone-50 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
              />
            </label>
            <button
              type="submit"
              disabled={saving}
              className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl font-semibold text-sm"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </form>
        </div>

        {error && (
          <p
            role="alert"
            className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3"
          >
            {error}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm font-semibold">
          <span className="px-3 py-1 rounded-full bg-green-50 text-green-700">
            {map ? map.available : "–"} free
          </span>
          <span className="px-3 py-1 rounded-full bg-stone-100 text-stone-600">
            {occupied}/{total} occupied
          </span>
          <span
            className={`inline-flex items-center gap-2 px-3 py-1 rounded-full ${
              liveStatus === "connected"
                ? "bg-green-50 text-green-700"
                : "bg-stone-100 text-stone-500"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                liveStatus === "connected" ? "bg-green-500" : "bg-stone-400"
              }`}
            />
            {liveStatus === "connected" ? "Live" : liveStatus}
          </span>
        </div>
      </div>

      {/* Seat map */}
      <div className="rounded-2xl bg-white shadow-lift p-6">
        <h3 className="text-lg font-extrabold text-ink mb-4">Seat Map</h3>
        {map ? (
          <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-3">
            {map.seats.map((s) => (
              <div
                key={s.seatNumber}
                className={`rounded-xl border p-3 min-h-[84px] flex flex-col ${
                  s.occupied ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-sm text-ink">
                    Seat {s.seatNumber}
                  </span>
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      s.occupied ? "bg-red-500" : "bg-green-500"
                    }`}
                    aria-label={s.occupied ? "Occupied" : "Free"}
                  />
                </div>
                {s.occupied ? (
                  <div className="mt-2 flex-1 flex flex-col justify-between gap-2">
                    <p
                      className="text-xs font-semibold text-ink truncate"
                      title={s.occupant?.name}
                    >
                      {s.occupant?.name || "Occupied"}
                    </p>
                    <button
                      type="button"
                      onClick={() => freeSeat(s.seatNumber)}
                      disabled={busy}
                      className="text-[11px] bg-white border border-red-200 text-red-600 hover:bg-red-100 rounded-lg px-2 py-1 font-semibold disabled:opacity-50"
                    >
                      Free seat
                    </button>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-green-700">Free</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-mute">Loading the seat map…</p>
        )}
      </div>
    </section>
  );
}
