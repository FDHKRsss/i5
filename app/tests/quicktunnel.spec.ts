// @vitest-environment node
//
// Pins the M16 -- real "port 81 + tunnel origin" facts to the real source so
// the Cloudflare Quick Tunnel origin cannot silently drift back to another
// port. This complements runbook.spec.ts (which pins the docs/compose/env
// facts) and docs.spec.ts (which pins the milestone docs) by asserting the
// runtime PORT default and the Dockerfile / compose healthcheck / Vite dev
// proxy wiring that those specs do not cover.
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const read = (rel: string): string => readFileSync(resolve(root, rel), "utf8");

const serverSource = read("server/index.ts");
const dockerfile = read("Dockerfile");
const compose = read("docker-compose.yml");
const viteConfig = read("vite.config.ts");

describe("PORT default (server/index.ts)", () => {
  afterEach(() => {
    // Any module graph / env changes are scoped to these two specs only.
    vi.resetModules();
  });

  it("defaults to 81 when PORT is unset (the Quick Tunnel origin)", async () => {
    vi.resetModules();
    const prev = process.env.PORT;
    delete process.env.PORT;
    try {
      const mod = await import("../server/index.js");
      expect(mod.PORT).toBe(81);
    } finally {
      if (prev === undefined) delete process.env.PORT;
      else process.env.PORT = prev;
      vi.resetModules();
    }
  });

  it("still honours a PORT override from the environment", async () => {
    vi.resetModules();
    const prev = process.env.PORT;
    process.env.PORT = "9123";
    try {
      const mod = await import("../server/index.js");
      expect(mod.PORT).toBe(9123);
    } finally {
      if (prev === undefined) delete process.env.PORT;
      else process.env.PORT = prev;
      vi.resetModules();
    }
  });

  it("documents the Quick Tunnel command next to the port constant", () => {
    expect(serverSource).toContain(
      "cloudflared tunnel --url http://127.0.0.1:81"
    );
    expect(serverSource).toContain("process.env.PORT ?? 81");
  });
});

describe("Dockerfile / compose / Vite port-81 wiring", () => {
  it("Dockerfile runs and exposes port 81", () => {
    expect(dockerfile).toMatch(/ENV PORT=81\b/);
    expect(dockerfile).toMatch(/EXPOSE 81\b/);
  });

  it("docker-compose publishes APP_PORT -> 81 and healthchecks :81", () => {
    expect(compose).toContain('"${APP_PORT:-81}:81"');
    expect(compose).toContain("http://127.0.0.1:81/health");
  });

  it("Vite dev proxy forwards /api and /health to the port-81 origin", () => {
    expect(viteConfig).toContain('"/api": "http://localhost:81"');
    expect(viteConfig).toContain('"/health": "http://localhost:81"');
  });
});
