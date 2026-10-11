import React, { useCallback, useEffect, useState } from "react";
import {
  FaUsers,
  FaCopy,
  FaCheck,
  FaTimes,
  FaSignOutAlt,
  FaTrashAlt,
} from "react-icons/fa";
import api from "../api";

const MAX_QTY = 20;

/**
 * Shared table orders.
 *
 * The host opens a table — a seat is claimed
 * automatically — and shares the six-character code.
 * Everyone at the table adds dishes to one bill; the
 * host checks the whole table out into a single order
 * (delivered to the table's seat).
 */
export default function GroupPanel({ foods, onClose, onOrderPlaced }) {
  const [mode, setMode] = useState("open"); // open | join
  const [code, setCode] = useState("");
  const [group, setGroup] = useState(null);
  const [myGroups, setMyGroups] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  // Add-a-dish form.
  const [foodId, setFoodId] = useState("");
  const [qty, setQty] = useState(1);

  const refreshMine = useCallback(async () => {
    try {
      const res = await api.get("/groups/mine");
      setMyGroups(res.data || []);
    } catch (err) {
      setError(err.message || "Could not load your tables");
    }
  }, []);

  useEffect(() => {
    refreshMine();
  }, [refreshMine]);

  const openTable = async (slotId) => {
    setBusy(true);
    setError("");
    try {
      const res = await api.post("/groups", slotId ? { slotId } : {});
      setGroup(res.data);
      refreshMine();
    } catch (err) {
      setError(err.message || "Could not open a table");
    } finally {
      setBusy(false);
    }
  };

  const joinTable = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await api.post("/groups/join", {
        code: code.trim().toUpperCase(),
      });
      setGroup(res.data);
      refreshMine();
    } catch (err) {
      setError(err.message || "Could not join that table");
    } finally {
      setBusy(false);
    }
  };

  const addItem = async (e) => {
    e.preventDefault();
    if (!foodId) return;
    setBusy(true);
    setError("");
    try {
      const res = await api.post(`/groups/${group._id}/items`, {
        food: foodId,
        quantity: qty,
      });
      setGroup(res.data);
    } catch (err) {
      setError(err.message || "Could not add the dish");
    } finally {
      setBusy(false);
    }
  };

  const removeItem = async (index) => {
    setBusy(true);
    setError("");
    try {
      const res = await api.delete(`/groups/${group._id}/items/${index}`);
      setGroup(res.data);
    } catch (err) {
      setError(err.message || "Could not remove the dish");
    } finally {
      setBusy(false);
    }
  };

  const checkout = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await api.post(`/groups/${group._id}/checkout`);
      onOrderPlaced?.(res.data.order);
      onClose();
    } catch (err) {
      setError(err.message || "Could not check out the table");
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    setBusy(true);
    setError("");
    try {
      await api.post(`/groups/${group._id}/leave`);
      setGroup(null);
      refreshMine();
    } catch (err) {
      setError(err.message || "Could not leave the table");
    } finally {
      setBusy(false);
    }
  };

  const closeTable = async () => {
    setBusy(true);
    setError("");
    try {
      await api.post(`/groups/${group._id}/close`);
      setGroup(null);
      refreshMine();
    } catch (err) {
      setError(err.message || "Could not close the table");
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(group.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be unavailable; the code is shown */
    }
  };

  const total = (group?.items || []).reduce(
    (sum, i) => sum + i.price * i.quantity,
    0
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      data-testid="group-panel"
      role="dialog"
      aria-label="Table order"
    >
      <div className="bg-white rounded-2xl shadow-lift p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-lg font-extrabold text-ink flex items-center gap-2">
            <FaUsers className="text-brand-500" /> Table Order
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

        {error && (
          <p role="alert" className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
            {error}
          </p>
        )}

        {!group ? (
          <>
            {/* Open / join */}
            <div className="flex gap-2 mb-4">
              {["open", "join"].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`flex-1 py-2 rounded-full text-sm font-semibold ${
                    mode === m
                      ? "bg-brand-500 text-white"
                      : "bg-stone-100 text-stone-700 hover:bg-stone-200"
                  }`}
                >
                  {m === "open" ? "Open a table" : "Join by code"}
                </button>
              ))}
            </div>

            {mode === "open" ? (
              <div className="space-y-3">
                <p className="text-sm text-ink-mute">
                  Open a table for your group. A seat is claimed
                  automatically, and everyone joins with the code.
                </p>
                <button
                  type="button"
                  onClick={() => openTable()}
                  disabled={busy}
                  className="w-full py-3 rounded-full bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-bold"
                >
                  {busy ? "Opening…" : "Open a table now"}
                </button>
              </div>
            ) : (
              <form onSubmit={joinTable} className="space-y-3">
                <label className="block text-xs font-semibold text-ink-soft">
                  Table code
                  <input
                    value={code}
                    onChange={(e) =>
                      setCode(e.target.value.toUpperCase().slice(0, 6))
                    }
                    placeholder="e.g. K7M2PX"
                    required
                    maxLength={6}
                    className="mt-1 w-full p-2.5 rounded-xl border border-stone-200 bg-stone-50 uppercase tracking-widest focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
                  />
                </label>
                <button
                  type="submit"
                  disabled={busy || code.trim().length < 6}
                  className="w-full py-3 rounded-full bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-bold"
                >
                  {busy ? "Joining…" : "Join the table"}
                </button>
              </form>
            )}

            {/* My tables */}
            {myGroups.length > 0 && (
              <div className="mt-6">
                <h4 className="text-xs font-bold uppercase tracking-wide text-ink-mute mb-2">
                  Your tables
                </h4>
                <div className="space-y-2">
                  {myGroups.map((g) => (
                    <button
                      key={g._id}
                      type="button"
                      onClick={() => setGroup(g)}
                      className="w-full text-left bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-xl p-3 flex items-center justify-between gap-3"
                    >
                      <div>
                        <p className="font-extrabold text-ink tracking-widest">
                          {g.code}
                        </p>
                        <p className="text-xs text-ink-mute">
                          {g.members?.length || 1} at the table
                          {g.seatNumber ? ` · Seat ${g.seatNumber}` : ""}
                          {g.status !== "open" ? ` · ${g.status}` : ""}
                        </p>
                      </div>
                      <span className="text-xs font-semibold text-brand-700">
                        {g.items?.length || 0} dishes
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Open table view */}
            <div className="bg-brand-50 border border-brand-200 rounded-xl p-4 mb-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-xs uppercase tracking-wide text-brand-700 font-bold">
                    Table code
                  </p>
                  <p className="text-2xl font-extrabold tracking-[0.25em] text-ink">
                    {group.code}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={copyCode}
                  className="flex items-center gap-1.5 bg-white border border-brand-200 text-brand-700 hover:bg-brand-100 px-4 py-2 rounded-full font-semibold text-sm"
                >
                  {copied ? <FaCheck /> : <FaCopy />}
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <p className="text-xs text-ink-mute mt-2">
                Share this code with your table.{" "}
                {group.seatNumber
                  ? `Your table is at seat ${group.seatNumber}.`
                  : "No seat was free — take one from the seat map."}
                {" "}{group.members?.length || 1} at the table.
              </p>
            </div>

            {/* Add a dish */}
            <form onSubmit={addItem} className="flex gap-2 mb-4">
              <select
                value={foodId}
                onChange={(e) => setFoodId(e.target.value)}
                aria-label="Dish to add"
                className="flex-1 p-2.5 rounded-xl border border-stone-200 bg-stone-50 focus:border-brand-400 outline-none text-sm"
              >
                <option value="">Add a dish…</option>
                {(foods || [])
                  .filter((f) => f.available !== false)
                  .map((f) => (
                    <option key={f._id} value={f._id}>
                      {f.name} — ₹{f.price}
                    </option>
                  ))}
              </select>
              <select
                value={qty}
                onChange={(e) => setQty(Number(e.target.value))}
                aria-label="Quantity"
                className="w-20 p-2.5 rounded-xl border border-stone-200 bg-stone-50 focus:border-brand-400 outline-none text-sm"
              >
                {Array.from({ length: MAX_QTY }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {i + 1}×
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={busy || !foodId}
                className="px-4 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-bold text-sm"
              >
                Add
              </button>
            </form>

            {/* Shared bill */}
            <div className="space-y-1.5 mb-4">
              {group.items.length === 0 ? (
                <p className="text-sm text-ink-mute text-center py-4">
                  The table&apos;s bill is empty — add the first dish.
                </p>
              ) : (
                group.items.map((item, i) => {
                  const addedBy =
                    item.addedByName || (item.addedBy ? "Guest" : "Host");
                  return (
                    <div
                      key={`${item.food}-${i}`}
                      className="flex items-center justify-between gap-2 bg-stone-50 rounded-xl px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink truncate">
                          {item.name}
                        </p>
                        <p className="text-[11px] text-ink-mute">
                          added by {addedBy} · ₹{item.price} each
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-bold text-ink">
                          {item.quantity}×
                        </span>
                        <span className="text-sm font-semibold text-ink">
                          ₹{item.price * item.quantity}
                        </span>
                        <button
                          type="button"
                          aria-label={`Remove ${item.name}`}
                          onClick={() => removeItem(i)}
                          disabled={busy}
                          className="text-ink-mute hover:text-red-600 disabled:opacity-40"
                        >
                          <FaTrashAlt />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex justify-between font-extrabold text-brand-700 border-t border-stone-200 pt-3 mb-4">
              <span>Table total</span>
              <span>₹{total}</span>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={checkout}
                disabled={busy || group.items.length === 0}
                data-testid="group-checkout"
                className="flex-1 min-w-[160px] py-3 rounded-full bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-bold"
              >
                {busy ? "Checking out…" : "Checkout for the table"}
              </button>
              <button
                type="button"
                onClick={leave}
                disabled={busy}
                className="flex items-center px-4 py-3 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-sm"
              >
                <FaSignOutAlt className="mr-1.5" /> Leave
              </button>
              {group.isHost && (
                <button
                  type="button"
                  onClick={closeTable}
                  disabled={busy}
                  className="px-4 py-3 rounded-full bg-red-50 hover:bg-red-100 text-red-700 font-bold text-sm"
                >
                  Close table
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
