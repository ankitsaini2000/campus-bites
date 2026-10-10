import React, { useEffect, useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { FaSyncAlt, FaHistory, FaExclamationTriangle, FaBoxes, FaPlus } from "react-icons/fa";
import api from "../api";
import { createRealtimeClient } from "../realtime";

/**
 * Administrator inventory console.
 *
 * ADMINISTRATOR ONLY. The server enforces that; these controls are hidden
 * because they are not useful here, not because they are the security boundary.
 */

const STATE_FILTERS = [
  { key: "all", label: "All" },
  { key: "tracked", label: "Tracked" },
  { key: "untracked", label: "Untracked" },
  { key: "low", label: "Low stock" },
  { key: "out", label: "Out of stock" },
  { key: "ok", label: "Healthy" },
];

export default function InventoryPanel() {
  const [items, setItems] = useState([]);
  const [alerts, setAlerts] = useState(null);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [state, setState] = useState("all");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState(null);

  // Per-item adjustment draft.
  const [adjust, setAdjust] = useState({});

  // Movement history drawer.
  const [historyFor, setHistoryFor] = useState(null);
  const [history, setHistory] = useState([]);

  // Bulk restock modal.
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkReason, setBulkReason] = useState("");
  const [bulkQty, setBulkQty] = useState({});
  const [bulkBusy, setBulkBusy] = useState(false);

  const seenFoodIds = useRef(new Set());

  const loadItems = useCallback(async () => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (category) params.set("category", category);
    if (state !== "all") params.set("state", state);

    try {
      const res = await api.get(`/inventory?${params.toString()}`);
      setItems(res.data || []);
    } catch (err) {
      setError(err.message || "Could not load inventory");
    } finally {
      setLoading(false);
    }
  }, [search, category, state]);

  const loadAlerts = useCallback(async () => {
    try {
      const res = await api.get("/inventory/low-stock");
      setAlerts(res.data);
    } catch {
      // Alerts are supplementary; a failure must not break the panel.
    }
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  useEffect(() => {
    loadAlerts();
    api.get("/food/categories").then((r) => setCategories(r.data || [])).catch(() => {});
  }, [loadAlerts]);

  // Real-time stock notifications -> re-read authoritative state.
  useEffect(() => {
    const client = createRealtimeClient({
      onInventoryChanged: () => {
        loadItems();
        loadAlerts();
      },
    });
    client.subscribeToCanteen();
    return () => client.close();
  }, [loadItems, loadAlerts]);

  const refreshAll = async () => {
    setLoading(true);
    await Promise.all([loadItems(), loadAlerts()]);
  };

  const flash = (message) => {
    setNotice(message);
    setTimeout(() => setNotice(""), 4000);
  };

  const enableTracking = async (item, enabled) => {
    setError("");
    setBusyId(item._id);

    let stock;
    if (enabled) {
      const raw = window.prompt(
        `Starting stock for "${item.name}" (in ${item.unit || "servings"}):`,
        String(item.stock ?? 0)
      );
      if (raw === null) { setBusyId(null); return; }
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed < 0) {
        setError("Starting stock must be a whole number of zero or more");
        setBusyId(null);
        return;
      }
      stock = parsed;
    }

    try {
      await api.post(`/inventory/${item._id}/tracking`, {
        enabled,
        ...(stock !== undefined ? { stock } : {}),
      });
      flash(enabled ? `Inventory tracking enabled for ${item.name}` : `Tracking disabled for ${item.name}`);
      await refreshAll();
    } catch (err) {
      setError(err.message || "Could not change tracking");
    } finally {
      setBusyId(null);
    }
  };

  const applyAdjustment = async (item) => {
    setError("");
    const draft = adjust[item._id];
    if (!draft || draft.value === undefined || draft.value === "") {
      setError("Enter an adjustment amount first");
      return;
    }

    const value = Number(draft.value);
    if (!Number.isInteger(value) || value === 0) {
      setError("Adjustment must be a non-zero whole number");
      return;
    }
    if (!draft.reason || !draft.reason.trim()) {
      setError("A reason is required for every stock adjustment");
      return;
    }

    setBusyId(item._id);
    try {
      await api.post(`/inventory/${item._id}/adjust`, {
        delta: value,
        reason: draft.reason.trim(),
      });
      setAdjust((prev) => ({ ...prev, [item._id]: { value: "", reason: "" } }));
      flash(`Stock adjusted for ${item.name}`);
      await refreshAll();
    } catch (err) {
      setError(err.message || "Could not adjust stock");
    } finally {
      setBusyId(null);
    }
  };

  const toggleAvailability = async (item) => {
    setError("");
    setBusyId(item._id);
    try {
      await api.post(`/inventory/${item._id}/availability`, {
        available: item.available === false,
      });
      await refreshAll();
    } catch (err) {
      setError(err.message || "Could not change availability");
    } finally {
      setBusyId(null);
    }
  };

  const openHistory = async (item) => {
    setHistoryFor(item);
    setHistory([]);
    try {
      const res = await api.get(`/inventory/${item._id}/movements`);
      setHistory(res.data || []);
    } catch (err) {
      setError(err.message || "Could not load movement history");
    }
  };

  const ackAlerts = async () => {
    setError("");
    try {
      await api.post("/inventory/low-stock/ack", {});
      await loadAlerts();
      flash("Low-stock alerts acknowledged");
    } catch (err) {
      setError(err.message || "Could not acknowledge alerts");
    }
  };

  /** Apply the bulk restock: one shared reason, many items. */
  const applyBulk = async () => {
    setError("");
    const adjustments = Object.entries(bulkQty)
      .map(([foodId, raw]) => ({ foodId, qty: Number(raw) }))
      .filter((x) => Number.isInteger(x.qty) && x.qty > 0)
      .map((x) => ({ foodId: x.foodId, delta: x.qty }));

    if (adjustments.length === 0) {
      setError("Enter a quantity of at least 1 for at least one item.");
      return;
    }
    if (!bulkReason.trim()) {
      setError("A reason is required for stock adjustments");
      return;
    }

    setBulkBusy(true);
    try {
      const res = await api.post("/inventory/bulk", {
        adjustments,
        reason: bulkReason.trim(),
      });
      const failed = (res.data.results || []).filter((r) => !r.ok);
      flash(
        `Restocked ${res.data.applied} item(s)` +
          (failed.length ? ` · ${failed.length} failed (see below)` : "")
      );
      if (failed.length) {
        setError(
          failed.map((f) => `${f.foodId}: ${f.message}`).join(" · ")
        );
      }
      setBulkOpen(false);
      setBulkQty({});
      setBulkReason("");
      await refreshAll();
    } catch (err) {
      setError(err.message || "Bulk restock failed");
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-soft mb-10" data-testid="inventory-panel">
      <div className="flex justify-between items-center flex-wrap gap-3 mb-4">
        <h2 className="text-xl font-bold text-ink">Inventory</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setBulkOpen(true)}
            data-testid="bulk-restock"
            className="flex items-center bg-brand-100 hover:bg-brand-200 text-brand-800 px-4 py-2 rounded-full font-semibold text-sm"
          >
            <FaBoxes className="mr-2" /> Bulk Restock
          </button>
          <button
            type="button"
            onClick={refreshAll}
            data-testid="inventory-refresh"
            className="flex items-center bg-brand-100 hover:bg-brand-200 text-brand-800 px-4 py-2 rounded-full font-semibold text-sm"
          >
            <FaSyncAlt className="mr-2" /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" data-testid="inventory-error" className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" data-testid="inventory-notice" className="mb-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
          {notice}
        </p>
      )}

      {/* Low-stock alerts */}
      {alerts && alerts.counts.total > 0 && (
        <div
          className={`mb-4 rounded-xl p-3 border-2 ${
            alerts.counts.outOfStock > 0
              ? "bg-red-50 border-red-400"
              : "bg-amber-50 border-amber-400"
          }`}
          data-testid="low-stock-alerts"
          role="status"
        >
          <div className="flex justify-between items-center flex-wrap gap-2">
            <p className="font-semibold flex items-center text-ink">
              <FaExclamationTriangle className="mr-2 text-amber-600" />
              {alerts.counts.outOfStock > 0
                ? `${alerts.counts.outOfStock} out of stock, ${alerts.counts.low} low`
                : `${alerts.counts.low} item(s) at or below threshold`}
              {alerts.counts.unacknowledged > 0 && (
                <span className="ml-2 text-xs bg-red-600 text-white px-2 py-0.5 rounded-full">
                  {alerts.counts.unacknowledged} new
                </span>
              )}
            </p>
            {alerts.counts.unacknowledged > 0 && (
              <button
                type="button"
                onClick={ackAlerts}
                data-testid="ack-alerts"
                className="text-sm font-semibold text-brand-700 underline"
              >
                Acknowledge
              </button>
            )}
          </div>
          <ul className="mt-2 text-sm text-ink-soft space-y-0.5">
            {alerts.alerts.slice(0, 5).map((a) => (
              <li key={a._id}>
                <span className="font-medium">{a.name}</span> — {a.availableQty}{" "}
                {a.unit || "servings"} available
                {a.outOfStock && <span className="ml-2 text-red-600 font-semibold">out of stock</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search items"
          aria-label="Search inventory"
          data-testid="inventory-search"
          className="p-2.5 rounded-xl border border-stone-200 bg-stone-50 flex-1 min-w-[160px] focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Filter by category"
          data-testid="inventory-category"
          className="p-2.5 rounded-xl border border-stone-200 bg-stone-50"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <div className="flex flex-wrap gap-1" data-testid="inventory-state-filters">
          {STATE_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setState(f.key)}
              data-testid={`inv-state-${f.key}`}
              aria-pressed={state === f.key}
              className={`px-3 py-1.5 rounded-full text-sm font-semibold ${
                state === f.key ? "bg-brand-500 text-white" : "bg-brand-50 text-brand-800"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-ink-mute" data-testid="inventory-loading">Loading inventory...</p>
      ) : items.length === 0 ? (
        <p className="text-ink-mute">No items match these filters.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const tracked = item.trackInventory === true;
            const busy = busyId === item._id;
            const draft = adjust[item._id] || { value: "", reason: "" };

            return (
              <motion.div
                key={item._id}
                layout
                data-testid="inventory-row"
                data-food-id={item._id}
                data-available={item.availableQty ?? ""}
                className={`border rounded-2xl p-4 ${
                  item.outOfStock
                    ? "border-red-300 bg-red-50"
                    : item.lowStock
                    ? "border-amber-300 bg-amber-50"
                    : "border-stone-200"
                }`}
              >
                <div className="flex justify-between items-start gap-3 flex-wrap">
                  <div className="min-w-[180px] flex-1">
                    <p className="font-bold text-ink">{item.name}</p>
                    <p className="text-xs text-ink-mute">
                      {item.category} · ₹{item.price}
                      {item.available === false && (
                        <span className="ml-2 text-red-600 font-semibold">manually hidden</span>
                      )}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs">
                      <span
                        className={`px-2 py-0.5 rounded-full font-semibold ${
                          tracked ? "bg-brand-100 text-brand-800" : "bg-stone-100 text-stone-500"
                        }`}
                        data-testid={`tracking-${item._id}`}
                      >
                        {tracked ? "Tracked" : "Untracked"}
                      </span>
                      {tracked && (
                        <>
                          <span className="px-2 py-0.5 rounded-full bg-white border">
                            Stock <span data-testid={`stock-${item._id}`}>{item.stock}</span>
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-white border">
                            Reserved <span data-testid={`reserved-${item._id}`}>{item.reserved}</span>
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full font-semibold ${
                              item.outOfStock
                                ? "bg-red-600 text-white"
                                : item.lowStock
                                ? "bg-amber-500 text-white"
                                : "bg-green-100 text-green-700"
                            }`}
                            data-testid={`available-${item._id}`}
                          >
                            {item.outOfStock ? "Out of stock" : `${item.availableQty} available`}
                          </span>
                        </>
                      )}
                    </div>
                    {item.lastStockAdjustmentAt && (
                      <p className="text-[11px] text-ink-mute mt-1">
                        Last adjusted {new Date(item.lastStockAdjustmentAt).toLocaleString()}
                        {item.lastStockAdjustmentReason ? ` — ${item.lastStockAdjustmentReason}` : ""}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 items-start">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => enableTracking(item, !tracked)}
                      data-testid={`toggle-tracking-${item._id}`}
                      className="px-3 py-1.5 rounded-full text-sm font-semibold bg-brand-100 text-brand-800 disabled:opacity-50"
                    >
                      {tracked ? "Disable tracking" : "Enable tracking"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => toggleAvailability(item)}
                      data-testid={`toggle-availability-${item._id}`}
                      className="px-3 py-1.5 rounded-full text-sm font-semibold bg-stone-100 text-stone-700 disabled:opacity-50"
                    >
                      {item.available === false ? "Show on menu" : "Mark sold out"}
                    </button>
                    {tracked && (
                      <button
                        type="button"
                        onClick={() => openHistory(item)}
                        data-testid={`history-${item._id}`}
                        className="px-3 py-1.5 rounded-full text-sm font-semibold bg-sky-100 text-sky-700"
                      >
                        <FaHistory className="mr-1" /> History
                      </button>
                    )}
                  </div>
                </div>

                {tracked && (
                  <div className="flex flex-wrap gap-2 mt-3 items-end">
                    <label className="text-xs text-ink-soft">
                      Adjust
                      <input
                        type="number"
                        step="1"
                        value={draft.value}
                        onChange={(e) =>
                          setAdjust((p) => ({ ...p, [item._id]: { ...draft, value: e.target.value } }))
                        }
                        data-testid={`adjust-value-${item._id}`}
                        className="block p-2 border border-stone-200 rounded-lg w-28 mt-1"
                      />
                    </label>
                    <label className="text-xs text-ink-soft flex-1 min-w-[180px]">
                      Reason (required)
                      <input
                        type="text"
                        value={draft.reason}
                        onChange={(e) =>
                          setAdjust((p) => ({ ...p, [item._id]: { ...draft, reason: e.target.value } }))
                        }
                        data-testid={`adjust-reason-${item._id}`}
                        placeholder="e.g. Supplier delivery"
                        className="block p-2 border border-stone-200 rounded-lg w-full mt-1"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => applyAdjustment(item)}
                      data-testid={`apply-adjust-${item._id}`}
                      className="px-4 py-2 rounded-full text-sm font-semibold bg-brand-500 text-white disabled:opacity-50"
                    >
                      Apply
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        api
                          .post(`/inventory/${item._id}/adjust`, {
                            set: (item.stock ?? 0) + 1,
                            reason: draft.reason.trim() || "Quick +1",
                          })
                          .then(() => refreshAll())
                          .catch((err) => setError(err.message))
                      }
                      data-testid={`add-one-${item._id}`}
                      className="px-3 py-2 rounded-full text-sm font-semibold bg-green-100 text-green-700 disabled:opacity-50"
                    >
                      +1
                    </button>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Bulk restock modal */}
      {bulkOpen && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
          data-testid="bulk-restock-modal"
        >
          <div className="bg-white rounded-2xl shadow-lift max-w-2xl w-full max-h-[85vh] overflow-auto p-6">
            <div className="flex justify-between items-center mb-1">
              <h3 className="text-xl font-bold text-ink">Bulk restock</h3>
              <button
                type="button"
                onClick={() => setBulkOpen(false)}
                className="text-ink-mute hover:text-ink font-bold px-2"
                aria-label="Close bulk restock"
              >
                ✕
              </button>
            </div>
            <p className="text-sm text-ink-mute mb-4">
              Add servings to several tracked items at once. Every change is
              recorded in the movement ledger with one shared reason.
            </p>

            <label className="text-xs font-semibold text-ink-soft block mb-4">
              Reason (required)
              <input
                type="text"
                value={bulkReason}
                onChange={(e) => setBulkReason(e.target.value)}
                placeholder="e.g. Supplier delivery #A-104"
                data-testid="bulk-reason"
                className="block mt-1 w-full p-2.5 rounded-xl border border-stone-200 bg-stone-50 focus:border-brand-400 outline-none"
              />
            </label>

            <div className="space-y-2 max-h-72 overflow-auto pr-1" data-testid="bulk-items">
              {items.filter((i) => i.trackInventory).length === 0 ? (
                <p className="text-sm text-ink-mute">
                  No tracked items yet — enable tracking on an item first.
                </p>
              ) : (
                items
                  .filter((i) => i.trackInventory)
                  .map((item) => (
                    <div
                      key={item._id}
                      className="flex items-center justify-between gap-3 border border-stone-100 rounded-xl p-3"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-ink text-sm truncate">
                          {item.name}
                        </p>
                        <p className="text-xs text-ink-mute">
                          {item.stock} in stock · {item.reserved} reserved
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setBulkQty((p) => ({
                              ...p,
                              [item._id]: (Number(p[item._id]) || 0) + 10,
                            }))
                          }
                          className="w-7 h-7 rounded-full bg-brand-100 text-brand-800 font-bold hover:bg-brand-200"
                          aria-label={`Add 10 to ${item.name}`}
                        >
                          +10
                        </button>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={bulkQty[item._id] ?? ""}
                          onChange={(e) =>
                            setBulkQty((p) => ({
                              ...p,
                              [item._id]: e.target.value,
                            }))
                          }
                          data-testid={`bulk-qty-${item._id}`}
                          placeholder="0"
                          className="w-20 p-2 border border-stone-200 rounded-lg text-center"
                        />
                      </div>
                    </div>
                  ))
              )}
            </div>

            <div className="flex gap-2 mt-5">
              <button
                type="button"
                disabled={bulkBusy}
                onClick={applyBulk}
                data-testid="bulk-apply"
                className="flex items-center bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-bold py-2 px-5 rounded-full shadow-soft"
              >
                <FaPlus className="mr-2" />
                {bulkBusy ? "Restocking..." : "Restock Selected"}
              </button>
              <button
                type="button"
                onClick={() => setBulkOpen(false)}
                className="bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold py-2 px-5 rounded-full"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Movement history drawer */}
      {historyFor && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-lift max-w-2xl w-full max-h-[80vh] overflow-auto p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-ink">
                Movement history — {historyFor.name}
              </h3>
              <button
                type="button"
                onClick={() => setHistoryFor(null)}
                data-testid="close-history"
                className="text-ink-mute hover:text-ink font-bold px-2"
              >
                ✕
              </button>
            </div>
            {history.length === 0 ? (
              <p className="text-ink-mute">No movements recorded yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-ink-mute border-b">
                    <th className="py-2">When</th>
                    <th>Type</th>
                    <th>Qty</th>
                    <th>Stock Δ</th>
                    <th>Reserved Δ</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody data-testid="movement-rows">
                  {history.map((m) => (
                    <tr key={m._id} className="border-b border-stone-100" data-movement-type={m.type}>
                      <td className="py-2">{new Date(m.at).toLocaleString()}</td>
                      <td>
                        <span className="font-semibold">{m.type}</span>
                      </td>
                      <td>{m.quantity}</td>
                      <td>{m.stockDelta > 0 ? `+${m.stockDelta}` : m.stockDelta}</td>
                      <td>{m.reservedDelta > 0 ? `+${m.reservedDelta}` : m.reservedDelta}</td>
                      <td className="text-ink-soft">{m.reason || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
