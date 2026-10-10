import React, { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { FaBullhorn, FaPlus, FaTrash, FaThumbtack } from "react-icons/fa";
import api from "../api";

export default function AnnouncementsPanel() {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState({
    title: "",
    body: "",
    pinned: false,
    expiresAt: "",
  });

  const load = useCallback(async () => {
    try {
      const res = await api.get("/announcements");
      setAnnouncements(res.data || []);
    } catch (err) {
      setError(err.message || "Could not load announcements");
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

  const publish = async (e) => {
    e.preventDefault();
    setError("");

    if (!form.title.trim() || !form.body.trim()) {
      setError("A title and a message are both required.");
      return;
    }

    const payload = {
      title: form.title.trim(),
      body: form.body.trim(),
      pinned: form.pinned,
      ...(form.expiresAt ? { expiresAt: new Date(form.expiresAt).toISOString() } : {}),
    };

    try {
      const res = await api.post("/announcements", payload);
      setAnnouncements((prev) => [res.data, ...prev]);
      setForm({ title: "", body: "", pinned: false, expiresAt: "" });
      setShowForm(false);
      flash("Announcement published");
    } catch (err) {
      setError(err.message || "Could not publish announcement");
    }
  };

  const patch = async (announcement, updates, successMessage) => {
    setError("");
    setBusyId(announcement._id);
    try {
      const res = await api.patch(`/announcements/${announcement._id}`, updates);
      setAnnouncements((prev) =>
        prev.map((a) => (a._id === res.data._id ? res.data : a))
      );
      if (successMessage) flash(successMessage);
    } catch (err) {
      setError(err.message || "Could not update announcement");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (announcement) => {
    if (!window.confirm("Delete this announcement?")) return;
    setError("");
    setBusyId(announcement._id);
    try {
      await api.delete(`/announcements/${announcement._id}`);
      setAnnouncements((prev) => prev.filter((a) => a._id !== announcement._id));
      flash("Announcement deleted");
    } catch (err) {
      setError(err.message || "Could not delete announcement");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6" data-testid="announcements-panel">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-ink">Announcements</h2>
          <p className="text-sm text-ink-mute">
            Messages shown to every student on their dashboard
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((s) => !s)}
          data-testid="announcement-new"
          className="flex items-center bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-full shadow-soft font-semibold text-sm"
        >
          <FaPlus className="mr-2" /> New Announcement
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
          onSubmit={publish}
          className="bg-white p-6 rounded-2xl shadow-soft"
          data-testid="announcement-form"
        >
          <h3 className="font-bold text-ink mb-4">Publish an announcement</h3>
          <label className="text-xs font-semibold text-ink-soft">
            Title
            <input
              type="text"
              required
              maxLength={120}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Canteen closed on Friday"
              className="block mt-1 w-full p-2.5 rounded-xl border border-stone-200 bg-stone-50 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
            />
          </label>
          <label className="text-xs font-semibold text-ink-soft mt-3 block">
            Message
            <textarea
              required
              rows={4}
              maxLength={2000}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              placeholder="Tell students what they need to know..."
              className="block mt-1 w-full p-2.5 rounded-xl border border-stone-200 bg-stone-50 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
            />
          </label>
          <div className="flex flex-wrap items-center gap-4 mt-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
              <input
                type="checkbox"
                checked={form.pinned}
                onChange={(e) => setForm({ ...form, pinned: e.target.checked })}
                className="w-4 h-4 accent-brand-500"
              />
              Pin to top
            </label>
            <label className="text-xs font-semibold text-ink-soft flex-1 min-w-[200px]">
              Expires at (optional)
              <input
                type="datetime-local"
                value={form.expiresAt}
                onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                className="block mt-1 w-full p-2.5 rounded-xl border border-stone-200 bg-stone-50 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
              />
            </label>
          </div>
          <div className="flex gap-2 mt-5">
            <button
              type="submit"
              className="bg-brand-500 hover:bg-brand-600 text-white font-bold py-2 px-5 rounded-full shadow-soft"
            >
              Publish
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
        <p className="text-ink-mute">Loading announcements...</p>
      ) : announcements.length === 0 ? (
        <div className="bg-white p-8 rounded-2xl shadow-soft text-center">
          <FaBullhorn className="text-3xl text-brand-300 mx-auto mb-3" />
          <p className="text-ink-mute">No announcements yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => {
            const expired =
              a.expiresAt && new Date(a.expiresAt).getTime() < Date.now();
            return (
              <motion.div
                key={a._id}
                layout
                data-testid="announcement-card"
                className={`bg-white p-5 rounded-2xl shadow-soft border-l-8 ${
                  a.active !== true || expired ? "border-stone-300 opacity-75" : "border-brand-500"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-ink flex items-center gap-2 flex-wrap">
                      {a.pinned && (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-brand-500 text-white px-2 py-0.5 rounded-full font-bold">
                          <FaThumbtack /> PINNED
                        </span>
                      )}
                      {a.title}
                    </p>
                    <p className="text-sm text-ink-soft mt-1 whitespace-pre-line">{a.body}</p>
                    <p className="text-[11px] text-ink-mute mt-2">
                      {a.author?.name ? `by ${a.author.name} · ` : ""}
                      {new Date(a.createdAt).toLocaleString()}
                      {a.expiresAt && ` · expires ${new Date(a.expiresAt).toLocaleString()}`}
                      {expired && <span className="ml-2 text-red-600 font-semibold">expired</span>}
                    </p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={busyId === a._id}
                      onClick={() =>
                        patch(a, { active: a.active !== true }, a.active === true ? "Announcement retired" : "Announcement reactivated")
                      }
                      data-testid={`announcement-toggle-${a._id}`}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold disabled:opacity-50 ${
                        a.active === true
                          ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                          : "bg-green-100 text-green-700 hover:bg-green-200"
                      }`}
                    >
                      {a.active === true ? "Retire" : "Reactivate"}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === a._id}
                      onClick={() => patch(a, { pinned: a.pinned !== true }, a.pinned !== true ? "Announcement pinned" : "Announcement unpinned")}
                      data-testid={`announcement-pin-${a._id}`}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold bg-brand-100 text-brand-800 hover:bg-brand-200 disabled:opacity-50"
                    >
                      {a.pinned ? "Unpin" : "Pin"}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === a._id}
                      onClick={() => remove(a)}
                      data-testid={`announcement-delete-${a._id}`}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50"
                    >
                      <FaTrash />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
