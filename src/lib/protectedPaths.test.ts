import test from "node:test";
import assert from "node:assert/strict";
import { isProtected, PROTECTED_PREFIXES } from "./protectedPaths";

// This logic gates every authenticated page. It is hand-written prefix
// matching standing in for what a declarative route matcher used to do, so the
// boundary is pinned here rather than left to inspection: a mistake in either
// direction is serious, and neither is visible without exercising it.

test("protects each section and everything beneath it", () => {
  for (const prefix of PROTECTED_PREFIXES) {
    assert.equal(isProtected(prefix), true, prefix);
    assert.equal(isProtected(`${prefix}/`), true, `${prefix}/`);
    assert.equal(isProtected(`${prefix}/abc`), true, `${prefix}/abc`);
    assert.equal(isProtected(`${prefix}/abc/def`), true, `${prefix}/abc/def`);
  }
});

test("does not gate public routes", () => {
  // Anonymous browsing is the intended front door - over-matching here would
  // bounce first-time visitors to /sign-in from the gallery.
  for (const path of [
    "/",
    "/skins",
    "/skins/abc",
    "/buddies",
    "/sign-in",
    "/combo/abc",
    "/l/abc",
    "/api/auth/callback/discord",
    "/robots.txt",
    "/sitemap.xml",
  ]) {
    assert.equal(isProtected(path), false, path);
  }
});

test("a prefix must not leak onto a longer sibling route", () => {
  // The failure mode hand-written prefix matching invites: a plain
  // startsWith("/shop") would also swallow "/shopping", and startsWith
  // ("/account") would swallow "/accounts".
  for (const path of [
    "/loadouts-public",
    "/loadoutsomething",
    "/accounts",
    "/account-recovery",
    "/wishlists",
    "/shopping",
    "/shop-faq",
  ]) {
    assert.equal(isProtected(path), false, path);
  }
});

test("does not match a section appearing deeper in the path", () => {
  // Only a leading match counts; "/skins/loadouts" is a gallery URL.
  for (const path of ["/skins/loadouts", "/x/account", "/a/b/wishlist"]) {
    assert.equal(isProtected(path), false, path);
  }
});
