import React, { useState } from "react";
import { FaFire, FaInfoCircle } from "react-icons/fa";
import api, { setToken } from "../api";

/**
 * Public registration.
 *
 * The role selector was removed: the backend always forces the "student"
 * role on this endpoint and ignores any submitted role, so offering the
 * choice would have been misleading. Administrators are provisioned with
 * `npm run seed:admin`.
 */
export default function Signup({ switchPage, setUserRole, setUserName }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSignup = async (e) => {
    e.preventDefault();
    setError("");

    if (!name || !email || !password) {
      setError("All fields are required.");
      return;
    }

    setBusy(true);
    try {
      // 1. Create the account. No role is sent, and none is honoured.
      await api.post("/auth/signup", { name, email, password });

      // 2. Sign in automatically.
      const res = await api.post("/auth/login", { email, password });

      // 3. Persist the session.
      setToken(res.data.token);
      setUserRole(res.data.role);
      setUserName(res.data.name);

      // 4. Reset the form.
      setName("");
      setEmail("");
      setPassword("");
    } catch (err) {
      setError(err.message || "Signup failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-3">
          <span className="flex items-center justify-center w-12 h-12 rounded-2xl bg-brand-500 text-white shadow-lift">
            <FaFire className="text-2xl" />
          </span>
          <div>
            <p className="text-2xl font-extrabold text-ink leading-none">Campus Bites</p>
            <p className="text-[10px] uppercase tracking-[0.2em] text-ink-mute mt-1">
              Student Central
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lift p-8">
          <h1 className="text-2xl font-extrabold text-ink text-center">
            Create your student account
          </h1>
          <p className="text-sm text-ink-mute text-center mt-1 mb-6">
            Join the canteen — order ahead, skip the rush.
          </p>

          <form onSubmit={handleSignup} className="space-y-4">
            {error && (
              <p
                role="alert"
                className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3"
              >
                {error}
              </p>
            )}

            <div>
              <label className="block text-sm font-semibold text-ink mb-1.5" htmlFor="name">
                Full Name
              </label>
              <input
                id="name"
                type="text"
                autoComplete="name"
                placeholder="Full Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-ink placeholder:text-ink-mute/60 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-ink mb-1.5" htmlFor="signup-email">
                Email
              </label>
              <input
                id="signup-email"
                type="email"
                autoComplete="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-ink placeholder:text-ink-mute/60 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-ink mb-1.5" htmlFor="signup-password">
                Password
              </label>
              <input
                id="signup-password"
                type="password"
                autoComplete="new-password"
                placeholder="Password (min 8 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-ink placeholder:text-ink-mute/60 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition"
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white font-bold py-3 transition-colors shadow-soft"
            >
              {busy ? "Creating account..." : "Create account"}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-ink-mute">
            Already have an account?{" "}
            <button
              type="button"
              onClick={switchPage}
              className="text-brand-600 cursor-pointer font-semibold hover:underline bg-transparent"
            >
              Login here
            </button>
          </p>
        </div>

        <p className="mt-4 flex items-start justify-center gap-2 text-xs text-ink-mute text-center">
          <FaInfoCircle className="mt-0.5 shrink-0 text-brand-400" />
          For students of the Institute of Engineering and Technology
          (IET), Lucknow — staff and admin accounts are created by
          canteen administrators.
        </p>
      </div>
    </div>
  );
}
