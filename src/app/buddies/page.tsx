import { listBuddiesPage } from "@/queries/buddies";
import { BuddyCard } from "@/components/gallery/BuddyCard";
import { GalleryTabs } from "@/components/gallery/GalleryTabs";
import { Pagination } from "@/components/gallery/Pagination";

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function BuddiesPage({ searchParams }: PageProps<"/buddies">) {
  const sp = await searchParams;
  const pageParam = first(sp.page);
  const { buddies, total, page, pageCount } = await listBuddiesPage(pageParam ? Number(pageParam) : 1);

  return (
    <div className="mx-auto max-w-[1800px] px-4 sm:px-6 lg:px-8 py-8">
      <GalleryTabs active="buddies" />

      <div className="mb-6 flex items-baseline gap-4 border-l-4 border-accent pl-4">
        <h1 className="font-display text-5xl uppercase tracking-wide leading-none">Buddies</h1>
        <p className="text-sm uppercase tracking-wide text-muted">{total.toLocaleString()} gun buddies ever released</p>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 2xl:grid-cols-10 gap-3">
        {buddies.map((buddy) => (
          <BuddyCard key={buddy.id} buddy={buddy} />
        ))}
      </div>

      <Pagination page={page} pageCount={pageCount} searchParams={{ page: pageParam }} basePath="/buddies" />
    </div>
  );
}
