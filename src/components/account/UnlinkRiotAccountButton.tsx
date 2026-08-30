"use client";

import { useTransition } from "react";
import { unlinkRiotAccount } from "@/actions/riotAccount";

export function UnlinkRiotAccountButton({ linkedAccountId }: { linkedAccountId: string }) {
  const [isPending, startTransition] = useTransition();

  function handleUnlink() {
    if (!confirm("Unlink this Riot account? This deletes the stored session token immediately and stops shop checking.")) {
      return;
    }
    startTransition(() => unlinkRiotAccount(linkedAccountId));
  }

  return (
    <button
      type="button"
      onClick={handleUnlink}
      disabled={isPending}
      className="text-[11px] font-semibold uppercase tracking-widest text-muted hover:text-accent transition-colors disabled:opacity-50"
    >
      {isPending ? "Unlinking…" : "Unlink"}
    </button>
  );
}
