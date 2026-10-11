import React, { useCallback, useEffect, useState } from "react";
import { FaCog } from "react-icons/fa";
import api from "../api";

/**
 * Canteen settings (administrators).
 *
 * Average prep time drives the live ETAs; the slot
 * capacity limits how many orders share a pre-order
 * window. Both apply to newly created windows.
 */
export default function SettingsPanel() {
  const [settings, setSettings] = useState(null);
  const [avg, setAvg] = useState("");
  const [cap, setCap] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get("/settings");
      setSettings(res.data);
      setAvg(String(res.data.avgPrepMinutes));
      setCap(String(res.data.slotCapacity));
      setError("");
    } catch (err) {
      setError(err.message || "Could not load the settings");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await api.put("/settings", {
        avgPrepMinutes: Number(avg),
        slotCapacity: Number(cap),
      });
      setSettings(res.data);
      setError("");
    } catch (err) {
      setError(err.message || "Could not save the settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section data-testid="settings-panel">
      <div className="rounded-2xl bg-white shadow-lift p-6">
        <h2 className="text-xl font-extrabold text-ink flex items-center gap-2 mb-4">
          <FaCog className="text-brand-500" /> Canteen Settings
        </h2>

        {error && (
          <p
            role="alert"
            className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3"
          >
            {error}
          </p>
        )}

        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-ink-soft">
            Average prep time (minutes per order)
            <input
              type="number"
              required
              min={1}
              max={120}
              value={avg}
              onChange={(e) => setAvg(e.target.value)}
              className="mt-1 w-full p-2.5 rounded-xl border border-stone-200 bg-stone-50 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
            />
            <span className="block text-xs text-ink-mute font-normal mt-1">
              Drives the &quot;ready in ~N min&quot; ETAs on the
              student dashboard and kitchen board.
            </span>
          </label>

          <label className="block text-sm font-semibold text-ink-soft">
            Orders per pre-order window
            <input
              type="number"
              required
              min={1}
              max={500}
              value={cap}
              onChange={(e) => setCap(e.target.value)}
              className="mt-1 w-full p-2.5 rounded-xl border border-stone-200 bg-stone-50 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
            />
            <span className="block text-xs text-ink-mute font-normal mt-1">
              How many orders may share one 30-minute pickup
              window. Applies to newly opened windows.
            </span>
          </label>

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-semibold text-sm"
            >
              {saving ? "Saving…" : "Save settings"}
            </button>
          </div>
        </form>

        {settings && (
          <p className="text-xs text-ink-mute mt-4">
            Current: {settings.avgPrepMinutes} min/order ·{" "}
            {settings.slotCapacity} orders per window.
          </p>
        )}
      </div>
    </section>
  );
}
