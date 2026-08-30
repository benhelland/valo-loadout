import Image from "next/image";
import Link from "next/link";
import { auth, signOut } from "@/auth";

// Server component - reads the session directly rather than through
// getCurrentUserId() (which would redirect an anonymous visitor away from
// every page that renders the header, defeating "gallery stays open to
// everyone").
export async function AuthControl() {
  const session = await auth();

  if (!session?.user) {
    return (
      <Link
        href="/sign-in"
        className="clip-notch-sm bg-accent px-4 py-2 text-xs font-bold uppercase tracking-widest text-white transition-colors hover:bg-accent-dark"
      >
        Sign in
      </Link>
    );
  }

  const { name, image } = session.user;

  return (
    <div className="flex items-center gap-3">
      <Link href="/account" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
        {image ? (
          <Image src={image} alt={name ?? "Account"} width={28} height={28} className="rounded-full" />
        ) : (
          <div className="h-7 w-7 rounded-full bg-accent/20" />
        )}
        <span className="hidden text-xs font-semibold uppercase tracking-wider text-foreground sm:inline">
          {name ?? "Account"}
        </span>
      </Link>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
      >
        <button
          type="submit"
          className="text-[11px] font-semibold uppercase tracking-widest text-muted hover:text-accent transition-colors"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
