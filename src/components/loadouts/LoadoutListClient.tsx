"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createLoadout, deleteLoadout, duplicateLoadout, renameLoadout } from "@/actions/loadouts";
import { ShareLoadoutButton } from "@/components/loadouts/ShareLoadoutButton";
import { formatPriceTotal } from "@/lib/pricing";
import { MAX_NAME_LENGTH } from "@/lib/limits";
import type { listLoadouts, listAllWeapons } from "@/queries/loadouts";

type LoadoutSummary = Awaited<ReturnType<typeof listLoadouts>>[number];
type Weapon = Awaited<ReturnType<typeof listAllWeapons>>[number];

export function LoadoutListClient({ loadouts, weapons }: { loadouts: LoadoutSummary[]; weapons: Weapon[] }) {
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      {error ? (
        <p role="alert" className="mb-4 border-l-2 border-accent bg-accent/10 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-accent">
          {error}
        </p>
      ) : null}

      {/* Creation is a tile in the grid rather than a bar above it: it is a
          rare action, and a permanently visible empty text field reads as
          something that must be filled in before anything else works. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <NewLoadoutTile onError={setError} />
        {loadouts.map((loadout) => (
          <LoadoutCard key={loadout.id} loadout={loadout} weapons={weapons} onError={setError} />
        ))}
      </div>

      {loadouts.length === 0 ? (
        <p className="mt-8 text-center text-sm uppercase tracking-wide text-muted">
          No loadouts yet. Create one to start assigning skins per weapon.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Collapsed to a button until used, so the grid stays uniform and the page
 * does not open with an empty form. Expanding in place keeps the new loadout
 * where the user will look for it.
 */
function NewLoadoutTile({ onError }: { onError: (message: string | null) => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isNaming, setIsNaming] = useState(false);
  const [name, setName] = useState("");

  function create() {
    if (isPending) return;
    onError(null);
    startTransition(async () => {
      const result = await createLoadout(name);
      if (!result.ok) {
        onError(result.message);
        setIsNaming(false);
        return;
      }
      router.push(`/loadouts/${result.id}`);
    });
  }

  if (!isNaming) {
    return (
      <button
        onClick={() => setIsNaming(true)}
        className="clip-notch flex min-h-[136px] flex-col items-center justify-center gap-2 border border-dashed border-border bg-surface/40 p-5 text-muted transition-colors hover:border-accent/60 hover:bg-surface hover:text-foreground"
      >
        <span aria-hidden className="font-display text-3xl leading-none">+</span>
        <span className="text-[11px] font-semibold uppercase tracking-wider">New loadout</span>
      </button>
    );
  }

  return (
    <div className="clip-notch flex min-h-[136px] flex-col justify-center border border-accent/60 bg-surface p-5">
      <label htmlFor="new-loadout-name" className="text-[11px] font-semibold uppercase tracking-wider text-muted">
        Name
      </label>
      <input
        id="new-loadout-name"
        autoFocus
        value={name}
        // Capped here as well as server-side so the limit is visible while
        // typing rather than silently truncating on save.
        maxLength={MAX_NAME_LENGTH}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          // The button is disabled while pending; the input is not, and key
          // repeat fires keydown continuously. Without this guard, holding
          // Enter creates several loadouts and races the navigations.
          if (e.key === "Enter" && !isPending) create();
          if (e.key === "Escape") setIsNaming(false);
        }}
        placeholder="e.g. Dark & Sleek"
        className="mt-1.5 w-full rounded-none border border-border bg-background px-2 py-1.5 text-sm text-foreground transition-colors focus:border-accent focus:outline-none"
      />
      <div className="mt-3 flex gap-2">
        <button
          onClick={create}
          disabled={isPending}
          className="clip-notch-sm flex-1 bg-accent py-1.5 text-[11px] font-bold uppercase tracking-widest text-accent-contrast transition-colors hover:bg-accent-dark disabled:opacity-50"
        >
          {isPending ? "Creating..." : "Create"}
        </button>
        <button
          onClick={() => setIsNaming(false)}
          disabled={isPending}
          className="clip-notch-sm border border-border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted transition-colors hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function LoadoutCard({
  loadout,
  weapons,
  onError,
}: {
  loadout: LoadoutSummary;
  weapons: Weapon[];
  onError: (message: string | null) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isRenaming, setIsRenaming] = useState(false);
  const [name, setName] = useState(loadout.name);
  // Deleting a loadout cannot be undone, so the button asks once. Inline
  // rather than a modal: it keeps the confirmation next to the thing being
  // deleted, which is what makes it obvious *which* loadout is at stake.
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const filled = loadout.items.length;

  function commitRename() {
    setIsRenaming(false);
    const trimmed = name.trim();
    if (trimmed && trimmed !== loadout.name) {
      startTransition(() => renameLoadout(loadout.id, trimmed));
    } else {
      setName(loadout.name);
    }
  }

  function handleDuplicate() {
    onError(null);
    startTransition(async () => {
      const result = await duplicateLoadout(loadout.id);
      if (!result.ok) {
        onError(result.message);
        return;
      }
      router.push(`/loadouts/${result.id}`);
    });
  }

  return (
    <div className="clip-notch flex min-h-[136px] flex-col border border-border bg-surface p-5 transition-colors hover:border-accent/40">
      {isRenaming ? (
        <input
          autoFocus
          value={name}
          maxLength={MAX_NAME_LENGTH}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") {
              setName(loadout.name);
              setIsRenaming(false);
            }
          }}
          className="w-full border-b border-accent bg-transparent font-display text-2xl uppercase leading-none tracking-wide text-foreground focus:outline-none"
        />
      ) : (
        <Link href={`/loadouts/${loadout.id}`} className="group/name block">
          {/* The name is the only way in, so it carries the whole affordance -
              there is no separate "Open" action to get out of step with it.
              A name can be up to MAX_NAME_LENGTH characters with no spaces, so
              it needs both wrapping (break-words, or a long unbroken string
              overflows the card) and a line cap (line-clamp, or a long name
              pushes the actions out of alignment across the grid). `title`
              keeps the full text reachable when it is clipped. */}
          <h2
            title={loadout.name}
            className="font-display text-2xl uppercase leading-none tracking-wide transition-colors [overflow-wrap:anywhere] line-clamp-2 group-hover/name:text-accent"
          >
            {loadout.name}
          </h2>
        </Link>
      )}

      <p className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
        {filled} / {weapons.length} slots filled
      </p>
      <p className="mt-1 text-sm font-semibold text-accent">{formatPriceTotal(loadout.priceTotal)}</p>

      {/* mt-auto pins the actions to the bottom, so they line up across cards
          whether a name takes one line or two. */}
      <div className="mt-auto pt-4">
        {confirmingDelete ? (
          // role/aria so the swap is announced, autoFocus so the keyboard user
          // lands on the confirm rather than being dropped back to the top of
          // the document, Escape so there is a way out without a mouse.
          <div
            role="alertdialog"
            aria-label={`Delete ${loadout.name}?`}
            onKeyDown={(e) => e.key === "Escape" && setConfirmingDelete(false)}
            className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider"
          >
            <span className="text-muted">Delete?</span>
            <button
              autoFocus
              onClick={() => {
                onError(null);
                startTransition(() => deleteLoadout(loadout.id));
              }}
              disabled={isPending}
              className="text-accent transition-colors hover:text-accent-dark disabled:opacity-50"
            >
              {isPending ? "Deleting..." : "Yes, delete"}
            </button>
            <button
              onClick={() => setConfirmingDelete(false)}
              disabled={isPending}
              className="text-muted transition-colors hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] font-semibold uppercase tracking-wider">
            <button onClick={() => setIsRenaming(true)} disabled={isPending} className="text-muted transition-colors hover:text-foreground">
              Rename
            </button>
            <button onClick={handleDuplicate} disabled={isPending} className="text-muted transition-colors hover:text-foreground">
              Duplicate
            </button>
            <ShareLoadoutButton loadout={loadout} weapons={weapons} initialShareSlug={loadout.shareSlug} variant="inline" />
            <button
              onClick={() => setConfirmingDelete(true)}
              disabled={isPending}
              className="ml-auto text-muted transition-colors hover:text-accent"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
