"use client";

import { useState, useTransition } from "react";
import { linkRiotAccountAction, type RiotActionResult } from "@/actions/riotAccount";

export function LinkRiotAccountForm() {
  const [ssid, setSsid] = useState("");
  const [result, setResult] = useState<RiotActionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!ssid.trim()) return;
    startTransition(async () => {
      const next = await linkRiotAccountAction(ssid);
      setResult(next);
      // Clear the field either way - it's a live session credential and there
      // is no reason for it to sit in the DOM after submission.
      setSsid("");
    });
  }

  return (
    <div>
      <ol className="mt-4 space-y-2 text-xs text-muted">
        <li>
          <span className="font-semibold text-foreground">1.</span> Sign in at{" "}
          <a
            href="https://auth.riotgames.com/login"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-foreground"
          >
            auth.riotgames.com
          </a>{" "}
          in your own browser, the normal way.
        </li>
        <li>
          <span className="font-semibold text-foreground">2.</span> Open DevTools (F12) →{" "}
          <span className="text-foreground">Application</span> → <span className="text-foreground">Cookies</span> →{" "}
          <span className="text-foreground">https://auth.riotgames.com</span>
        </li>
        <li>
          <span className="font-semibold text-foreground">3.</span> Find the cookie named{" "}
          <code className="bg-background px-1 text-foreground">ssid</code> and copy its <em>Value</em> (just the value).
        </li>
      </ol>

      <form onSubmit={handleSubmit} className="mt-4">
        <label className="flex flex-col gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
          ssid cookie value
          <input
            type="password"
            value={ssid}
            onChange={(e) => setSsid(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="Paste the ssid value here"
            className="rounded-none border border-border bg-background px-3 py-2 font-mono text-sm text-foreground focus:border-accent focus:outline-none transition-colors"
          />
        </label>

        <button
          type="submit"
          disabled={isPending || !ssid.trim()}
          className="clip-notch-sm mt-3 bg-accent px-6 py-2 text-sm font-bold uppercase tracking-widest text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Linking…" : "Link account"}
        </button>
      </form>

      {result ? (
        <p
          className={`clip-notch-sm mt-3 border px-3 py-2 text-xs ${
            result.ok ? "border-green-500/40 text-green-400" : "border-accent/40 text-accent"
          }`}
        >
          {result.message}
        </p>
      ) : null}

      <p className="mt-4 text-[11px] text-muted">
        Treat this value like a password - it grants access to your Riot session. We encrypt it before storing it, only
        ever send it to Riot, and delete it the moment you unlink. It typically stops working after about a week, at
        which point you&rsquo;ll need to repeat these steps.
      </p>
    </div>
  );
}
