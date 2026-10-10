import React, { useEffect, useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import {
  FaSearch,
  FaUserShield,
  FaUserGraduate,
  FaUserCheck,
  FaUserTimes,
  FaKey,
} from "react-icons/fa";
import api from "../api";

const ROLE_FILTERS = [
  { key: "", label: "All roles" },
  { key: "student", label: "Students" },
  { key: "staff", label: "Staff" },
  { key: "admin", label: "Admins" },
];

const ROLE_BADGE = {
  admin: "bg-purple-100 text-purple-700",
  staff: "bg-brand-100 text-brand-800",
  student: "bg-sky-100 text-sky-700",
};

export default function UsersPanel() {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState(null);
  // Debounce the search so typing does not fire a request per keystroke.
  const [searchTerm, setSearchTerm] = useState("");
  const debounceRef = useRef(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (searchTerm) params.set("search", searchTerm);
    if (roleFilter) params.set("role", roleFilter);
    params.set("limit", "100");

    try {
      const res = await api.get(`/users?${params.toString()}`);
      setUsers(res.data.users || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      setError(err.message || "Could not load users");
    } finally {
      setLoading(false);
    }
  }, [searchTerm, roleFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearchTerm(search), 300);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  const flash = (message) => {
    setNotice(message);
    setTimeout(() => setNotice(""), 6000);
  };

  /** Promote student -> staff or demote staff -> student. */
  const changeRole = async (user) => {
    const nextRole = user.role === "student" ? "staff" : "student";
    const action = nextRole === "staff" ? "promote" : "demote";
    if (
      !window.confirm(
        `${action === "promote" ? "Promote" : "Demote"} ${user.name} (${user.email}) to ${nextRole}?`
      )
    ) {
      return;
    }

    setError("");
    setBusyId(user._id);
    try {
      const res = await api.patch(`/users/${user._id}`, { role: nextRole });
      setUsers((prev) => prev.map((u) => (u._id === res.data._id ? res.data : u)));
      flash(`${user.name} is now ${nextRole}`);
    } catch (err) {
      setError(err.message || "Could not change role");
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = async (user) => {
    const activating = user.isActive === false;
    if (
      !window.confirm(
        activating
          ? `Reactivate ${user.name}? They will be able to log in again.`
          : `Deactivate ${user.name}? Their token stops working immediately.`
      )
    ) {
      return;
    }

    setError("");
    setBusyId(user._id);
    try {
      const res = await api.patch(`/users/${user._id}`, { isActive: activating });
      setUsers((prev) => prev.map((u) => (u._id === res.data._id ? res.data : u)));
      flash(activating ? `${user.name} reactivated` : `${user.name} deactivated`);
    } catch (err) {
      setError(err.message || "Could not update account state");
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Reset a password. An admin may type a new one; leaving the
   * prompt empty generates a temporary password, shown once here
   * so it can be handed over out-of-band.
   */
  const resetPassword = async (user) => {
    const entered = window.prompt(
      `New password for ${user.name} (${user.email}) — at least 8 characters.\nLeave empty to generate a temporary one:`,
      ""
    );
    if (entered === null) return;

    setError("");
    setBusyId(user._id);
    try {
      const res = await api.post(`/users/${user._id}/reset-password`, {
        password: entered.trim() || undefined,
      });
      if (res.data.tempPassword) {
        flash(`Temporary password for ${user.name}: ${res.data.tempPassword} (show this to them once, then it is no longer displayed)`);
      } else {
        flash(`Password reset for ${user.name}`);
      }
    } catch (err) {
      setError(err.message || "Could not reset password");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-soft" data-testid="users-panel">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div>
          <h2 className="text-2xl font-bold text-ink">User Management</h2>
          <p className="text-sm text-ink-mute">{total} account{total === 1 ? "" : "s"}</p>
        </div>
      </div>

      {error && (
        <p role="alert" className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mb-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
          {notice}
        </p>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-5">
        <div className="relative flex-1 min-w-[200px]">
          <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute text-sm" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or email"
            aria-label="Search users"
            data-testid="users-search"
            className="w-full p-2.5 pl-9 rounded-xl border border-stone-200 bg-stone-50 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
          />
        </div>
        <div className="flex gap-1" data-testid="users-role-filters">
          {ROLE_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setRoleFilter(f.key)}
              aria-pressed={roleFilter === f.key}
              className={`px-3 py-1.5 rounded-full text-sm font-semibold ${
                roleFilter === f.key
                  ? "bg-brand-500 text-white"
                  : "bg-brand-50 text-brand-800 hover:bg-brand-100"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-ink-mute">Loading users...</p>
      ) : users.length === 0 ? (
        <p className="text-ink-mute">No users match these filters.</p>
      ) : (
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-ink-mute border-b border-stone-200">
                <th className="py-2 px-2">Name</th>
                <th className="py-2 px-2">Email</th>
                <th className="py-2 px-2">Role</th>
                <th className="py-2 px-2">Status</th>
                <th className="py-2 px-2">Joined</th>
                <th className="py-2 px-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody data-testid="users-rows">
              {users.map((user) => (
                <motion.tr
                  key={user._id}
                  layout
                  className="border-b border-stone-100"
                  data-user-id={user._id}
                >
                  <td className="py-2.5 px-2 font-semibold text-ink">{user.name}</td>
                  <td className="py-2.5 px-2 text-ink-soft">{user.email}</td>
                  <td className="py-2.5 px-2">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${
                        ROLE_BADGE[user.role] || "bg-stone-100 text-stone-600"
                      }`}
                    >
                      {user.role === "admin" ? <FaUserShield /> : user.role === "staff" ? <FaUserCheck /> : <FaUserGraduate />}
                      {user.role}
                    </span>
                  </td>
                  <td className="py-2.5 px-2">
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-semibold ${
                        user.isActive === false ? "text-red-600" : "text-green-600"
                      }`}
                    >
                      {user.isActive === false ? <FaUserTimes /> : <FaUserCheck />}
                      {user.isActive === false ? "Inactive" : "Active"}
                    </span>
                  </td>
                  <td className="py-2.5 px-2 text-ink-mute">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-2.5 px-2">
                    <div className="flex justify-end gap-1.5 flex-wrap">
                      {user.role !== "admin" && (
                        <button
                          type="button"
                          disabled={busyId === user._id}
                          onClick={() => changeRole(user)}
                          data-testid={`role-${user._id}`}
                          className="px-2.5 py-1 rounded-full text-xs font-semibold bg-brand-100 text-brand-800 hover:bg-brand-200 disabled:opacity-50"
                        >
                          {user.role === "student" ? "Promote to staff" : "Demote to student"}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busyId === user._id}
                        onClick={() => toggleActive(user)}
                        data-testid={`active-${user._id}`}
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold disabled:opacity-50 ${
                          user.isActive === false
                            ? "bg-green-100 text-green-700 hover:bg-green-200"
                            : "bg-amber-100 text-amber-700 hover:bg-amber-200"
                        }`}
                      >
                        {user.isActive === false ? "Reactivate" : "Deactivate"}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === user._id}
                        onClick={() => resetPassword(user)}
                        data-testid={`reset-${user._id}`}
                        className="px-2.5 py-1 rounded-full text-xs font-semibold bg-stone-100 text-stone-700 hover:bg-stone-200 disabled:opacity-50"
                      >
                        <FaKey className="mr-1" /> Reset password
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-ink-mute mt-4">
        Admins are provisioned with <code>npm run seed:admin</code> and cannot be created,
        demoted or deactivated from here — at least one active administrator must always remain.
      </p>
    </div>
  );
}
