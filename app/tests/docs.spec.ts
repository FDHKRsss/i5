// @vitest-environment node
//
// Pins the milestone-planning docs (docs/PLAN.md + docs/ARCHITECTURE.md) to the
// fact that M15 (the final compose/tests/docs pass) shipped and that M16–M18
// (HTTPS via Cloudflare Quick Tunnel on port 81) are done: the checkbox, the
// "Current status" entry, and the "Implementation status" entry must all agree,
// and the stale pre-M15 phrasing ("not implemented yet", "Next: M15") must be
// gone. This mirrors runbook.spec.ts in pinning docs to the real tree so the
// milestone-state locations cannot silently drift apart.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const read = (rel: string): string => readFileSync(resolve(root, rel), "utf8");

const plan = read("docs/PLAN.md");
const arch = read("docs/ARCHITECTURE.md");

const planStatus = plan.split("## Current status")[1]?.split("## Post-approval polish")[0] ?? "";

describe("PLAN.md reflects the shipped M15 + M16–M18 state", () => {
  it("marks both M15 passes done", () => {
    expect(plan).toMatch(/^- \[x\] M15 -- stub\b/m);
    expect(plan).toMatch(/^- \[x\] M15 -- real\b/m);
  });

  it("marks the Cloudflare Quick Tunnel milestone passes done", () => {
    expect(plan).toMatch(/^- \[x\] M16 -- stub\b/m);
    expect(plan).toMatch(/^- \[x\] M16 -- real\b/m);
    expect(plan).toMatch(/^- \[x\] M17 -- stub\b/m);
    expect(plan).toMatch(/^- \[x\] M17 -- real\b/m);
    expect(plan).toMatch(/^- \[x\] M18 -- stub\b/m);
    expect(plan).toMatch(/^- \[x\] M18 -- real\b/m);
  });

  it("updates the Current status tail: M15 done, M16–M18 done, no next milestone pending", () => {
    expect(planStatus).toContain("M15 (stub + real) — done");
    expect(planStatus).toContain("M16–M18 (HTTPS via Cloudflare Quick Tunnel) — done");
    expect(planStatus).not.toContain("Next: **M15**");
  });

  it("keeps the BYTEA storage facts", () => {
    expect(plan).toContain("image BYTEA");
    expect(plan).toContain("thumbnail BYTEA");
  });

  it("documents the Cloudflare Quick Tunnel path and port 81", () => {
    expect(plan).toContain("cloudflared tunnel --url http://127.0.0.1:81");
    expect(plan).toContain("https://*.trycloudflare.com");
  });
});

describe("ARCHITECTURE.md reflects the shipped M15 + M16 state", () => {
  it("lists M15 and M16 as done and leaves no open milestone", () => {
    expect(arch).toContain("M15 (Compose, tests & docs)");
    expect(arch).toContain("M16 (HTTPS via Cloudflare Quick Tunnel on port 81)");
    expect(arch).not.toContain("M15 (Compose, tests & docs) — not implemented yet");
    expect(arch).not.toContain("not implemented yet");
  });

  it("describes the Cloudflare Quick Tunnel and port 81, not a Let's Encrypt proxy", () => {
    expect(arch).toContain("cloudflared tunnel --url http://127.0.0.1:81");
    expect(arch).toContain("trycloudflare.com");
    expect(arch).toContain("default `81`");
    // The goal forbids a Let's Encrypt reverse proxy, so the architecture must
    // not mandate one.
    expect(arch).not.toContain("e.g. Caddy/Traefik/nginx + Let's Encrypt");
  });
});
