import React, { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { FaChartLine, FaShoppingBag, FaCheckCircle, FaReceipt } from "react-icons/fa";
import api from "../api";

const PERIODS = [7, 14, 30];

/** One labelled vertical bar; height is a percentage of the max. */
function Bar({ height, title, label, highlight }) {
  return (
    <div className="flex-1 min-w-0 flex flex-col items-center justify-end h-full group">
      <div
        className={`w-full rounded-t-md ${
          highlight ? "bg-brand-500" : "bg-brand-300 group-hover:bg-brand-400"
        }`}
        style={{ height: `${Math.max(height, 1.5)}%` }}
        title={title}
      />
      {label && (
        <span className="text-[9px] text-ink-mute mt-1 truncate w-full text-center">
          {label}
        </span>
      )}
    </div>
  );
}

/** Horizontal bar row for ranked lists (top items). */
function HBar({ label, value, max, sub }) {
  const pct = max > 0 ? Math.max(3, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-32 sm:w-44 truncate text-sm font-semibold text-ink" title={label}>
        {label}
      </span>
      <div className="flex-1 h-4 bg-stone-100 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5 }}
          className="h-full bg-brand-400 rounded-full"
        />
      </div>
      <span className="w-20 text-right text-sm font-bold text-brand-700 shrink-0">
        {value}
        {sub ? <span className="text-ink-mute font-normal"> {sub}</span> : null}
      </span>
    </div>
  );
}

export default function ReportsPanel() {
  const [days, setDays] = useState(14);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get(`/analytics/summary?days=${days}`);
      setData(res.data);
    } catch (err) {
      setError(err.message || "Could not load reports");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const maxRevenue = data
    ? Math.max(1, ...data.revenueByDay.map((d) => d.revenue))
    : 1;
  const maxHourly = data
    ? Math.max(1, ...data.ordersByHour.map((h) => h.orders))
    : 1;
  const maxItemQty = data
    ? Math.max(1, ...data.topItems.map((t) => t.quantity))
    : 1;

  const peakHours = data
    ? [...data.ordersByHour]
        .sort((a, b) => b.orders - a.orders)
        .slice(0, 3)
        .filter((h) => h.orders > 0)
    : [];

  return (
    <div data-testid="reports-panel">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <h2 className="text-2xl font-bold text-ink">Reports & Analytics</h2>
        <div className="flex gap-1 bg-white rounded-full p-1 shadow-sm" data-testid="reports-period">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setDays(p)}
              aria-pressed={days === p}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold ${
                days === p ? "bg-brand-500 text-white" : "text-ink-soft hover:bg-stone-100"
              }`}
            >
              {p} days
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p role="alert" className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
          {error}
        </p>
      )}

      {loading || !data ? (
        <p className="text-ink-mute">Loading reports...</p>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          {/* Headline numbers */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: FaShoppingBag, label: "Orders", value: data.totals.orders },
              { icon: FaChartLine, label: "Revenue (completed)", value: `₹${data.totals.revenue}` },
              { icon: FaCheckCircle, label: "Completed", value: data.totals.completed },
              { icon: FaReceipt, label: "Avg order value", value: `₹${data.totals.avgOrderValue}` },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="bg-white rounded-2xl shadow-soft p-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-mute">{label}</p>
                  <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-brand-100 text-brand-600">
                    <Icon />
                  </span>
                </div>
                <p className="text-2xl font-extrabold text-ink mt-1">{value}</p>
              </div>
            ))}
          </div>

          {/* Status breakdown */}
          <div className="bg-white rounded-2xl shadow-soft p-5">
            <h3 className="font-bold text-ink mb-3">Orders by status</h3>
            {Object.keys(data.byStatus).length === 0 ? (
              <p className="text-sm text-ink-mute">No orders in this period.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {Object.entries(data.byStatus).map(([status, count]) => (
                  <span
                    key={status}
                    className="px-3 py-1.5 rounded-full bg-brand-50 text-brand-800 text-sm font-semibold"
                  >
                    {status}: {count}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Revenue by day */}
          <div className="bg-white rounded-2xl shadow-soft p-5">
            <h3 className="font-bold text-ink mb-1">Revenue by day</h3>
            <p className="text-xs text-ink-mute mb-4">Completed orders only</p>
            <div className="flex items-end gap-1 h-44">
              {data.revenueByDay.map((d) => (
                <Bar
                  key={d.date}
                  height={(d.revenue / maxRevenue) * 100}
                  title={`${d.date}: ₹${d.revenue} across ${d.orders} order(s)`}
                  label={data.period.days <= 7 ? d.date.slice(5) : undefined}
                  highlight={d.revenue === maxRevenue && d.revenue > 0}
                />
              ))}
            </div>
          </div>

          {/* Top items */}
          <div className="bg-white rounded-2xl shadow-soft p-5">
            <h3 className="font-bold text-ink mb-3">Top-selling items</h3>
            {data.topItems.length === 0 ? (
              <p className="text-sm text-ink-mute">No items sold in this period.</p>
            ) : (
              data.topItems.map((t) => (
                <HBar
                  key={t.name}
                  label={t.name}
                  value={t.quantity}
                  max={maxItemQty}
                  sub={`· ₹${t.revenue}`}
                />
              ))
            )}
          </div>

          {/* Hourly profile */}
          <div className="bg-white rounded-2xl shadow-soft p-5">
            <h3 className="font-bold text-ink mb-1">Orders by hour</h3>
            <p className="text-xs text-ink-mute mb-4">
              {peakHours.length > 0
                ? `Busiest around ${peakHours.map((h) => `${h.hour}:00`).join(", ")}`
                : "No orders in this period."}
            </p>
            <div className="flex items-end gap-1 h-36">
              {data.ordersByHour.map((h) => (
                <Bar
                  key={h.hour}
                  height={(h.orders / maxHourly) * 100}
                  title={`${h.hour}:00 — ${h.orders} order(s)`}
                  label={h.hour % 6 === 0 ? `${h.hour}` : undefined}
                  highlight={peakHours.some((p) => p.hour === h.hour)}
                />
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
