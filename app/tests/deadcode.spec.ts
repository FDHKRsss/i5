// @vitest-environment node
//
// Regression guard for the dead-code cleanup that shipped this turn:
// `useMockAudio` was the mock audio-capture module that became dead once audio
// was removed from the step flow. This pins that (1) the module and its spec no
// longer exist and (2) no source / server / test file references them, so the
// dead code cannot silently creep back.
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
// This file necessarily names the symbol it is guarding; exclude itself so the
// guard only flags other files.
const self = fileURLToPath(import.meta.url);

const CODE_EXT = /\.(?:[cm]?[jt]s|[jt]sx)$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      // Skip build output and dependencies: we only care about authored code.
      if (["node_modules", "dist", "server-dist"].includes(entry)) continue;
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

const codeFiles = [walk(resolve(root, "src")), walk(resolve(root, "server")), walk(resolve(root, "tests"))]
  .flat()
  .filter((f) => CODE_EXT.test(f) && f !== self);

describe("dead audio-capture module is fully removed", () => {
  it("no longer ships useMockAudio.ts or its spec", () => {
    expect(existsSync(resolve(root, "src/capture/useMockAudio.ts"))).toBe(false);
    expect(existsSync(resolve(root, "src/capture/useMockAudio.spec.ts"))).toBe(false);
  });

  it("is not referenced by any source, server, or test file", () => {
    const offenders: string[] = [];
    for (const file of codeFiles) {
      const text = readFileSync(file, "utf8");
      if (/\b(?:useMockAudio|MockAudio)\b/.test(text)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
