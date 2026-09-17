"use client";

import { useState, useTransition } from "react";
import { setWishlistNotificationsEnabled } from "@/actions/notifications";

export function NotificationToggle({ enabled }: { enabled: boolean }) {
  const [isOn, setIsOn] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    const next = !isOn;
    setIsOn(next);
    setError(null);
    startTransition(async () => {
      const result = await setWishlistNotificationsEnabled(next);
      if (!result.ok) {
        setIsOn(!next);
        setError(result.message);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={isOn}
        onClick={handleToggle}
        disabled={isPending}
        className={`clip-notch-sm border px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest transition-colors disabled:opacity-50 ${
          isOn
            ? "border-accent bg-accent text-accent-contrast hover:bg-accent-dark"
            : "border-border text-muted hover:text-foreground"
        }`}
      >
        {isOn ? "On" : "Off"}
      </button>
      {error ? <p className="text-[11px] text-accent">{error}</p> : null}
    </div>
  );
}
