import React, { useState } from "react";
import { FaFire, FaBolt, FaInfoCircle } from "react-icons/fa";
import api, { setToken } from "../api";

/**
 * Campus Bites login — split screen per the Stitch design:
 * brand hero on the left, the sign-in card on the right.
 */
export default function Login({ setUserRole, setUserName, switchPage }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Please enter your email and password.");
      return;
    }

    setBusy(true);
    try {
      const res = await api.post("/auth/login", { email, password });
      setToken(res.data.token);
      setUserRole(res.data.role);
      setUserName(res.data.name);
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream flex flex-col lg:flex-row">
      {/* Brand hero */}
      <div className="relative hidden lg:flex flex-1 flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-600 via-brand-500 to-amber-400 p-12 text-white">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-11 h-11 rounded-2xl bg-white/15 backdrop-blur">
            <FaFire className="text-2xl" />
          </span>
          <div>
            <p className="text-2xl font-extrabold leading-none">Campus Bites</p>
            <p className="text-[11px] uppercase tracking-[0.2em] text-white/80 mt-1">
              Student Central
            </p>
          </div>
        </div>

        <div className="max-w-md">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold">
            <FaBolt className="text-amber-200" /> Skip the line — order ahead
          </p>
          <h1 className="mt-5 text-5xl font-extrabold leading-tight">
            Hungry? We have got you covered.
          </h1>
          <p className="mt-4 text-lg text-white/85">
            Order from your campus canteen in seconds. Live kitchen tracking,
            rush-hour wait times, and counter pickup.
          </p>
          <div className="mt-9 grid grid-cols-3 gap-4">
            {[
              ["12,400+", "Daily campus orders"],
              ["4", "Counters across campus"],
              ["< 6 min", "Average pickup speed"],
            ].map(([value, label]) => (
              <div key={label}>
                <p className="text-2xl font-extrabold">{value}</p>
                <p className="text-xs text-white/75 mt-1">{label}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-white/70">
          Campus Bites · University Canteen Network
        </p>
      </div>

      {/* Sign-in form */}
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8 flex items-center gap-3">
            <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-brand-500 text-white shadow-soft">
              <FaFire />
            </span>
            <div>
              <p className="text-xl font-extrabold text-ink leading-none">Campus Bites</p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-ink-mute mt-1">
                Student Central
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lift p-8">
            <h2 className="text-2xl font-extrabold text-ink">Welcome back</h2>
            <p className="text-sm text-ink-mute mt-1 mb-6">
              Sign in to check today&apos;s menu, your tray, and live order status.
            </p>

            <form onSubmit={handleLogin} className="space-y-4">
              {error && (
                <p
                  role="alert"
                  className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3"
                >
                  {error}
                </p>
              )}

              <div>
                <label
                  className="block text-sm font-semibold text-ink mb-1.5"
                  htmlFor="email"
                >
                  College email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-ink placeholder:text-ink-mute/60 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition"
                />
              </div>

              <div>
                <label
                  className="block text-sm font-semibold text-ink mb-1.5"
                  htmlFor="password"
                >
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Password"
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
                {busy ? "Logging in..." : "Login"}
              </button>
            </form>

            <p className="mt-5 text-center text-sm text-ink-mute">
              New here?{" "}
              <button
                type="button"
                onClick={switchPage}
                className="text-brand-600 cursor-pointer font-semibold hover:underline bg-transparent"
              >
                Create a student account
              </button>
            </p>
          </div>

          <p className="mt-4 flex items-start gap-2 text-xs text-ink-mute">
            <FaInfoCircle className="mt-0.5 shrink-0 text-brand-400" />
            Staff accounts are provisioned by canteen administrators.
          </p>
        </div>
      </div>
    </div>
  );
}
