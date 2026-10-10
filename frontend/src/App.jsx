import React, { useState, useEffect } from "react";
import api, { getToken, clearToken } from "./api";
import Login from "./components/Login";
import Signup from "./components/Signup";
import StudentDashboard from "./components/StudentDashboard";
import AdminDashboard from "./components/AdminDashboard";
import KitchenDisplay from "./components/KitchenDisplay";

export default function App() {
  const [userRole, setUserRole] = useState(null);
  const [userName, setUserName] = useState("");
  const [showLogin, setShowLogin] = useState(true);
  const [checkingSession, setCheckingSession] = useState(true);
  // Staff and admins can switch between the admin board and the kitchen display.
  const [screen, setScreen] = useState("dashboard");

  // Restore the session from a stored token.
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setCheckingSession(false);
      return;
    }

    let cancelled = false;
    api
      .get("/auth/me")
      .then((res) => {
        if (cancelled) return;
        setUserRole(res.data.role);
        setUserName(res.data.name);
      })
      .catch(() => {
        // Expired, revoked, or the account was removed.
        if (!cancelled) clearToken();
      })
      .finally(() => {
        if (!cancelled) setCheckingSession(false);
      });

    return () => {
      cancelled = true;
    };
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