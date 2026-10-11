import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import {
  FaCheck,
  FaTimes,
  FaSpinner,
  FaPlus,
  FaTrash,
  FaSignOutAlt,
  FaFire,
  FaChartLine,
  FaShoppingBag,
  FaClock,
  FaUtensils,
  FaEdit,
  FaSearch,
  FaFileCsv,
  FaUsers,
  FaChartPie,
  FaTags,
  FaBullhorn,
  FaChair,
  FaCog,
} from "react-icons/fa";
import api from "../api";
import { statusTone, requiresReason, ACTION_STYLE, isActive } from "../orderStatus";
import { createRealtimeClient } from "../realtime";
import InventoryPanel from "./InventoryPanel";
import ReportsPanel from "./ReportsPanel";
import UsersPanel from "./UsersPanel";
import PromosPanel from "./PromosPanel";
import AnnouncementsPanel from "./AnnouncementsPanel";
import SeatsPanel from "./SeatsPanel";
import SettingsPanel from "./SettingsPanel";

/** Admin-only sections beyond the day-to-day console. */
const ADMIN_TABS = [
  { key: "console", label: "Console", icon: FaFire },
  { key: "reports", label: "Reports", icon: FaChartPie },
  { key: "users", label: "Users", icon: FaUsers },
  { key: "seats", label: "Seats", icon: FaChair },
  { key: "settings", label: "Settings", icon: FaCog },
  { key: "promos", label: "Promos", icon: FaTags },
  { key: "announcements", label: "Announcements", icon: FaBullhorn },
];

/** Filter chips shown above the order board. */
const FILTERS = [
  { key: "all", label: "All" },
  { key: "Pending", label: "Pending" },
  { key: "Accepted", label: "Accepted" },
  { key: "Preparing", label: "Preparing" },
  { key: "Ready", label: "Ready" },
  { key: "Completed", label: "Completed" },
  { key: "Cancelled", label: "Cancelled" },
  { key: "Rejected", label: "Rejected" },
];

export default function AdminDashboard({ name, role = "admin", onLogout, onOpenKitchen }) {
  const [orders, setOrders] = useState([]);
  const [foods, setFoods] = useState([]);
  const [newFood, setNewFood] = useState({ name: "", description: "", price: "", image: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [liveStatus, setLiveStatus] = useState("connecting");
  const [filter, setFilter] = useState("all");
  // Orders that arrived while this board was open, for the alert strip.
  const [newArrivals, setNewArrivals] = useState([]);
  // Active admin section (administrators only).
  const [adminTab, setAdminTab] = useState("console");
  // Menu editing draft.
  const [editingFood, setEditingFood] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", description: "", price: "", category: "", prepTimeMinutes: "", image: "" });
  const [savingFood, setSavingFood] = useState(false);
  // Order board search and CSV export.
  const [orderQuery, setOrderQuery] = useState("");

  const canManageMenu = role === "admin" || role === "staff";
  const knownOrderIds = useRef(new Set());

  const refreshAllOrders = useCallback(async () => {
    try {
      const res = await api.get("/orders/all");
      const incoming = res.data || [];

      // Anything we have never seen is genuinely new to this board.
      const seen = knownOrderIds.current;
      if (seen.size > 0) {
        const fresh = incoming.filter((o) => !seen.has(o._id));
        if (fresh.length) {
          setNewArrivals((prev) => [...fresh.map((o) => o._id), ...prev].slice(0, 20));
        }
      }
      incoming.forEach((o) => seen.add(o._id));

      setOrders(incoming);
    } catch (err) {
      setError(err.message || "Error fetching orders");
    }
  }, []);

const refreshOrder = useCallback(async (orderId) => {
    try {
      const fresh = await api.get(`/orders/${orderId}`);
      const seen = knownOrderIds.current;

      // An order this board has never seen is genuinely new. It must be
      // INSERTED, not just mapped over -- otherwise an order placed after the
      // board loaded would stay invisible until a full refresh.
      if (seen.size > 0 && !seen.has(orderId)) {
        setNewArrivals((prev) => [orderId, ...prev.filter((x) => x !== orderId)].slice(0, 20));
      }
      seen.add(orderId);

      setOrders((prev) => {
        const exists = prev.some((o) => o._id === orderId);
        return exists
          ? prev.map((o) => (o._id === orderId ? fresh.data : o))
          : [fresh.data, ...prev];
      });
    } catch {
      /* a later full refresh will reconcile */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchFoods = async () => {
      try {
        const res = await api.get("/food");
        if (!cancelled) setFoods(res.data || []);
      } catch (err) {
        if (!cancelled) setError(err.message || "Error fetching food items");
      }
    };

    Promise.all([refreshAllOrders(), fetchFoods()]).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [refreshAllOrders]);

  // Real-time board updates, with full resync after a reconnect.
  useEffect(() => {
    let wasDisconnected = false;
    const client = createRealtimeClient({
      onStatusChange: (status) => {
        setLiveStatus(status);
        if (status === "disconnected" || status === "error") wasDisconnected = true;
        if ((status === "connected" || status === "reconnected") && wasDisconnected) {
          wasDisconnected = false;
          refreshAllOrders();
        }
      },
      onOrderChanged: (event) => refreshOrder(event.orderId),
    });
    client.subscribeToCanteen();
    return () => client.close();
  }, [refreshOrder, refreshAllOrders]);

  const updateStatus = async (id, status) => {
    setError("");

    let reason;
    if (requiresReason(status)) {
      const entered = window.prompt(
        `Reason for marking this order "${status}" (required):`,
        ""
      );
      if (entered === null) return;
      if (!entered.trim()) {
        setError(`A reason is required to mark an order "${status}".`);
        return;
      }
      reason = entered.trim();
    }

    try {
      const res = await api.put(`/orders/${id}/status`, { status, reason });
      setOrders((prev) => prev.map((o) => (o._id === id ? res.data : o)));
      setNewArrivals((prev) => prev.filter((oid) => oid !== id));
    } catch (err) {
      setError(err.message || "Failed to update status");
      try {
        const fresh = await api.get(`/orders/${id}`);
        setOrders((prev) => prev.map((o) => (o._id === id ? fresh.data : o)));
      } catch {
        /* the error is already surfaced */
      }
    }
  };

  const addFood = async (e) => {
    e.preventDefault();
    setError("");

    if (!newFood.name || newFood.price === "") {
      setError("Name and price are required.");
      return;
    }

    try {
      const res = await api.post("/food", { ...newFood, price: parseFloat(newFood.price) });
      setFoods((prev) => [...prev, res.data]);
      setNewFood({ name: "", description: "", price: "", image: "" });
    } catch (err) {
      setError(err.message || "Failed to add food");
    }
  };

  const deleteFood = async (id) => {
    setError("");
    if (!window.confirm("Delete this menu item? This cannot be undone.")) return;

    try {
      await api.delete(`/food/${id}`);
      setFoods((prev) => prev.filter((f) => f._id !== id));
    } catch (err) {
      setError(err.message || "Failed to delete food");
    }
  };

  // Filter chips first, then an optional free-text search over the
  // orders this board already holds (student, email, id, item names).
  const visibleOrders = useMemo(() => {
    const base =
      filter === "all" ? orders : orders.filter((o) => o.status === filter);
    const q = orderQuery.trim().toLowerCase();
    if (!q) return base;
    return base.filter((o) => {
      if (String(o._id).toLowerCase().includes(q)) return true;
      const student = o.student || {};
      if ((student.name || "").toLowerCase().includes(q)) return true;
      if ((student.email || "").toLowerCase().includes(q)) return true;
      return (o.items || []).some((i) =>
        (i.name || "").toLowerCase().includes(q)
      );
    });
  }, [orders, filter, orderQuery]);

  const openEditFood = (food) => {
    setEditingFood(food);
    setEditForm({
      name: food.name,
      description: food.description || "",
      price: String(food.price),
      category: food.category || "",
      prepTimeMinutes:
        food.prepTimeMinutes != null ? String(food.prepTimeMinutes) : "",
      image: food.image || "",
    });
  };

  const saveFood = async (e) => {
    e.preventDefault();
    setError("");
    if (!editForm.name.trim() || editForm.price === "") {
      setError("Name and price are required.");
      return;
    }
    setSavingFood(true);
    try {
      const res = await api.put(`/food/${editingFood._id}`, {
        name: editForm.name.trim(),
        description: editForm.description,
        price: parseFloat(editForm.price),
        category: editForm.category.trim() || "General",
        ...(editForm.prepTimeMinutes !== ""
          ? { prepTimeMinutes: Number(editForm.prepTimeMinutes) }
          : {}),
        ...(editForm.image.trim() ? { image: editForm.image.trim() } : {}),
      });
      setFoods((prev) =>
        prev.map((f) => (f._id === res.data._id ? res.data : f))
      );
      setEditingFood(null);
    } catch (err) {
      setError(err.message || "Failed to update food");
    } finally {
      setSavingFood(false);
    }
  };

  /** Download the orders currently shown (filters and search applied). */
  const exportCsv = () => {
    const header = [
      "Order ID",
      "Date",
      "Student",
      "Email",
      "Status",
      "Items",
      "Subtotal",
      "Discount",
      "Total",
    ];
    const rows = visibleOrders.map((o) => [
      o._id,
      new Date(o.date).toISOString(),
      o.student?.name || "",
      o.student?.email || "",
      o.status,
      (o.items || []).map((i) => `${i.quantity}x ${i.name}`).join("; "),
      (o.subtotal ?? o.total ?? 0).toFixed(2),
      (o.discount ?? 0).toFixed(2),
      (o.total ?? 0).toFixed(2),
    ]);
    const csv = [header, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campus-bites-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // Stat cards are computed from the live data only — never invented.
  const stats = useMemo(() => {
    const revenue = orders
      .filter((o) => o.status === "Completed")
      .reduce((sum, o) => sum + Number(o.total || 0), 0);
    return [
      { icon: FaShoppingBag, label: "Orders today", value: String(orders.length) },
      { icon: FaClock, label: "Live queue", value: String(orders.filter((o) => isActive(o.status)).length) },
      { icon: FaUtensils, label: "Menu items", value: String(foods.length) },
      { icon: FaChartLine, label: "Revenue (completed)", value: `₹${revenue}` },
    ];
  }, [orders, foods]);

  return (
    <div className="min-h-screen bg-cream">
      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-white/85 backdrop-blur border-b border-brand-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-brand-500 text-white shadow-soft">
              <FaFire />
            </span>
            <div className="leading-tight">
              <p className="font-extrabold text-ink text-lg">Campus Bites</p>
              <p className="text-[10px] uppercase tracking-[0.18em] text-ink-mute">
                Staff Console
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <span
              className={`inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full shadow-sm ${
                liveStatus === "connected"
                  ? "bg-green-50 text-green-700"
                  : "bg-stone-100 text-stone-500"
              }`}
              data-testid="admin-live"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  liveStatus === "connected" ? "bg-green-500" : "bg-stone-400"
                }`}
              />
              {liveStatus === "connected" ? "Live" : "Offline"}
            </span>

            <button
              type="button"
              onClick={refreshAllOrders}
              data-testid="admin-refresh"
              className="bg-white text-brand-700 hover:bg-brand-50 border border-brand-100 px-4 py-1.5 rounded-full shadow-sm font-semibold text-sm"
            >
              Refresh
            </button>
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
        <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
          <motion.h1
            initial={{ y: -24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="text-3xl sm:text-4xl font-extrabold text-ink"
          >
            Welcome, {name}!
          </motion.h1>

          {onOpenKitchen && (
            <button
              type="button"
              onClick={onOpenKitchen}
              data-testid="open-kitchen"
              className="flex items-center bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-full shadow-soft font-semibold"
            >
              <FaFire className="mr-2" /> Kitchen Display
            </button>
          )}
        </div>
        <p className="text-ink-mute mb-6">
          Fulfil orders, manage the menu, and watch stock levels in real time.
        </p>

        {/* Section tabs — administrators get the full toolkit. */}
        {role === "admin" && (
          <nav
            className="flex flex-wrap gap-2 mb-8"
            data-testid="admin-tabs"
            aria-label="Admin sections"
          >
            {ADMIN_TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setAdminTab(key)}
                aria-pressed={adminTab === key}
                data-testid={`admin-tab-${key}`}
                className={`flex items-center px-4 py-2 rounded-full text-sm font-semibold shadow-sm ${
                  adminTab === key
                    ? "bg-brand-500 text-white"
                    : "bg-white text-ink-soft border border-stone-200 hover:border-brand-300"
                }`}
              >
                <Icon className="mr-2" /> {label}
              </button>
            ))}
          </nav>
        )}

        {role === "admin" && adminTab !== "console" ? (
          <section key={adminTab}>
            {adminTab === "reports" && <ReportsPanel />}
            {adminTab === "users" && <UsersPanel />}
            {adminTab === "seats" && <SeatsPanel />}
            {adminTab === "settings" && <SettingsPanel />}
            {adminTab === "promos" && <PromosPanel />}
            {adminTab === "announcements" && <AnnouncementsPanel />}
          </section>
        ) : (
        <>

        {error && (
          <p role="alert" className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
            {error}
          </p>
        )}

        {/* ===== Stat cards ===== */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {stats.map(({ icon: Icon, label, value }) => (
            <div key={label} className="bg-white rounded-2xl shadow-soft p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-mute">
                  {label}
                </p>
                <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-brand-100 text-brand-600">
                  <Icon />
                </span>
              </div>
              <p className="text-2xl font-extrabold text-ink mt-1">{value}</p>
            </div>
          ))}
        </div>

        {/* New-order alert strip */}
        {newArrivals.length > 0 && (
          <div
            className="mb-6 bg-brand-50 border-2 border-brand-400 rounded-xl p-3 flex items-center justify-between gap-3"
            data-testid="new-order-alert"
            role="status"
          >
            <span className="text-sm font-semibold text-brand-800">
              {newArrivals.length} new order{newArrivals.length > 1 ? "s" : ""} received
            </span>
            <button
              type="button"
              onClick={() => setNewArrivals([])}
              className="text-brand-800 font-bold text-sm underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* ===== Inventory (administrators only) ===== */}
        {role === "admin" && <InventoryPanel />}

        {/* ===== Menu Management ===== */}
        <h2 className="text-2xl font-bold text-ink mb-4">Menu Management</h2>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-white p-6 rounded-2xl shadow-soft mb-10"
        >
          <form onSubmit={addFood} className="flex flex-col md:flex-row md:space-x-3 space-y-3 md:space-y-0 mb-5">
            <input
              type="text"
              placeholder="Name"
              aria-label="Food name"
              value={newFood.name}
              onChange={(e) => setNewFood({ ...newFood, name: e.target.value })}
              className="flex-1 p-2.5 rounded-xl border border-stone-200 bg-stone-50 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
            />
            <input
              type="text"
              placeholder="Description"
              aria-label="Description"
              value={newFood.description}
              onChange={(e) => setNewFood({ ...newFood, description: e.target.value })}
              className="flex-1 p-2.5 rounded-xl border border-stone-200 bg-stone-50 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
            />
            <input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="Price"
              aria-label="Price"
              value={newFood.price}
              onChange={(e) => setNewFood({ ...newFood, price: e.target.value })}
              className="w-32 p-2.5 rounded-xl border border-stone-200 bg-stone-50 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
            />
            <input
              type="text"
              placeholder="Image URL"
              aria-label="Image URL"
              value={newFood.image}
              onChange={(e) => setNewFood({ ...newFood, image: e.target.value })}
              className="flex-1 p-2.5 rounded-xl border border-stone-200 bg-stone-50 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
            />
            <motion.button
              type="submit"
              disabled={!canManageMenu}
              whileHover={{ scale: 1.03 }}
              className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-bold py-2.5 px-5 rounded-full flex items-center justify-center shadow-soft"
            >
              <FaPlus className="mr-2" /> Add Food
            </motion.button>
          </form>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {foods.length === 0 ? (
              <p className="text-ink-mute">No menu items yet.</p>
            ) : (
              foods.map((food) => (
                <motion.div
                  key={food._id}
                  whileHover={{ scale: 1.02 }}
                  className="bg-stone-50 p-4 rounded-2xl shadow-sm flex justify-between items-center gap-3"
                >
                  <div className="min-w-0">
                    <h3 className="font-bold text-ink truncate">{food.name}</h3>
                    <p className="text-ink-mute text-sm truncate">{food.description}</p>
                    <p className="font-extrabold text-brand-600 mt-0.5">₹{food.price}</p>
                    <p className="text-xs text-ink-mute mt-1">
                      {food.category}
                      {food.available === false ? " · unavailable" : ""}
                      {food.stock !== null && food.stock !== undefined ? ` · stock ${food.stock}` : ""}
                    </p>
                  </div>
                  {canManageMenu && (
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEditFood(food)}
                        aria-label={`Edit ${food.name}`}
                        data-testid={`edit-food-${food._id}`}
                        className="bg-brand-500 hover:bg-brand-600 text-white p-2 rounded-full"
                      >
                        <FaEdit />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteFood(food._id)}
                        aria-label={`Delete ${food.name}`}
                        className="bg-red-500 hover:bg-red-600 text-white p-2 rounded-full"
                      >
                        <FaTrash />
                      </button>
                    </div>
                  )}
                </motion.div>
              ))
            )}
          </div>
        </motion.div>

        {/* ===== Order Board ===== */}
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <h2 className="text-2xl font-bold text-ink">
            Orders ({visibleOrders.length})
          </h2>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute text-xs" />
              <input
                type="search"
                value={orderQuery}
                onChange={(e) => setOrderQuery(e.target.value)}
                placeholder="Search student, item or order ID"
                aria-label="Search orders"
                data-testid="order-search"
                className="p-2 pl-8 rounded-full border border-stone-200 bg-white text-sm w-56 sm:w-72 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
              />
            </div>
            <button
              type="button"
              onClick={exportCsv}
              data-testid="export-orders"
              className="flex items-center bg-white text-brand-700 hover:bg-brand-50 border border-brand-100 px-4 py-2 rounded-full shadow-sm font-semibold text-sm"
            >
              <FaFileCsv className="mr-1.5" /> Export CSV
            </button>
          </div>

          <div className="flex flex-wrap gap-2" data-testid="status-filters">
            {FILTERS.map((f) => {
              const count =
                f.key === "all" ? orders.length : orders.filter((o) => o.status === f.key).length;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  data-testid={`filter-${f.key}`}
                  aria-pressed={filter === f.key}
                  className={`px-3 py-1.5 rounded-full text-sm font-semibold shadow-sm ${
                    filter === f.key
                      ? "bg-brand-500 text-white"
                      : "bg-white text-ink-soft border border-stone-200 hover:border-brand-300"
                  }`}
                >
                  {f.label} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {loading ? (
          <p className="text-ink-mute">Loading orders...</p>
        ) : visibleOrders.length === 0 ? (
          <p className="text-ink-mute">
            {orders.length === 0 ? "No orders yet." : `No ${filter} orders.`}
          </p>
        ) : (
          <div className="space-y-5">
            {visibleOrders.map((order) => (
              <motion.div
                key={order._id}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                data-testid="admin-order-card"
                data-order-id={order._id}
                className={`bg-white p-6 rounded-2xl shadow-soft border-l-8 border-brand-500 ${
                  newArrivals.includes(order._id) ? "ring-4 ring-brand-300" : ""
                }`}
              >
                <div className="flex justify-between mb-2 gap-4 flex-wrap">
                  <span className="font-bold text-brand-700 break-all text-sm">
                    Order ID: {order._id}
                  </span>
                  <span
                    data-testid="admin-order-status"
                    className={`font-semibold ${statusTone(order.status)} flex items-center shrink-0`}
                  >
                    {(order.status === "Pending" ||
                      order.status === "Accepted" ||
                      order.status === "Preparing") && (
                      <FaSpinner className="animate-spin mr-1" />
                    )}
                    {order.status === "Completed" && <FaCheck className="mr-1" />}
                    {order.status}
                  </span>
                </div>

                <p className="text-ink-mute text-sm mb-2">
                  Student: {order.student?.name || "Unknown"}
                  {order.student?.email ? ` (${order.student.email})` : ""}
                </p>

                {order.notes && (
                  <p className="text-sm text-amber-900 bg-amber-50 border border-amber-300 rounded-lg p-2 mb-3">
                    <span className="font-bold">Note:</span> {order.notes}
                  </p>
                )}

                {(order.items || []).map((item, i) => (
                  <div key={`${item.food}-${i}`} className="flex justify-between text-ink-soft text-sm mb-1">
                    <span>
                      <span className="font-bold text-brand-700 mr-2">{item.quantity}×</span>
                      {item.name}
                    </span>
                    <span>₹{item.price * item.quantity}</span>
                  </div>
                ))}

                {Number(order.discount) > 0 && (
                  <div className="flex justify-between text-sm font-semibold text-green-700 mt-2">
                    <span>
                      Discount
                      {order.promo?.code ? ` (${order.promo.code})` : ""}:
                    </span>
                    <span>−₹{order.discount}</span>
                  </div>
                )}

                <div className="flex justify-between font-extrabold text-brand-700 mt-3">
                  <span>Total:</span>
                  <span>₹{order.total}</span>
                </div>

                {order.allowedTransitions?.length ? (
                  <div className="mt-4 flex flex-wrap gap-2.5">
                    {order.allowedTransitions.map((next) => (
                      <motion.button
                        key={next}
                        type="button"
                        data-testid={`status-${next}`}
                        whileHover={{ scale: 1.05 }}
                        className={`flex items-center ${ACTION_STYLE[next] || "bg-brand-500"} text-white font-bold py-1.5 px-3.5 rounded-full shadow-md`}
                        onClick={() => updateStatus(order._id, next)}
                      >
                        {next === "Completed" && <FaCheck className="mr-2" />}
                        {next === "Preparing" && <FaSpinner className="mr-2 animate-spin" />}
                        {(next === "Cancelled" || next === "Rejected") && <FaTimes className="mr-2" />}
                        {next}
                      </motion.button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-ink-mute">
                    This order is {order.status.toLowerCase()} and can no longer be changed.
                  </p>
                )}
              </motion.div>
            ))}
          </div>
        )}
        </>
        )}
      </main>

      {/* ===== Menu editing modal ===== */}
      {editingFood && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
          data-testid="food-editor"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-lift max-w-lg w-full p-6 max-h-[85vh] overflow-auto"
            role="dialog"
            aria-label={`Edit ${editingFood.name}`}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-ink">
                Edit {editingFood.name}
              </h3>
              <button
                type="button"
                onClick={() => setEditingFood(null)}
                className="text-ink-mute hover:text-ink font-bold px-2"
                aria-label="Close editor"
              >
                ✕
              </button>
            </div>
            <form onSubmit={saveFood} className="space-y-3">
              <label className="text-xs font-semibold text-ink-soft block">
                Name
                <input
                  type="text"
                  required
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm({ ...editForm, name: e.target.value })
                  }
                  className="block mt-1 w-full p-2.5 rounded-xl border border-stone-200 bg-stone-50 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
                />
              </label>
              <label className="text-xs font-semibold text-ink-soft block">
                Description
                <textarea
                  rows={2}
                  value={editForm.description}
                  onChange={(e) =>
                    setEditForm({ ...editForm, description: e.target.value })
                  }
                  className="block mt-1 w-full p-2.5 rounded-xl border border-stone-200 bg-stone-50 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-semibold text-ink-soft block">
                  Price (₹)
                  <input
                    type="number"
                    required
                    step="0.01"
                    min="0.01"
                    value={editForm.price}
                    onChange={(e) =>
                      setEditForm({ ...editForm, price: e.target.value })
                    }
                    className="block mt-1 w-full p-2.5 rounded-xl border border-stone-200 bg-stone-50 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
                  />
                </label>
                <label className="text-xs font-semibold text-ink-soft block">
                  Category
                  <input
                    type="text"
                    value={editForm.category}
                    onChange={(e) =>
                      setEditForm({ ...editForm, category: e.target.value })
                    }
                    className="block mt-1 w-full p-2.5 rounded-xl border border-stone-200 bg-stone-50 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-semibold text-ink-soft block">
                  Prep time (minutes)
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="240"
                    value={editForm.prepTimeMinutes}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        prepTimeMinutes: e.target.value,
                      })
                    }
                    className="block mt-1 w-full p-2.5 rounded-xl border border-stone-200 bg-stone-50 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
                  />
                </label>
                <label className="text-xs font-semibold text-ink-soft block">
                  Image URL
                  <input
                    type="url"
                    value={editForm.image}
                    onChange={(e) =>
                      setEditForm({ ...editForm, image: e.target.value })
                    }
                    placeholder="https://..."
                    className="block mt-1 w-full p-2.5 rounded-xl border border-stone-200 bg-stone-50 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
                  />
                </label>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={savingFood}
                  className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-bold py-2 px-5 rounded-full shadow-soft"
                >
                  {savingFood ? "Saving..." : "Save Changes"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingFood(null)}
                  className="bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold py-2 px-5 rounded-full"
                >
                  Cancel
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      <footer className="border-t border-brand-100 mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center text-xs text-ink-mute">
          Campus Bites · University Canteen Network
        </div>
      </footer>
    </div>
  );
}
