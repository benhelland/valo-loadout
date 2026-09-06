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
        className="clip-notch-sm flex h-9 items-center bg-accent px-4 text-xs font-bold uppercase tracking-widest text-accent-contrast transition-colors hover:bg-accent-dark"
      >
        Sign in
      </Link>
    );
  }

  const { name, image } = session.user;

  // h-9 on every child matches the nav links' box exactly, and one shared
  // type scale (text-sm, tracking-widest) keeps this row on the same optical
  // line as them - previously the avatar, name and sign-out were three
  // different sizes sitting at three different heights.
  return (
    <div className="flex h-9 items-center gap-4">
      <Link
        href="/account"
        className="flex h-9 items-center gap-2 transition-opacity hover:opacity-80"
        title={name ?? "Account"}
      >
        {image ? (
          <Image src={image} alt="" width={24} height={24} className="rounded-full" />
        ) : (
          <div className="h-6 w-6 rounded-full bg-accent/20" />
        )}
        <span className="hidden max-w-[10rem] truncate text-sm font-semibold uppercase tracking-widest text-foreground sm:inline">
          {name ?? "Account"}
        </span>
      </Link>
      <form
        className="flex h-9 items-center"
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
      >
        <button
          type="submit"
          className="flex h-9 items-center text-sm font-semibold uppercase tracking-widest text-muted transition-colors hover:text-accent"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
