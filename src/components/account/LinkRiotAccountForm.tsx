"use client";

import { useState, useTransition } from "react";
import { linkRiotAccountAction, type RiotActionResult } from "@/actions/riotAccount";

export function LinkRiotAccountForm({ authorizeUrl }: { authorizeUrl: string }) {
  const [redirectUrl, setRedirectUrl] = useState("");
  const [result, setResult] = useState<RiotActionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!redirectUrl.trim()) return;
    startTransition(async () => {
      const next = await linkRiotAccountAction(redirectUrl);
      setResult(next);
      // The pasted value contains a single-use authorization code. It's spent
      // now either way, so there's no reason to leave it sitting in the DOM.
      setRedirectUrl("");
    });
  }

  return (
    <div>
      <p className="clip-notch-sm mt-4 border border-border bg-background p-3 text-xs text-muted">
        <span className="font-semibold uppercase tracking-wider text-foreground">This is not a Riot login.</span>{" "}
        Valoadout is an independent fan project, not affiliated with or endorsed by Riot Games, Inc. You sign in on
        Riot&rsquo;s own site and we never see, ask for, or store your Riot password.
      </p>

      <ol className="mt-4 space-y-3 text-xs text-muted">
        <li>
          <span className="font-semibold text-foreground">1.</span> Sign in on Riot&rsquo;s own site:
          <a
            href={authorizeUrl}
            target="_blank"
            rel="noreferrer"
            className="clip-notch-sm mt-2 flex w-full items-center justify-center bg-[#d13639] px-6 py-2.5 text-sm font-bold uppercase tracking-widest text-white transition-colors hover:bg-[#b02d30]"
          >
            Sign in with Riot
          </a>
        </li>
        <li>
          <span className="font-semibold text-foreground">2.</span> After signing in you&rsquo;ll land on a page that{" "}
          <strong className="text-foreground">fails to load</strong> (the address starts with{" "}
          <code className="bg-background px-1">http://localhost/redirect</code>). That is expected &mdash; nothing is
          supposed to be running there.
        </li>
        <li>
          <span className="font-semibold text-foreground">3.</span> Copy that whole address out of your browser&rsquo;s
          address bar and paste it below.
        </li>
      </ol>

      <form onSubmit={handleSubmit} className="mt-4">
        <label className="flex flex-col gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
          Redirect address
          {/* Deliberately not type="password": a password field on a page
              about signing in to Riot reads as credential phishing to Safe
              Browsing, and the value is a single-use code spent on submit. */}
          <input
            type="text"
            value={redirectUrl}
            onChange={(e) => setRedirectUrl(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="http://localhost/redirect?code=..."
            className="rounded-none border border-border bg-background px-3 py-2 font-mono text-sm text-foreground focus:border-accent focus:outline-none transition-colors"
          />
        </label>

        <button
          type="submit"
          disabled={isPending || !redirectUrl.trim()}
          className="clip-notch-sm mt-3 bg-accent px-6 py-2 text-sm font-bold uppercase tracking-widest text-accent-contrast transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Linking…" : "Finish linking"}
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
        You sign in on Riot&rsquo;s own page &mdash; we never see your password. The address you paste contains a
        single-use code that expires within minutes; we exchange it for a token, encrypt that, and delete it the moment
        you unlink.
      </p>
    </div>
  );
}
