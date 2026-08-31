"use client";

import { useState, useTransition } from "react";
import { checkShopNowAction, type RiotActionResult } from "@/actions/riotAccount";

export function CheckShopNowButton({ linkedAccountId }: { linkedAccountId: string }) {
  const [result, setResult] = useState<RiotActionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      setResult(await checkShopNowAction(linkedAccountId));
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="text-[11px] font-semibold uppercase tracking-widest text-muted hover:text-accent transition-colors disabled:opacity-50"
      >
        {isPending ? "Checking…" : "Check shop now"}
      </button>
      {result ? (
        <p className={`mt-2 text-[11px] ${result.ok ? "text-green-400" : "text-accent"}`}>{result.message}</p>
      ) : null}
    </div>
  );
}
