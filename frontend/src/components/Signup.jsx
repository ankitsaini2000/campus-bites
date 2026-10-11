import React, { useEffect, useState } from "react";
import { FaFire, FaInfoCircle } from "react-icons/fa";
import api, { setToken } from "../api";

/**
 * Public registration with email verification.
 *
 * Step 1 collects the student's details and asks
 * the server to send a code to their IET Lucknow
 * address. Step 2 enters that code. The account
 * is created only when the code checks out — the
 * server stores nothing before that, so an
 * unverified address can never sign in.
 *
 * The role selector is absent because the backend
 * always forces the "student" role; administrators
 * are provisioned with `npm run seed:admin`.
 */
export default function Signup({ switchPage, setUserRole, setUserName }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Resend and expiry bookkeeping for the countdowns.
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [expiresLeft, setExpiresLeft] = useState(0);
  const [usedToday, setUsedToday] = useState(0);
  const [dailyLimit, setDailyLimit] = useState(5);

  // One-second countdowns for the resend
  // cooldown and the code's own expiry.
  useEffect(() => {
    if (cooldownLeft <= 0 && expiresLeft <= 0) return;
    const t = setInterval(() => {
      setCooldownLeft((s) => Math.max(0, s - 1));
      setExpiresLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [cooldownLeft > 0 || expiresLeft > 0]);

  /** Ask the server to send a verification code. */
  const sendCode = async (e) => {
    e?.preventDefault();
    setError("");

    if (!name.trim() || !email || !password) {
      setError("All fields are required.");
      return;
    }

    setBusy(true);
    try {
      const res = await api.post("/auth/request-otp", { email });
      setStep(2);
      setCooldownLeft(res.data.cooldownSeconds);
      setExpiresLeft(res.data.expiresIn);
      setUsedToday(res.data.usedToday);
      setDailyLimit(res.data.dailyLimit);
    } catch (err) {
      setError(err.message || "Could not send the code");
    } finally {
      setBusy(false);
    }
  };

  /** Verify the code — this is what creates the account. */
  const verify = async (e) => {
    e.preventDefault();
    setError("");

    if (!/^\d{6}$/.test(otp)) {
      setError("Enter the 6-digit code from your email.");
      return;
    }

    setBusy(true);
    try {
      const res = await api.post("/auth/verify-otp", {
        email,
        otp,
        name,
        password,
      });
      // The account exists now — signed in immediately.
      setToken(res.data.token);
      setUserRole(res.data.role);
      setUserName(res.data.name);
    } catch (err) {
      setError(err.message || "Verification failed");
    } finally {
      setBusy(false);
    }
  };

  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

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
          {step === 1 ? (
            <>
              <h2 className="text-2xl font-extrabold text-ink text-center">
                Create your student account
              </h2>
              <p className="text-sm text-ink-mute text-center mt-1 mb-6">
                Join the canteen — order ahead, skip the rush.
              </p>

              <form onSubmit={sendCode} className="space-y-4">
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
                    placeholder="2400520100107@ietlucknow.ac.in"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-ink placeholder:text-ink-mute/60 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition"
                  />
                  <p className="mt-1.5 text-xs text-ink-mute">
                    Use your IET Lucknow email — any roll number at{" "}
                    <span className="font-semibold text-ink-soft">
                      @ietlucknow.ac.in
                    </span>{" "}
                    works. We email it a code to confirm you own the
                    address.
                  </p>
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
                  {busy ? "Sending code..." : "Send verification code"}
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-extrabold text-ink text-center">
                Check your email
              </h2>
              <p className="text-sm text-ink-mute text-center mt-1 mb-6">
                We sent a 6-digit code to{" "}
                <span className="font-semibold text-ink-soft">{email}</span>.
                {expiresLeft > 0 && (
                  <>
                    {" "}
                    It expires in{" "}
                    <span className="font-semibold text-ink-soft">
                      {fmt(expiresLeft)}
                    </span>
                    .
                  </>
                )}
              </p>

              <form onSubmit={verify} className="space-y-4">
                {error && (
                  <p
                    role="alert"
                    className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3"
                  >
                    {error}
                  </p>
                )}

                <div>
                  <label className="block text-sm font-semibold text-ink mb-1.5" htmlFor="signup-otp">
                    Verification code
                  </label>
                  <input
                    id="signup-otp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="000000"
                    value={otp}
                    onChange={(e) =>
                      setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-ink tracking-[0.5em] text-center text-lg placeholder:text-ink-mute/60 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition"
                  />
                </div>

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-xl bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white font-bold py-3 transition-colors shadow-soft"
                >
                  {busy ? "Creating account..." : "Verify & create account"}
                </button>

                <div className="text-center">
                  {cooldownLeft > 0 ? (
                    <p className="text-sm text-ink-mute">
                      Resend available in {fmt(cooldownLeft)}
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={sendCode}
                      disabled={busy}
                      className="text-brand-600 cursor-pointer font-semibold hover:underline bg-transparent disabled:opacity-60"
                    >
                      Resend code ({usedToday}/{dailyLimit} today)
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setStep(1);
                    setOtp("");
                    setError("");
                  }}
                  className="w-full text-center text-sm text-ink-mute hover:text-ink cursor-pointer bg-transparent transition-colors"
                >
                  Use a different email address
                </button>
              </form>
            </>
          )}

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
          IET Lucknow student accounts only — staff and admin accounts are
          created by canteen administrators.
        </p>
      </div>
    </div>
  );
}
