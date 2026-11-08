import { useEffect, useState } from "react";

/**
 * True while the browser reports no network. Initialised from
 * navigator.onLine and kept in sync via the window online/offline events,
 * which fire whenever the connection state changes. The listener pair is
 * added once and removed on unmount.
 */
export default function useOffline() {
  const [isOffline, setIsOffline] = useState(
    () => typeof navigator !== "undefined" && !navigator.onLine
  );

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  return isOffline;
}
