import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildAuthorizeUrl, extractAuthorizationCode } from "@/riot/oauth";

// The pasted value is attacker-influenced (a user could be socially
// engineered into pasting anything) and ends up in an OAuth token request, so
// it's constrained rather than trusted. These also cover the realistic
// mis-paste cases, since a confusing failure here is the most likely reason a
// real link attempt fails.

const CODE = "abcDEF123-_.~xyz";

describe("buildAuthorizeUrl", () => {
  it("targets Riot's authorize endpoint with the expected grant parameters", () => {
    const url = new URL(buildAuthorizeUrl("nonce-123"));
    assert.equal(url.origin + url.pathname, "https://auth.riotgames.com/authorize");
    assert.equal(url.searchParams.get("response_type"), "code");
    assert.equal(url.searchParams.get("client_id"), "riot-client");
    assert.equal(url.searchParams.get("nonce"), "nonce-123");
  });

  it("requests offline_access so a refresh token is issued", () => {
    // Without this scope the link would silently become week-to-week again.
    const scope = new URL(buildAuthorizeUrl("n")).searchParams.get("scope") ?? "";
    assert.ok(scope.split(" ").includes("offline_access"), `scope was: ${scope}`);
  });
});

describe("extractAuthorizationCode", () => {
  it("extracts the code from a full redirect URL", () => {
    assert.equal(extractAuthorizationCode(`http://localhost/redirect?code=${CODE}&iss=https://auth.riotgames.com`), CODE);
  });

  it("extracts the code regardless of parameter order", () => {
    assert.equal(extractAuthorizationCode(`http://localhost/redirect?iss=whatever&code=${CODE}`), CODE);
  });

  it("accepts a bare code", () => {
    assert.equal(extractAuthorizationCode(CODE), CODE);
  });

  it("tolerates surrounding whitespace from a sloppy paste", () => {
    assert.equal(extractAuthorizationCode(`  http://localhost/redirect?code=${CODE}  `), CODE);
  });

  it("percent-decodes an encoded code", () => {
    assert.equal(extractAuthorizationCode("http://localhost/redirect?code=abc%2Ddef123456"), "abc-def123456");
  });

  it("rejects the authorize URL (the most likely mis-paste)", () => {
    // Copying the link they were *sent* rather than the one they landed on.
    assert.throws(
      () => extractAuthorizationCode(buildAuthorizeUrl("n")),
      /doesn't contain a login code|doesn't look valid/,
    );
  });

  it("rejects empty or junk input", () => {
    assert.throws(() => extractAuthorizationCode(""));
    assert.throws(() => extractAuthorizationCode("   "));
    assert.throws(() => extractAuthorizationCode("not a url and not a code!!"));
  });

  it("rejects a code containing characters outside the URL-safe token set", () => {
    assert.throws(() => extractAuthorizationCode("http://localhost/redirect?code=abc<script>alert(1)</script>"));
    assert.throws(() => extractAuthorizationCode("abc def ghi jkl"));
  });

  it("rejects an absurdly long value", () => {
    assert.throws(() => extractAuthorizationCode("a".repeat(600)));
  });
});
