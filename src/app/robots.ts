import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/siteUrl";

// Without this the site had no crawl guidance at all, and bots walked it
// hard: the gallery keeps all of its filter state in the query string, so
// `?weaponId=&color=&vibe=&page=` is a combinatorial URL space a crawler can
// generate work in forever. Disallowing query strings is what bounds that.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          // Every filtered/paginated permutation of the gallery. The pages
          // worth indexing (the gallery itself, each skin, the buddy list)
          // are all reachable without a query string.
          "/*?",
          // Share links. Loadout slugs are deliberately unguessable so a link
          // can be revoked; indexing them would undo that. Combo links are
          // stateless and effectively infinite.
          "/l/",
          "/combo/",
          // Auth-gated - these only ever redirect for a crawler.
          "/account",
          "/loadouts",
          "/wishlist",
          "/shop",
          "/api/",
        ],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
