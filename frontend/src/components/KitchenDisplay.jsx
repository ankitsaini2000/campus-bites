import React, { useEffect, useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { FaCheck, FaSpinner, FaTimes, FaSignOutAlt, FaFire } from "react-icons/fa";
import api from "../api";
import OrderTimeline from "./OrderTimeline";
import { createRealtimeClient } from "../realtime";
import { formatElapsed, waitTone, statusBadge, requiresReason, ACTION_STYLE } from "../orderStatus";

/**
 * Kitchen Display System.
 *
 * A staff-facing view of the live queue. It deliberately has NO status logic of
 * its own: every action button comes from the server's `allowedTransitions`,
 * which is produced by the same lifecycle module the REST endpoint enforces.
 * The board can therefore never offer an action the API would reject.
 */
export default function KitchenDisplay({ name, onLogout, onBack }) {
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [liveStatus, setLiveStatus] = useState("connecting");
  // Ticks every second so elapsed waiting times advance live.
  const [now, setNow] = useState(() => Date.now());
  const [highlighted, setHighlighted] = useState(() => new Set());

  const seenOrderIds = useRef(new Set());

  const refreshAll = useCallback(async () => {
    try {
      const res = await api.get("/orders/kitchen");
      const incoming = res.data || [];

      // Flag genuinely new orders so the board can call them out once.
      setHighlighted((prev) => {
        const next = new Set(prev);
        for (const o of incoming) {
          if (!seenOrderIds.current.has(o._id)) next.add(o._id);
        }
        return next;
      });
      for (const o of incoming) seenOrderIds.current.add(o._id);

      setOrders(incoming);
    } catch (err) {
      setError(err.message || "Could not load the kitchen queue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Live waiting-time clock.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Real-time updates; the canteen room receives every order change.
  useEffect(() => {
    let wasDisconnected = false;
    const client = createRealtimeClient({
      onStatusChange: (status) => {
        setLiveStatus(status);
        if (status === "disconnected" || status === "error") wasDisconnected = true;
        if ((status === "connected" || status === "reconnected") && wasDisconnected) {
          wasDisconnected = false;
          refreshAll();
        }
      },
      onOrderChanged: () => {
        // Any transition reshuffles the whole queue,
        // so the board re-reads in full: positions and
        // ETAs everywhere are only correct after a
        // complete refresh.
        refreshAll();
      },
    });
    client.subscribeToCanteen();
    return () => client.close();
  }, [refreshAll]);

  const updateStatus = async (orderId, status) => {
    setError("");

    let reason;
    if (requiresReason(status)) {
      const entered = window.prompt(`Reason for marking this order "${status}" (required):`, "");
      if (entered === null) return;
      if (!entered.trim()) {
        setError(`A reason is required to mark this order "${status}".`);
        return;
      }
      reason = entered.trim();
    }

    try {
      const res = await api.put(`/orders/${orderId}/status`, { status, reason });
      setHighlighted((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
      if (["Completed", "Cancelled", "Rejected"].includes(res.data.status)) {
        setOrders((prev) => prev.filter((o) => o._id !== orderId));
      } else {
        setOrders((prev) => prev.map((o) => (o._id === orderId ? res.data : o)));
      }
    } catch (err) {
      setError(err.message || "Failed to update order");
      // Re-read so the board reflects the server after a conflict.
      try {
        const fresh = await api.get(`/orders/${orderId}`);
        setOrders((prev) => prev.map((o) => (o._id === orderId ? fresh.data : o)));
      } catch {
        /* error already surfaced */
      }
    }
  };

  const counts = orders.reduce((acc, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-cream">
      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-white/85 backdrop-blur border-b border-brand-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-brand-500 text-white shadow-soft">
              <FaFire />
            </span>
            <h1 className="text-xl sm:text-2xl font-extrabold text-ink">Kitchen Display</h1>
            <span
              className={`inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full shadow-sm ${
                liveStatus === "connected"
                  ? "bg-green-50 text-green-700"
                  : "bg-stone-100 text-stone-500"
              }`}
              data-testid="kitchen-live"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  liveStatus === "connected" ? "bg-green-500" : "bg-stone-400"
                }`}
              />
              {liveStatus === "connected" ? "Live" : "Offline"}
            </span>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={refreshAll}
              className="bg-white text-brand-700 hover:bg-brand-50 border border-brand-100 px-4 py-1.5 rounded-full shadow-sm font-semibold text-sm"
            >
              Refresh
            </button>
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                data-testid="kitchen-back"
                className="bg-white text-brand-700 hover:bg-brand-50 border border-brand-100 px-4 py-1.5 rounded-full shadow-sm font-semibold text-sm"
              >
                Dashboard
              </button>
            )}
            <button
              type="button"
              onClick={onLogout}
              className="flex items-center bg-white text-brand-700 hover:bg-brand-50 border border-brand-100 px-3 sm:px-4 py-1.5 rounded-full shadow-sm font-semibold text-sm"
            >
              <FaSignOutAlt className="mr-1.5" /> Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <p className="text-center text-sm text-ink-mute mb-6">
          Signed in as {name}
        </p>

        {error && (
          <p role="alert" className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
            {error}
          </p>
        )}

        {/* Queue summary */}
        <div className="flex justify-center gap-3 flex-wrap mb-8" data-testid="kitchen-counts">
          {["Pending", "Accepted", "Preparing", "Ready"].map((s) => (
            <div key={s} className="bg-white rounded-2xl shadow-soft px-6 py-3 text-center min-w-[104px]">
              <div className="text-xs font-semibold uppercase tracking-wide text-ink-mute">{s}</div>
              <div className="text-2xl font-extrabold text-brand-600">{counts[s] || 0}</div>
            </div>
          ))}
        </div>

        <h2 className="text-2xl font-bold text-ink mb-4">
          Live Queue ({orders.length})
        </h2>

        {loading ? (
          <p className="text-ink-mute">Loading the queue...</p>
        ) : orders.length === 0 ? (
          <p className="text-ink-soft bg-white rounded-2xl shadow-soft p-8 text-center">
            No orders waiting. New orders appear here automatically.
          </p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
            {orders.map((order) => {
              const elapsed = formatElapsed(order.date, now);
              const tone = waitTone(order.date, now);
              const isNew = highlighted.has(order._id);

              return (
                <motion.div
                  key={order._id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  data-testid="kitchen-order"
                  data-order-id={order._id}
                  className={`bg-white rounded-2xl shadow-soft p-5 flex flex-col ${
                    isNew ? "ring-4 ring-brand-300" : ""
                  }`}
                >
                  <div className="flex justify-between items-start gap-2 mb-3">
                    <div className="min-w-0">
                      <p className="font-bold text-brand-700 text-sm break-all">
                        {order._id}
                      </p>
                      <p className="text-xs text-ink-mute">
                        {order.student?.name || "Unknown"}
                        {order.student?.email ? ` · ${order.student.email}` : ""}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-sm font-mono font-bold ${tone.className}`}
                        data-testid="kitchen-wait"
                        title="Waiting time"
                      >
                        {elapsed}
                      </span>
                      <p className="text-[10px] uppercase tracking-wide text-ink-mute mt-1">
                        {tone.label}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`self-start text-xs font-semibold px-3 py-1 rounded-full mb-3 ${statusBadge(order.status)}`}
                    data-testid="kitchen-order-status"
                  >
                    {order.status}
                  </span>

                  {/* Live position and ETA in the prep queue. */}
                  {order.queuePosition != null && (
                    <span
                      className="self-start text-xs font-semibold px-3 py-1 rounded-full mb-3 bg-brand-100 text-brand-800"
                      data-testid="kitchen-queue"
                    >
                      Position #{order.queuePosition} · ~
                      {order.etaMinutes} min
                    </span>
                  )}

                  {/* Pre-ordered: shows when the kitchen owes it. */}
                  {order.scheduled && order.dueAt && (
                    <span
                      className="self-start text-xs font-semibold px-3 py-1 rounded-full mb-3 bg-violet-100 text-violet-800"
                      data-testid="kitchen-due"
                    >
                      Due{" "}
                      {new Date(order.dueAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  )}

                  <OrderTimeline status={order.status} className="mb-4" />

                  <ul className="space-y-1 mb-3 flex-1">
                    {(order.items || []).map((item, i) => (
                      <li
                        key={`${item.food}-${i}`}
                        className="flex justify-between text-sm text-ink-soft"
                        data-testid="kitchen-item"
                      >
                        <span>
                          <span className="font-bold text-brand-700 mr-2">
                            {item.quantity}×
                          </span>
                          {item.name}
                        </span>
                        <span className="text-ink-mute">₹{item.price * item.quantity}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="flex justify-between items-center text-sm mb-3">
                    <span className="text-ink-mute">Pickup</span>
                    <span className="font-semibold text-ink">
                      {order.pickupSlot || "Any"}
                    </span>
                  </div>

                  {/* Special instructions */}
                  {order.notes && (
                    <div
                      className="bg-amber-50 border border-amber-300 text-amber-900 rounded-xl p-3 text-sm mb-3"
                      data-testid="kitchen-notes"
                    >
                      <span className="font-bold block text-xs uppercase tracking-wide mb-1">
                        Special instructions
                      </span>
                      {order.notes}
                    </div>
                  )}

                  {/* Actions come straight from the server's lifecycle rules. */}
                  <div className="flex flex-wrap gap-2 mt-auto">
                    {(order.allowedTransitions || []).map((next) => (
                      <button
                        key={next}
                        type="button"
                        data-testid={`kitchen-action-${next}`}
                        onClick={() => updateStatus(order._id, next)}
                        className={`flex items-center text-white font-bold py-1.5 px-3 rounded-full shadow-md text-sm ${
                          ACTION_STYLE[next] || "bg-brand-500"
                        }`}
                      >
                        {next === "Completed" && <FaCheck className="mr-1" />}
                        {next === "Preparing" && <FaSpinner className="mr-1 animate-spin" />}
                        {(next === "Cancelled" || next === "Rejected") && (
                          <FaTimes className="mr-1" />
                        )}
                        {next}
                      </button>
                    ))}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
