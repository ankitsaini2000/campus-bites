import React, { useEffect, useState, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import {
  FaShoppingCart,
  FaTrashAlt,
  FaHeart,
  FaSignOutAlt,
  FaFire,
  FaSearch,
  FaPercent,
  FaBullhorn,
} from "react-icons/fa";
import api from "../api";
import { statusTone, isActive } from "../orderStatus";
import OrderTimeline from "./OrderTimeline";
import SeatsCard from "./SeatsCard";
import { createRealtimeClient } from "../realtime";

const CART_KEY = "canteen_cart";

// Client-side dietary filters offered on the menu.
const DIET_FILTERS = ["Veg"];
const SORTS = [
  { key: "featured", label: "Featured" },
  { key: "price_asc", label: "Price: low to high" },
  { key: "price_desc", label: "Price: high to low" },
  { key: "fastest", label: "Fastest prep time" },
];

// Food Card Component with motion
function FoodCard({ food, addToCart, isFavorite, onToggleFavorite, inCart = 0 }) {
  const soldOut = food.available === false || (food.stock !== null && food.stock <= 0);

  // Stock-tracked items publish `availableQty` (physical stock minus what
  // is already reserved). It is advisory: the server revalidates on checkout.
  const tracked = typeof food.availableQty === "number";
  const available = tracked ? food.availableQty : Infinity;
  const remaining = available - inCart;
  const exhausted = !soldOut && remaining <= 0;
  return (
    <motion.div
      whileHover={soldOut ? undefined : { scale: 1.02, y: -2 }}
      whileTap={soldOut ? undefined : { scale: 0.98 }}
      data-testid="food-card"
      data-food-name={food.name}
      className="bg-white rounded-2xl shadow-soft overflow-hidden w-full flex flex-col"
    >
      <div className="relative">
        <img
          src={food.image || "/placeholder-food.svg"}
          alt={food.name}
          loading="lazy"
          className="w-full h-40 object-cover"
        />
        <button
          type="button"
          onClick={() => onToggleFavorite(food._id)}
          aria-label={isFavorite ? `Remove ${food.name} from favorites` : `Add ${food.name} to favorites`}
          aria-pressed={isFavorite}
          className={`absolute top-2 right-2 p-2 rounded-full shadow ${
            isFavorite ? "text-red-500 bg-white" : "text-stone-400 bg-white/90"
          }`}
        >
          <FaHeart />
        </button>
        {food.prepTimeMinutes != null && (
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/55 text-white text-[11px] font-semibold">
            {food.prepTimeMinutes} min
          </span>
        )}
      </div>

      <div className="p-4 flex flex-col flex-1">
        <h3 className="font-extrabold text-lg text-ink">{food.name}</h3>
        <p className="text-sm text-ink-mute mb-2">{food.description}</p>

        <div className="flex flex-wrap gap-1 mb-2 text-xs">
          {food.category && (
            <span className="px-2 py-0.5 rounded-full bg-brand-100 text-brand-800 font-semibold">
              {food.category}
            </span>
          )}
          {food.dietary && (
            <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">
              {food.dietary}
            </span>
          )}
          {food.spicy && (
            <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">
              spicy
            </span>
          )}
        </div>

        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <p className="text-xl font-extrabold text-brand-600">₹{food.price}</p>

          {tracked && !soldOut && (
            <p
              className={`text-xs font-semibold ${
                exhausted
                  ? "text-red-600"
                  : remaining <= (food.lowStockThreshold ?? 0)
                  ? "text-yellow-600"
                  : "text-green-600"
              }`}
              data-testid={`availability-${food._id}`}
            >
              {exhausted
                ? "No more available"
                : `${remaining} ${food.unit || "left"} available`}
            </p>
          )}
        </div>

        {soldOut || exhausted ? (
          <p className="text-sm font-semibold text-red-500 mt-2" data-testid="sold-out">
            {soldOut ? "Sold out" : "None left"}
          </p>
        ) : (
          <motion.button
            whileHover={{ scale: 1.04 }}
            type="button"
            className="mt-3 flex items-center justify-center bg-brand-500 hover:bg-brand-600 text-white font-bold py-2 px-4 rounded-full shadow-soft"
            onClick={() => addToCart(food)}
            data-testid="add-to-cart"
          >
            <FaShoppingCart className="mr-2" /> Add to Tray
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}

export default function StudentDashboard({ name, onLogout }) {
  const [foods, setFoods] = useState([]);
  const [cart, setCart] = useState(() => {
    // Restore a previously persisted cart.
    try {
      const raw = localStorage.getItem(CART_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [orders, setOrders] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [liveStatus, setLiveStatus] = useState("connecting");
  // Orders that just became Ready, surfaced as a pickup notification.
  const [readyAlerts, setReadyAlerts] = useState([]);
  // Promo code applied to the current tray.
  const [promoCode, setPromoCode] = useState("");
  const [appliedPromo, setAppliedPromo] = useState(null);
  const [promoError, setPromoError] = useState("");
  const [promoBusy, setPromoBusy] = useState(false);
  // Canteen-wide announcements from the admin.
  const [announcements, setAnnouncements] = useState([]);
  const [dismissed, setDismissed] = useState(() => new Set());
  // Live canteen seat map.
  const [seatMap, setSeatMap] = useState(null);
  const [seatsBusy, setSeatsBusy] = useState(false);

  // Client-side menu browsing state (filters operate on the fetched menu).
  const [category, setCategory] = useState("All");
  const [diet, setDiet] = useState(null);
  const [sort, setSort] = useState("featured");

  // Persist the cart whenever it changes.
  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch {
      // Storage may be unavailable (private mode); cart still works in-memory.
    }
  }, [cart]);

  /**
   * Re-read the menu. Also used when an inventory change arrives.
   */
  const refreshFoods = useCallback(async () => {
    try {
      const res = await api.get("/food");
      setFoods(res.data || []);
    } catch (err) {
      setError(err.message || "Could not load the menu");
    }
  }, []);

  /**
   * Re-read the seat map. Also used when a seat
   * change arrives over the socket.
   */
  const refreshSeats = useCallback(async () => {
    try {
      const res = await api.get("/seats");
      setSeatMap(res.data || null);
    } catch {
      // The seat map is non-essential; the menu keeps working.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchOrders = async () => {
      try {
        const res = await api.get("/orders");
        if (!cancelled) setOrders(res.data || []);
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load your orders");
      }
    };

    const fetchFavorites = async () => {
      try {
        const res = await api.get("/auth/me/favorites");
        if (!cancelled) setFavorites((res.data || []).map((f) => f._id));
      } catch {
        // Favorites are non-essential; ignore failures silently.
      }
    };

    const fetchAnnouncements = async () => {
      try {
        const res = await api.get("/announcements/active");
        if (!cancelled) setAnnouncements(res.data || []);
      } catch {
        // Announcements are non-essential; ignore failures silently.
      }
    };

    Promise.all([
      refreshFoods(),
      fetchOrders(),
      fetchFavorites(),
      fetchAnnouncements(),
      refreshSeats(),
    ]).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [refreshFoods, refreshSeats]);
  /**
   * Re-read a single order from the authoritative REST endpoint.
   *
   * Real-time messages are only a nudge to do this, so a dropped or duplicated
   * event can never leave stale data on screen.
   */
  const refreshOrder = useCallback(async (orderId) => {
    try {
      const res = await api.get(`/orders/${orderId}`);
      setOrders((prev) => prev.map((o) => (o._id === orderId ? res.data : o)));
    } catch {
      // The order may be removed; a later full refresh will reconcile.
    }
  }, []);

  /** Full snapshot refresh — used on reconnect to recover missed events. */
  const refreshOrders = useCallback(async () => {
    try {
      const res = await api.get("/orders");
      setOrders(res.data || []);
    } catch (err) {
      setError(err.message || "Could not load your orders");
    }
  }, []);


  // Real-time notifications. Sockets are advisory only: every message nudges a
  // REST re-read, and any reconnect triggers a full snapshot refresh so events
  // missed while offline are recovered. If the socket cannot connect, the
  // dashboard keeps working entirely over REST.
  useEffect(() => {
    let wasDisconnected = false;

    const client = createRealtimeClient({
      onStatusChange: (status) => {
        setLiveStatus(status);
        if (status === "disconnected" || status === "error") {
          wasDisconnected = true;
        }
        // Coming back: re-read everything so nothing missed stays stale.
        if ((status === "connected" || status === "reconnected") && wasDisconnected) {
          wasDisconnected = false;
          refreshOrders();
        }
      },
      // A stock change alters what is orderable; re-read the menu.
      onInventoryChanged: () => refreshFoods(),
      // A seat was taken or released; re-read the map.
      onSeatsChanged: () => refreshSeats(),
      onOrderChanged: (event) => {
        // A transition into "Ready" is a pickup moment worth calling out.
        if (event.status === "Ready" && event.previousStatus !== "Ready") {
          setReadyAlerts((prev) =>
            prev.some((a) => a.orderId === event.orderId)
              ? prev
              : [...prev, { orderId: event.orderId, at: event.at }]
          );
        }
        refreshOrder(event.orderId);
      },
    });

    return () => client.close();
  }, [refreshOrder, refreshOrders, refreshFoods, refreshSeats]);

  const takeSeat = useCallback(async () => {
    setSeatsBusy(true);
    try {
      const res = await api.post("/seats/take");
      setSeatMap(res.data);
    } catch (err) {
      setError(err.message || "Could not take a seat");
    } finally {
      setSeatsBusy(false);
    }
  }, []);

  const leaveSeat = useCallback(async () => {
    setSeatsBusy(true);
    try {
      const res = await api.post("/seats/leave");
      setSeatMap(res.data);
    } catch (err) {
      setError(err.message || "Could not leave your seat");
    } finally {
      setSeatsBusy(false);
    }
  }, []);

  const addToCart = useCallback((food) => {
    // Client-side guard for a friendly message; the server is authoritative.
    if (typeof food.availableQty === "number") {
      const held = cart.find((i) => i._id === food._id)?.quantity ?? 0;
      if (held + 1 > food.availableQty) {
        setError(`Only ${food.availableQty} of "${food.name}" available.`);
        return;
      }
    }
    setCart((prev) => {
      const exists = prev.find((item) => item._id === food._id);
      if (exists) {
        return prev.map((item) =>
          item._id === food._id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { ...food, quantity: 1 }];
    });
  }, []);

  const changeQuantity = useCallback((id, delta) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item._id === id
            ? { ...item, quantity: item.quantity + delta }
            : item
        )
        // Drop the line once its quantity reaches zero.
        .filter((item) => item.quantity > 0)
    );
  }, []);

  const removeFromCart = useCallback((id) => {
    setCart((prev) => prev.filter((item) => item._id !== id));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    setAppliedPromo(null);
    setPromoError("");
  }, []);

  const toggleFavorite = useCallback(async (foodId) => {
    const isFav = favorites.includes(foodId);
    // Optimistic update, rolled back on failure.
    setFavorites((prev) =>
      isFav ? prev.filter((id) => id !== foodId) : [...prev, foodId]
    );
    try {
      if (isFav) {
        await api.delete(`/auth/me/favorites/${foodId}`);
      } else {
        await api.post(`/auth/me/favorites/${foodId}`);
      }
    } catch {
      setFavorites((prev) =>
        isFav ? [...prev, foodId] : prev.filter((id) => id !== foodId)
      );
    }
  }, [favorites]);

  /** Load a past order's lines back into the cart. */
  const reorder = useCallback((order) => {
    setCart((prev) => {
      const next = [...prev];
      for (const item of order.items || []) {
        const foodId = typeof item.food === "object" ? item.food._id : item.food;
        if (!foodId) continue;
        const existing = next.find((f) => f._id === foodId);
        if (existing) {
          existing.quantity += item.quantity;
        } else {
          next.push({
            _id: foodId,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            available: true,
            stock: null,
          });
        }
      }
      return next;
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  /**
   * Cancel an order the user owns.
   *
   * The button is only rendered when the server told us `canCancel` is true
   * (Pending or Accepted, owned by this user), so the lifecycle rules are not
   * duplicated in the client. The server remains the authority.
   */
  const handleCancelOrder = async (order) => {
    if (!window.confirm("Cancel this order? This cannot be undone.")) return;

    setError("");
    try {
      const res = await api.post(`/orders/${order._id}/cancel`, {});
      // Replace the order in place so the status refreshes immediately.
      setOrders((prev) => prev.map((o) => (o._id === order._id ? res.data : o)));
    } catch (err) {
      setError(err.message || "Failed to cancel order");
      // Re-read so the UI reflects whatever the server actually holds.
      try {
        const fresh = await api.get(`/orders/${order._id}`);
        setOrders((prev) => prev.map((o) => (o._id === order._id ? fresh.data : o)));
      } catch {
        /* leave the existing state; the error is already surfaced */
      }
    }
  };

  const totalPrice = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const promoDiscount = appliedPromo ? appliedPromo.discount : 0;
  const grandTotal = Math.max(
    0,
    Math.round((totalPrice - promoDiscount) * 100) / 100
  );

  /**
   * Validate a code against the current subtotal. This never spends
   * the use — the claim happens atomically on the server at checkout.
   */
  const applyPromo = async () => {
    const code = promoCode.trim().toUpperCase();
    if (!code) return;
    setPromoBusy(true);
    setPromoError("");
    try {
      const res = await api.get("/promos/validate", {
        params: { code, subtotal: Number(totalPrice.toFixed(2)) },
      });
      if (res.data.valid) {
        setAppliedPromo({ code: res.data.code, discount: res.data.discount });
        setPromoCode("");
      } else {
        setPromoError(res.data.message || "That promo code is not valid");
      }
    } catch (err) {
      setPromoError(err.message || "Could not validate the promo code");
    } finally {
      setPromoBusy(false);
    }
  };

  const handleCheckout = async () => {
    if (cart.length === 0) {
      setError("Your cart is empty.");
      return;
    }
    setError("");

    try {
      // Only product ids and quantities are sent. The server looks up the
      // real prices and computes the total.
      const res = await api.post("/orders", {
        items: cart.map((item) => ({
          food: item._id,
          quantity: item.quantity,
        })),
        ...(appliedPromo ? { promoCode: appliedPromo.code } : {}),
      });

      clearCart();
      setOrders((prev) => [res.data, ...prev]);
    } catch (err) {
      setError(err.message || "Failed to place order");
      if (err.status === 409 && appliedPromo) {
        // The code expired or was claimed between validation and checkout.
        setAppliedPromo(null);
        setPromoError("The promo code could not be applied and was removed");
      }
    }
  };

  // Distinct menu categories, derived from what the server actually serves.
  const categories = useMemo(
    () => ["All", ...new Set(foods.map((f) => f.category).filter(Boolean))],
    [foods]
  );

  // Client-side filter + sort over the fetched menu. No API change: the
  // server's `?search=&category=&dietary=` params remain the authority for
  // large menus; this is instant local browsing of the current menu.
  const visibleFoods = useMemo(() => {
    const list = foods.filter((f) => {
      if (category !== "All" && f.category !== category) return false;
      if (diet && !(f.dietary || "").toLowerCase().includes(diet.toLowerCase())) {
        return false;
      }
      return true;
    });
    switch (sort) {
      case "price_asc":
        return [...list].sort((a, b) => a.price - b.price);
      case "price_desc":
        return [...list].sort((a, b) => b.price - a.price);
      case "fastest":
        return [...list].sort(
          (a, b) => (a.prepTimeMinutes ?? 999) - (b.prepTimeMinutes ?? 999)
        );
      default:
        return list;
    }
  }, [foods, category, diet, sort]);

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
                Student Central
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <span
              title={
                liveStatus === "connected"
                  ? "Live updates on"
                  : "Live updates unavailable - refresh manually"
              }
              className={`inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full shadow-sm ${
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
              {liveStatus === "connected" ? "Live" : "Offline"}
            </span>

            <span className="hidden sm:inline-flex items-center gap-2 text-sm font-semibold text-ink bg-brand-50 border border-brand-100 px-3 py-1.5 rounded-full">
              {name}
            </span>

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

      {/* Canteen announcements from the admin, newest and pinned first. */}
      {announcements.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-3">
          {announcements
            .filter((a) => !dismissed.has(String(a._id)))
            .map((a) => (
              <div
                key={a._id}
                role="status"
                data-testid="announcement"
                className={`rounded-2xl p-4 flex justify-between gap-3 ${
                  a.pinned
                    ? "bg-brand-50 border-2 border-brand-400"
                    : "bg-amber-50 border border-amber-300"
                }`}
              >
                <div className="min-w-0">
                  <p className="font-bold text-ink flex items-center gap-2 flex-wrap">
                    <FaBullhorn className="text-brand-600" />
                    {a.title}
                    {a.pinned && (
                      <span className="text-[10px] bg-brand-500 text-white px-2 py-0.5 rounded-full font-bold">
                        PINNED
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-ink-soft mt-1 whitespace-pre-line">
                    {a.body}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Dismiss announcement"
                  onClick={() =>
                    setDismissed((prev) => new Set(prev).add(String(a._id)))
                  }
                  className="text-ink-mute hover:text-ink font-bold px-2 shrink-0"
                >
                  ✕
                </button>
              </div>
            ))}
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.h1
          initial={{ y: -24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="text-3xl sm:text-4xl font-extrabold text-ink"
        >
          Welcome, {name}!
        </motion.h1>
        <p className="text-ink-mute mt-1 mb-6">
          Browse today&apos;s menu, build your tray, and track your order in real time.
        </p>

        {/* Ready-for-pickup notification: raised the moment the kitchen marks
            an order Ready, and dismissible by the student. */}
        {readyAlerts.length > 0 && (
          <div className="mb-4 space-y-2" data-testid="ready-alerts">
            {readyAlerts.map((alert) => (
              <div
                key={alert.orderId}
                role="status"
                data-testid="ready-alert"
                className="flex items-center justify-between gap-3 bg-sky-50 border-2 border-sky-400 rounded-xl p-3 shadow-sm"
              >
                <div>
                  <p className="font-bold text-sky-800">Your order is ready for pickup!</p>
                  <p className="text-xs text-sky-700 break-all">Order {alert.orderId}</p>
                </div>
                <button
                  type="button"
                  aria-label="Dismiss pickup notification"
                  onClick={() =>
                    setReadyAlerts((prev) => prev.filter((a) => a.orderId !== alert.orderId))
                  }
                  className="text-sky-700 hover:text-sky-900 font-bold px-2"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {error && (
          <p role="alert" className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
            {error}
          </p>
        )}

        {/* ===== Canteen seats ===== */}
        <div className="mb-8">
          <SeatsCard
            seats={seatMap}
            mySeat={seatMap?.mySeat ?? null}
            onTake={takeSeat}
            onLeave={leaveSeat}
            busy={seatsBusy}
          />
        </div>

        {/* ===== Menu ===== */}
        <section>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-2xl font-bold text-ink">Menu</h2>
            <label className="flex items-center gap-2 text-sm text-ink-mute">
              <FaSearch className="text-ink-mute" />
              <span className="sr-only">Sort menu</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                aria-label="Sort menu"
                className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm font-semibold text-ink-soft focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
              >
                {SORTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Category + dietary chips (client-side) */}
          <div className="flex flex-wrap gap-2 mb-6">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                aria-pressed={category === c}
                className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                  category === c
                    ? "bg-brand-500 text-white shadow-soft"
                    : "bg-white text-ink-soft border border-stone-200 hover:border-brand-300"
                }`}
              >
                {c}
              </button>
            ))}
            <span className="mx-1 hidden sm:inline" aria-hidden="true">·</span>
            {DIET_FILTERS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDiet((current) => (current === d ? null : d))}
                aria-pressed={diet === d}
                className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                  diet === d
                    ? "bg-green-600 text-white shadow-soft"
                    : "bg-white text-ink-soft border border-stone-200 hover:border-green-300"
                }`}
              >
                {d}
              </button>
            ))}
          </div>

          {loading ? (
            <p className="text-ink-mute">Loading food items...</p>
          ) : visibleFoods.length === 0 ? (
            <p className="text-ink-mute">
              {foods.length === 0
                ? "No food items available right now."
                : "Nothing matches these filters."}
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {visibleFoods.map((food) => (
                <FoodCard
                  key={food._id}
                  food={food}
                  addToCart={addToCart}
                  isFavorite={favorites.includes(food._id)}
                  onToggleFavorite={toggleFavorite}
                  inCart={cart.find((i) => i._id === food._id)?.quantity ?? 0}
                />
              ))}
            </div>
          )}
        </section>

        {/* ===== Tray (cart) ===== */}
        <section className="mt-12">
          <h2 className="text-2xl font-bold text-ink mb-4">Your Tray</h2>
          {cart.length === 0 ? (
            <p className="text-ink-mute">Your tray is empty.</p>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-white rounded-2xl shadow-soft p-6"
            >
              {cart.map((item) => (
                <motion.div
                  key={item._id}
                  whileHover={{ scale: 1.01 }}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 border-b border-stone-100 last:border-0"
                >
                  <div>
                    <h3 className="font-bold text-ink">{item.name}</h3>
                    <p className="text-sm text-ink-mute">₹{item.price} each</p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        aria-label={`Decrease quantity of ${item.name}`}
                        onClick={() => changeQuantity(item._id, -1)}
                        className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 font-bold hover:bg-brand-200"
                      >
                        −
                      </button>
                      <span className="w-6 text-center font-semibold text-ink">{item.quantity}</span>
                      <button
                        type="button"
                        aria-label={`Increase quantity of ${item.name}`}
                        onClick={() => changeQuantity(item._id, 1)}
                        className="w-8 h-8 rounded-full bg-brand-500 text-white font-bold hover:bg-brand-600"
                      >
                        +
                      </button>
                    </div>

                    <span className="font-semibold text-ink w-20 text-right">
                      ₹{item.price * item.quantity}
                    </span>

                    <button
                      type="button"
                      onClick={() => removeFromCart(item._id)}
                      aria-label={`Remove ${item.name} from cart`}
                      className="bg-red-500 hover:bg-red-600 text-white p-2 rounded-full"
                    >
                      <FaTrashAlt />
                    </button>
                  </div>
                </motion.div>
              ))}

              <div className="mt-5 space-y-1.5">
                <div className="flex justify-between text-ink-soft">
                  <span>Subtotal:</span>
                  <span>₹{totalPrice.toFixed(2)}</span>
                </div>
                {promoDiscount > 0 && (
                  <div className="flex justify-between text-green-700 font-semibold">
                    <span>Discount ({appliedPromo.code}):</span>
                    <span>−₹{promoDiscount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-extrabold text-ink mt-1 pt-2 border-t border-stone-100 text-lg">
                  <span>Total:</span>
                  <span>₹{grandTotal.toFixed(2)}</span>
                </div>
              </div>

              {/* Promo code */}
              <div className="mt-4">
                {appliedPromo ? (
                  <div
                    className="flex items-center justify-between gap-3 bg-green-50 border border-green-300 rounded-xl p-3"
                    data-testid="promo-applied"
                  >
                    <span className="text-sm font-semibold text-green-800">
                      <FaPercent className="mr-1.5" />
                      {appliedPromo.code} applied — ₹
                      {promoDiscount.toFixed(2)} off
                    </span>
                    <button
                      type="button"
                      onClick={() => setAppliedPromo(null)}
                      className="text-green-700 underline text-sm font-semibold"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={promoCode}
                      onChange={(e) => setPromoCode(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          applyPromo();
                        }
                      }}
                      placeholder="Promo code"
                      aria-label="Promo code"
                      data-testid="promo-input"
                      className="flex-1 p-2.5 rounded-xl border border-stone-200 bg-stone-50 uppercase focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
                    />
                    <button
                      type="button"
                      onClick={applyPromo}
                      disabled={promoBusy || !promoCode.trim()}
                      data-testid="promo-apply"
                      className="px-5 py-2.5 rounded-xl bg-stone-800 text-white font-semibold text-sm hover:bg-stone-700 disabled:opacity-50"
                    >
                      {promoBusy ? "..." : "Apply"}
                    </button>
                  </div>
                )}
                {promoError && (
                  <p role="alert" className="text-sm text-red-600 mt-1.5">
                    {promoError}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-3 mt-5">
                <button
                  type="button"
                  onClick={clearCart}
                  className="px-5 py-3 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold"
                >
                  Clear All
                </button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  type="button"
                  onClick={handleCheckout}
                  data-testid="checkout"
                  className="flex-1 min-w-[160px] bg-brand-500 hover:bg-brand-600 text-white font-bold py-3 px-6 rounded-full shadow-soft"
                >
                  Checkout <FaShoppingCart className="inline ml-2" />
                </motion.button>
              </div>
            </motion.div>
          )}
        </section>

        {/* ===== Orders ===== */}
        <section className="mt-12">
          <h2 className="text-2xl font-bold text-ink mb-4">Your Orders</h2>
          {orders.length === 0 ? (
            <p className="text-ink-mute">You have no orders yet.</p>
          ) : (
            <div className="space-y-6">
              {orders.map((order) => (
                <motion.div
                  key={order._id}
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  className="bg-white p-6 rounded-2xl shadow-soft border-l-8 border-brand-500"
                  data-testid="order-card"
                  data-order-id={order._id}
                >
                  <div className="flex justify-between mb-2 gap-4 flex-wrap">
                    <span className="font-bold text-brand-700 break-all text-sm">
                      Order ID: {order._id}
                    </span>
                    <span data-testid="order-status" className={`font-semibold ${statusTone(order.status)}`}>
                      {order.status}
                    </span>
                  </div>

                  {/* Progress timeline across the canonical lifecycle. */}
                  <OrderTimeline status={order.status} className="my-3" />

                  <p className="text-ink-mute text-sm mb-2">
                    Date: {new Date(order.date).toLocaleString()}
                  </p>

                  {order.estimatedReadyAt && isActive(order.status) && (
                    <p className="text-ink-mute text-sm mb-2">
                      Estimated ready: {new Date(order.estimatedReadyAt).toLocaleTimeString()}
                    </p>
                  )}

                  {(order.items || []).map((item, i) => (
                    <div key={`${item.food}-${i}`} className="flex justify-between text-ink-soft text-sm mb-1">
                      <span>{item.name} × {item.quantity}</span>
                      <span>₹{item.price * item.quantity}</span>
                    </div>
                  ))}

                  {Number(order.discount) > 0 && (
                    <div className="flex justify-between text-sm font-semibold text-green-700 mt-1">
                      <span>
                        Discount{order.promo?.code ? ` (${order.promo.code})` : ""}:
                      </span>
                      <span>−₹{order.discount}</span>
                    </div>
                  )}

                  <div className="flex justify-between font-extrabold text-brand-700 mt-3">
                    <span>Total:</span>
                    <span>₹{order.total}</span>
                  </div>

                  {/* Status history */}
                  {order.statusHistory?.length > 0 && (
                    <ol className="mt-4 text-xs text-ink-mute space-y-1">
                      {order.statusHistory.map((h, i) => (
                        <li key={i}>
                          {h.from ? `${h.from} → ` : ""}
                          {h.status} — {new Date(h.at).toLocaleString()}
                          {h.reason ? ` — ${h.reason}` : ""}
                        </li>
                      ))}
                    </ol>
                  )}

                  {/* Cancel is offered only when the server says it is eligible. */}
                  {order.canCancel && (
                    <button
                      type="button"
                      onClick={() => handleCancelOrder(order)}
                      data-testid="cancel-order"
                      className="mt-4 mr-2 bg-red-50 hover:bg-red-100 text-red-700 font-semibold py-1.5 px-4 rounded-full"
                    >
                      Cancel Order
                    </button>
                  )}

                  {isActive(order.status) && (
                    <button
                      type="button"
                      onClick={() => reorder(order)}
                      className="mt-4 bg-brand-100 hover:bg-brand-200 text-brand-800 font-semibold py-1.5 px-4 rounded-full"
                    >
                      Reorder
                    </button>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-brand-100 mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center text-xs text-ink-mute">
          Campus Bites · University Canteen Network
        </div>
      </footer>
    </div>
  );
}
