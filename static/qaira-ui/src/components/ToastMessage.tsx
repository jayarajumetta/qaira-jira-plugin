import { useEffect, useRef, useState } from "react";

export function ToastMessage({
  message,
  tone = "success",
  onDismiss
}: {
  message: string;
  tone?: "success" | "error" | "info";
  onDismiss: () => void;
}) {
  const EXIT_MS = 220;
  const dismissTimeoutRef = useRef<number | null>(null);
  const closeTimeoutRef = useRef<number | null>(null);
  const onDismissRef = useRef(onDismiss);
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!message) {
      setIsLeaving(false);
      return undefined;
    }

    const duration = tone === "error" ? 6000 : 4200;
    setIsLeaving(false);

    const exitTimer = window.setTimeout(() => setIsLeaving(true), Math.max(duration - EXIT_MS, 0));
    dismissTimeoutRef.current = window.setTimeout(() => {
      dismissTimeoutRef.current = null;
      onDismissRef.current();
    }, duration);

    return () => {
      window.clearTimeout(exitTimer);
      if (dismissTimeoutRef.current !== null) {
        window.clearTimeout(dismissTimeoutRef.current);
        dismissTimeoutRef.current = null;
      }
      if (closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
    };
  }, [message, tone]);

  if (!message) {
    return null;
  }

  const handleDismiss = () => {
    if (dismissTimeoutRef.current !== null) {
      window.clearTimeout(dismissTimeoutRef.current);
      dismissTimeoutRef.current = null;
    }
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }

    setIsLeaving(true);
    closeTimeoutRef.current = window.setTimeout(() => {
      closeTimeoutRef.current = null;
      onDismissRef.current();
    }, EXIT_MS);
  };

  return (
    <div
      aria-atomic="true"
      aria-live={tone === "error" ? "assertive" : "polite"}
      className={isLeaving ? `toast-message is-${tone} is-leaving` : `toast-message is-${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <p>{message}</p>
      <button aria-label="Dismiss message" className="toast-dismiss" onClick={handleDismiss} type="button">
        Dismiss
      </button>
    </div>
  );
}
