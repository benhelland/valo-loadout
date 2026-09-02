import { notFound } from "next/navigation";
import { formatPriceTotal } from "@/lib/pricing";
import Link from "next/link";
import Image from "next/image";
import { getSharedLoadout, listAllWeapons } from "@/queries/loadouts";
import { sortByWeaponOrder, BOARD_COLUMN_GROUPS, CATEGORY_LABELS } from "@/lib/weaponOrder";

// Public, read-only view of a shared loadout. No auth, no ownership check -
// the unguessable slug is the credential, and getSharedLoadout refuses any
// loadout whose owner has since turned sharing off. Deliberately renders
// its own read-only markup rather than reusing LoadoutBoard, which is built
// entirely around mutations (rename/duplicate/delete/assign) that a viewer
// must not be offered.
export default async function SharedLoadoutPage({ params }: PageProps<"/l/[slug]">) {
  const { slug } = await params;
  const [loadout, allWeapons] = await Promise.all([getSharedLoadout(slug), listAllWeapons()]);

  if (!loadout) notFound();

  const weapons = sortByWeaponOrder(allWeapons);
  const itemsByWeapon = new Map(loadout.items.map((item) => [item.weaponId, item]));

  return (
    <div className="mx-auto max-w-[1800px] px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b-2 border-accent/30 pb-4">
        <div className="border-l-4 border-accent pl-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">Shared loadout</p>
          <h1 className="mt-1 font-display text-5xl uppercase tracking-wide leading-none">{loadout.name}</h1>
          <p className="mt-2 text-sm uppercase tracking-wide text-muted">
            {loadout.items.length} / {weapons.length} slots filled ·{" "}
            <span className="font-semibold text-accent">{formatPriceTotal(loadout.priceTotal)}</span>
          </p>
        </div>
        <Link
          href="/"
          className="clip-notch-sm bg-accent px-6 py-2 text-sm font-bold uppercase tracking-widest text-accent-contrast hover:bg-accent-dark transition-colors"
        >
          Build your own
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-10">
        {BOARD_COLUMN_GROUPS.map((categoriesInColumn, colIndex) => (
          <div key={colIndex} className="flex flex-col gap-10">
            {categoriesInColumn.map((category) => {
              const categoryWeapons = weapons
                .filter((w) => w.category === category)
                .sort((a, b) => a.displayName.localeCompare(b.displayName));
              if (categoryWeapons.length === 0) return null;
              return (
                <div key={category}>
                  <p className="mb-3 text-center text-sm font-semibold uppercase tracking-widest text-foreground">
                    {CATEGORY_LABELS[category] ?? category}
                  </p>
                  <div className="flex flex-col gap-3">
                    {categoryWeapons.map((weapon) => {
                      const item = itemsByWeapon.get(weapon.id);
                      const isMelee = weapon.category === "Melee";
                      return (
                        <div key={weapon.id} className="clip-notch-sm border border-border bg-surface">
                          <div className="flex">
                            <div className="relative h-[108px] flex-1 bg-black/20">
                              {item?.skin.displayIconUrl ? (
                                <Image
                                  src={item.skin.displayIconUrl}
                                  alt={item.skin.displayName}
                                  fill
                                  sizes="260px"
                                  className="object-contain p-0.5"
                                />
                              ) : weapon.displayIconUrl ? (
                                <Image
                                  src={weapon.displayIconUrl}
                                  alt={weapon.displayName}
                                  fill
                                  sizes="260px"
                                  className="object-contain p-1.5 opacity-30"
                                />
                              ) : null}
                            </div>
                            {isMelee ? null : (
                              <div className="flex w-10 flex-shrink-0 items-center justify-center border-l border-border">
                                {item?.buddy?.displayIconUrl ? (
                                  <div className="relative h-9 w-9">
                                    <Image
                                      src={item.buddy.displayIconUrl}
                                      alt={item.buddy.displayName}
                                      fill
                                      sizes="36px"
                                      className="object-contain"
                                    />
                                  </div>
                                ) : null}
                              </div>
                            )}
                          </div>
                          <p className="border-t border-border px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-foreground truncate">
                            {item ? item.skin.displayName : weapon.displayName}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
