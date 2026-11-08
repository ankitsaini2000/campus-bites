import React, { useState, useEffect } from "react";
import api, { getToken, clearToken } from "./api";
import Login from "./components/Login";
import Signup from "./components/Signup";
import OfflineLudo from "./components/OfflineLudo";
import StudentDashboard from "./components/StudentDashboard";
import AdminDashboard from "./components/AdminDashboard";
import KitchenDisplay from "./components/KitchenDisplay";
import useOffline from "./hooks/useOffline";

export default function App() {
  const [userRole, setUserRole] = useState(null);
  const [userName, setUserName] = useState("");
  const [showLogin, setShowLogin] = useState(true);
  const [checkingSession, setCheckingSession] = useState(true);
  // True when the browser reports no network.
  const isOffline = useOffline();
  // Set when /auth/me failed for a non-auth reason (network, timeout, 5xx):
  // the stored token is kept and the user is offered a retry instead of
  // silently landing on the login screen as if they had signed out.
  const [sessionFailed, setSessionFailed] = useState(false);
  // Staff and admins can switch between the admin board and the kitchen display.
  const [screen, setScreen] = useState("dashboard");

  // Restore the session from a stored token.
  const checkSession = () => {
    const token = getToken();
    if (!token) {
      setCheckingSession(false);
      return;
    }

    api
      .get("/auth/me")
      .then((res) => {
        setUserRole(res.data.role);
        setUserName(res.data.name);
      })
      .catch((err) => {
        if (err?.status === 401) {
          // Expired, revoked, or the account was removed.
          clearToken();
        } else {
          // Network problem or backend down — the session itself is fine.
          setSessionFailed(true);
        }
      })
      .finally(() => {
        setCheckingSession(false);
      });
  };

  useEffect(() => {
    checkSession();
  }, []);

  // If the page was loaded offline (session check failed) and the network
  // comes back, re-check automatically so the dashboard returns without the
  // user having to press Retry.
  useEffect(() => {
    if (!isOffline && sessionFailed) {
      setSessionFailed(false);
      setCheckingSession(true);
      checkSession();
    }
  }, [isOffline]);

  // Keep the API warm: the free hosting tier spins
  // down after ~15 idle minutes, which made the
  // first click after a pause take 10-15s. A tiny
  // ping every 5 minutes while a tab is open keeps
  // the service awake.
  useEffect(() => {
    const t = setInterval(() => {
      api.get("/settings").catch(() => {});
    }, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const handleLogout = () => {
    // Best-effort server acknowledgement; the local token is what signs out.
    api.post("/auth/logout").catch(() => {});
    clearToken();
    setUserRole(null);
    setUserName("");
    setShowLogin(true);
    setScreen("dashboard");
  };

  // While offline the whole app (login, student or staff dashboard) yields to
  // the Ludo overlay. This takes precedence over the session check/retry
  // screen: if the browser has no network, checking a session cannot work and
  // the user should get the offline game instead. When the network returns,
  // the normal flow resumes.
  if (isOffline) {
    return <OfflineLudo />;
  }

  // Avoid flashing the login form while validating a stored token.
  if (checkingSession) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-cream">
        <div className="flex items-center gap-3 text-ink-mute">
          <span className="w-3 h-3 rounded-full bg-brand-500 animate-pulse" />
          <p className="font-semibold">Warming up the kitchen...</p>
        </div>
      </div>
    );
  }

  // The backend could not be reached while restoring the session. Show a
  // retry screen instead of silently dropping the user to the login form.
  if (sessionFailed && !userRole) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-soft border border-brand-100 max-w-sm w-full p-8 text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-brand-50 flex items-center justify-center mb-4">
            <span className="text-2xl" aria-hidden="true">📡</span>
          </div>
          <h1 className="text-lg font-bold text-ink mb-1">Can&apos;t reach the kitchen</h1>
          <p className="text-sm text-ink-mute mb-6">
            We couldn&apos;t check your session. Check your connection and retry.
          </p>
          <button
            type="button"
            onClick={() => {
              setSessionFailed(false);
              setCheckingSession(true);
              checkSession();
            }}
            className="w-full py-3 rounded-2xl bg-brand-500 hover:bg-brand-600 text-white font-semibold"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!userRole) {
    return showLogin ? (
      <Login
        setUserRole={setUserRole}
        setUserName={setUserName}
        switchPage={() => setShowLogin(false)}
      />
    ) : (
      <Signup
        setUserRole={setUserRole}
        setUserName={setUserName}
        switchPage={() => setShowLogin(true)}
      />
    );
  }

  const isStaff = userRole === "admin" || userRole === "staff";

  if (isStaff) {
    return screen === "kitchen" ? (
      <KitchenDisplay
        name={userName}
        role={userRole}
        onLogout={handleLogout}
        onBack={() => setScreen("dashboard")}
      />
    ) : (
      <AdminDashboard
        name={userName}
        role={userRole}
        onLogout={handleLogout}
        onOpenKitchen={() => setScreen("kitchen")}
        screen={screen}
      />
    );
  }

  return <StudentDashboard name={userName} onLogout={handleLogout} />;
}