import React, { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { FaTags, FaPlus, FaTrash, FaCheckCircle, FaTimesCircle } from "react-icons/fa";
import api from "../api";

/** Discount description shared by the form and the list. */
function describeDiscount(promo) {
  if (promo.percentOff != null) return `${promo.percentOff}% off`;
  if (promo.fixedOff != null) return `₹${promo.fixedOff} off`;
  return "—";
}

export default function PromosPanel() {
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [showForm, setShowForm] = useState(false);

  // Create form draft.
  const [form, setForm] = useState({
    code: "",
    description: "",
    mode: "percent",
    value: "",
    minSubtotal: "",
    maxUses: "",
    validUntil: "",
  });

  const load = useCallback(async () => {
    try {
      const res = await api.get("/promos");
      setPromos(res.data || []);
    } catch (err) {
      setError(err.message || "Could not load promo codes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const flash = (message) => {
    setNotice(message);
    setTimeout(() => setNotice(""), 4000);
  };

  const createPromo = async (e) => {
    e.preventDefault();
    setError("");

    const value = Number(form.value);
    if (!form.code.trim()) {
      setError("A code is required.");
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      setError("Discount value must be greater than zero.");
      return;
    }
    if (form.mode === "percent" && value > 100) {
      setError("Percentage cannot exceed 100.");
      return;
    }

    const payload = {
      code: form.code.trim().toUpperCase(),
      description: form.description.trim() || undefined,
      ...(form.mode === "percent"
        ? { percentOff: value }
        : { fixedOff: value }),
      ...(form.minSubtotal !== "" ? { minSubtotal: Number(form.minSubtotal) } : {}),
      ...(form.maxUses !== "" ? { maxUses: Number(form.maxUses) } : {}),
      ...(form.validUntil ? { validUntil: new Date(form.validUntil).toISOString() } : {}),
    };

    try {
      const res = await api.post("/promos", payload);
      setPromos((prev) => [res.data, ...prev]);
      setForm({
        code: "",
        description: "",
        mode: "percent",
        value: "",
        minSubtotal: "",
        maxUses: "",
        validUntil: "",
      });
      setShowForm(false);
      flash(`Promo ${res.data.code} created`);
    } catch (err) {
      setError(err.message || "Could not create promo code");
    }
  };

  const toggleActive = async (promo) => {
    setError("");
    setBusyId(promo._id);
    try {
      const res = await api.patch(`/promos/${promo._id}`, {
        active: promo.active !== true,
      });
      setPromos((prev) => prev.map((p) => (p._id === res.data._id ? res.data : p)));
      flash(`${res.data.code} ${res.data.active ? "activated" : "deactivated"}`);
    } catch (err) {
      setError(err.message || "Could not update promo code");
    } finally {
      setBusyId(null);
    }
  };

  const removePromo = async (promo) => {
    if (!window.confirm(`Delete promo code "${promo.code}"? Orders that already used it keep their discount.`)) {
      return;
    }
    setError("");
    setBusyId(promo._id);
    try {
      await api.delete(`/promos/${promo._id}`);
      setPromos((prev) => prev.filter((p) => p._id !== promo._id));
      flash(`Promo ${promo.code} deleted`);
    } catch (err) {
      setError(err.message || "Could not delete promo code");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6" data-testid="promos-panel">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-ink">Promotions</h2>
          <p className="text-sm text-ink-mute">
            Discount codes students can apply at checkout
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((s) => !s)}
          data-testid="promo-new"
          className="flex items-center bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-full shadow-soft font-semibold text-sm"
        >
          <FaPlus className="mr-2" /> New Promo Code
        </button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl p-3">
          {notice}
        </p>
      )}

      {showForm && (
        <motion.form
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={createPromo}
          className="bg-white p-6 rounded-2xl shadow-soft"
          data-testid="promo-form"
        >
          <h3 className="font-bold text-ink mb-4">Create a promo code</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="text-xs font-semibold text-ink-soft">
              Code (letters, students type it at checkout)
              <input
                type="text"
                required
                maxLength={30}
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="e.g. FESTIVE20"
                className="block mt-1 p-2.5 rounded-xl border border-stone-200 bg-stone-50 uppercase focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
              />
            </label>
            <label className="text-xs font-semibold text-ink-soft">
              Description (optional)
              <input
                type="text"
                maxLength={200}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="e.g. Festival week special"
                className="block mt-1 p-2.5 rounded-xl border border-stone-200 bg-stone-50 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-semibold text-ink-soft">
                Type
                <select
                  value={form.mode}
                  onChange={(e) => setForm({ ...form, mode: e.target.value })}
                  className="block mt-1 w-full p-2.5 rounded-xl border border-stone-200 bg-stone-50"
                >
                  <option value="percent">Percentage off</option>
                  <option value="fixed">Fixed amount off (₹)</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-ink-soft">
                {form.mode === "percent" ? "Percent (1–100)" : "Amount (₹)"}
                <input
                  type="number"
                  required
                  step={form.mode === "percent" ? "1" : "0.01"}
                  min="0.01"
                  max={form.mode === "percent" ? "100" : "100000"}
                  value={form.value}
                  onChange={(e) => setForm({ ...form, value: e.target.value })}
                  placeholder={form.mode === "percent" ? "e.g. 20" : "e.g. 25"}
                  className="block mt-1 w-full p-2.5 rounded-xl border border-stone-200 bg-stone-50 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
                />
              </label>
            </div>
            <label className="text-xs font-semibold text-ink-soft">
              Minimum subtotal (₹, optional)
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.minSubtotal}
                onChange={(e) => setForm({ ...form, minSubtotal: e.target.value })}
                placeholder="e.g. 100"
                className="block mt-1 w-full p-2.5 rounded-xl border border-stone-200 bg-stone-50 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
              />
            </label>
            <label className="text-xs font-semibold text-ink-soft">
              Max uses (optional)
              <input
                type="number"
                step="1"
                min="1"
                value={form.maxUses}
                onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
                placeholder="e.g. 100"
                className="block mt-1 w-full p-2.5 rounded-xl border border-stone-200 bg-stone-50 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
              />
            </label>
            <label className="text-xs font-semibold text-ink-soft">
              Expires at (optional)
              <input
                type="datetime-local"
                value={form.validUntil}
                onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
                className="block mt-1 w-full p-2.5 rounded-xl border border-stone-200 bg-stone-50 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
              />
            </label>
          </div>
          <div className="flex gap-2 mt-5">
            <button
              type="submit"
              className="bg-brand-500 hover:bg-brand-600 text-white font-bold py-2 px-5 rounded-full shadow-soft"
            >
              Create Code
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold py-2 px-5 rounded-full"
            >
              Cancel
            </button>
          </div>
        </motion.form>
      )}

      {loading ? (
        <p className="text-ink-mute">Loading promo codes...</p>
      ) : promos.length === 0 ? (
        <div className="bg-white p-8 rounded-2xl shadow-soft text-center">
          <FaTags className="text-3xl text-brand-300 mx-auto mb-3" />
          <p className="text-ink-mute">No promo codes yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {promos.map((promo) => {
            const expired =
              promo.validUntil && new Date(promo.validUntil).getTime() < Date.now();
            const exhausted =
              promo.maxUses != null && promo.usedCount >= promo.maxUses;
            return (
              <motion.div
                key={promo._id}
                layout
                data-testid="promo-card"
                className={`bg-white p-5 rounded-2xl shadow-soft border-l-8 ${
                  promo.active !== true || expired || exhausted
                    ? "border-stone-300 opacity-75"
                    : "border-brand-500"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-extrabold text-brand-700 text-lg tracking-wide">
                      {promo.code}
                    </p>
                    {promo.description && (
                      <p className="text-sm text-ink-mute">{promo.description}</p>
                    )}
                  </div>
                  <span className="text-xl font-extrabold text-ink">
                    {describeDiscount(promo)}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5 mt-3 text-[11px]">
                  {promo.minSubtotal > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 font-semibold">
                      min ₹{promo.minSubtotal}
                    </span>
                  )}
                  {promo.maxUses != null && (
                    <span className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 font-semibold">
                      {promo.usedCount}/{promo.maxUses} used
                    </span>
                  )}
                  {promo.validUntil && (
                    <span className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 font-semibold">
                      expires {new Date(promo.validUntil).toLocaleDateString()}
                    </span>
                  )}
                  {expired && (
                    <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">
                      expired
                    </span>
                  )}
                  {exhausted && (
                    <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">
                      limit reached
                    </span>
                  )}
                </div>

                <div className="flex gap-2 mt-4">
                  <button
                    type="button"
                    disabled={busyId === promo._id}
                    onClick={() => toggleActive(promo)}
                    data-testid={`promo-toggle-${promo._id}`}
                    className={`flex items-center px-3 py-1.5 rounded-full text-xs font-semibold disabled:opacity-50 ${
                      promo.active === true
                        ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                        : "bg-green-100 text-green-700 hover:bg-green-200"
                    }`}
                  >
                    {promo.active === true ? (
                      <>
                        <FaTimesCircle className="mr-1" /> Deactivate
                      </>
                    ) : (
                      <>
                        <FaCheckCircle className="mr-1" /> Activate
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === promo._id}
                    onClick={() => removePromo(promo)}
                    data-testid={`promo-delete-${promo._id}`}
                    className="flex items-center px-3 py-1.5 rounded-full text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50"
                  >
                    <FaTrash className="mr-1" /> Delete
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
