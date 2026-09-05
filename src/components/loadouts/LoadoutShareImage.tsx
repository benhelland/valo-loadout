import Image from "next/image";
import { formatPriceTotal } from "@/lib/pricing";
import { BOARD_COLUMN_GROUPS, CATEGORY_LABELS } from "@/lib/weaponOrder";
import type { getLoadout, listAllWeapons } from "@/queries/loadouts";

type Loadout = NonNullable<Awaited<ReturnType<typeof getLoadout>>>;
type Weapon = Awaited<ReturnType<typeof listAllWeapons>>[number];

interface LoadoutShareImageProps {
  loadout: Loadout;
  weapons: Weapon[];
}

// A purpose-built, fixed-width rendering of a loadout used only as the
// capture target for the "share as image" feature - deliberately not a
// screenshot of the live board, which is full of buttons, nav chrome, and
// hover affordances that make for a poor shareable image. Rendered
// off-screen on demand (see ShareLoadoutButton) and never shown in normal
// page flow.
//
// Fixed pixel width rather than responsive units so the exported image is
// the same size regardless of the viewport it was generated from.
export function LoadoutShareImage({ loadout, weapons }: LoadoutShareImageProps) {
  const itemsByWeapon = new Map(loadout.items.map((item) => [item.weaponId, item]));

  return (
    <div style={{ width: 1200, background: "#0f1923", padding: 32, fontFamily: "var(--font-sans), sans-serif" }}>
      <div style={{ borderLeft: "4px solid #ff4655", paddingLeft: 16, marginBottom: 24 }}>
        <h1
          style={{
            fontFamily: "var(--font-display), sans-serif",
            fontSize: 48,
            lineHeight: 1,
            textTransform: "uppercase",
            letterSpacing: "0.02em",
            color: "#ece8e1",
            margin: 0,
          }}
        >
          {loadout.name}
        </h1>
        <p style={{ margin: "8px 0 0", fontSize: 14, textTransform: "uppercase", letterSpacing: "0.05em", color: "#8b978f" }}>
          {loadout.items.length} / {weapons.length} slots ·{" "}
          <span style={{ color: "#ff4655", fontWeight: 600 }}>{formatPriceTotal(loadout.priceTotal)}</span>
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24 }}>
        {BOARD_COLUMN_GROUPS.map((categoriesInColumn, colIndex) => (
          <div key={colIndex} style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {categoriesInColumn.map((category) => {
              const categoryWeapons = weapons
                .filter((w) => w.category === category)
                .sort((a, b) => a.displayName.localeCompare(b.displayName));
              if (categoryWeapons.length === 0) return null;
              return (
                <div key={category}>
                  <p
                    style={{
                      margin: "0 0 8px",
                      textAlign: "center",
                      fontSize: 12,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      color: "#ece8e1",
                    }}
                  >
                    {CATEGORY_LABELS[category] ?? category}
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {categoryWeapons.map((weapon) => {
                      const item = itemsByWeapon.get(weapon.id);
                      const isMelee = weapon.category === "Melee";
                      return (
                        <div key={weapon.id} style={{ border: "1px solid #2a3744", background: "#16212c" }}>
                          <div style={{ display: "flex" }}>
                            <div style={{ position: "relative", height: 72, flex: 1, background: "rgba(0,0,0,0.2)" }}>
                              {item?.skin.displayIconUrl ? (
                                <Image
                                  src={item.skin.displayIconUrl}
                                  alt=""
                                  fill
                                  sizes="240px"
                                  style={{ objectFit: "contain", padding: 2 }}
                                />
                              ) : weapon.displayIconUrl ? (
                                <Image
                                  src={weapon.displayIconUrl}
                                  alt=""
                                  fill
                                  sizes="240px"
                                  style={{ objectFit: "contain", padding: 6, opacity: 0.3 }}
                                />
                              ) : null}
                            </div>
                            {isMelee ? null : (
                              <div
                                style={{
                                  width: 40,
                                  flexShrink: 0,
                                  borderLeft: "1px solid #2a3744",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                {item?.buddy?.displayIconUrl ? (
                                  <div style={{ position: "relative", height: 32, width: 32 }}>
                                    <Image
                                      src={item.buddy.displayIconUrl}
                                      alt=""
                                      fill
                                      sizes="32px"
                                      style={{ objectFit: "contain" }}
                                    />
                                  </div>
                                ) : null}
                              </div>
                            )}
                          </div>
                          <p
                            style={{
                              margin: 0,
                              borderTop: "1px solid #2a3744",
                              padding: "6px 10px",
                              fontSize: 11,
                              fontWeight: 600,
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                              color: item ? "#ece8e1" : "#8b978f",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
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

      <p style={{ margin: "24px 0 0", fontSize: 11, color: "#8b978f" }}>
        Built with Valoadout · not affiliated with or endorsed by Riot Games
      </p>
    </div>
  );
}
