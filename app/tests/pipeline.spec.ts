// @vitest-environment node
//
// Pins the build/test wiring introduced so that `npm test` works from a fresh
// clone (regenerates dist/ via pretest) and `npm run typecheck` covers the
// test tree. This guards against someone silently dropping the pretest hook or
// removing tests/** from typechecking, which would only fail on a clean checkout.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const read = (rel: string): string => readFileSync(resolve(root, rel), "utf8");

interface PackageJson {
  scripts: Record<string, string>;
}

interface TsConfig {
  include?: string[];
  compilerOptions?: Record<string, unknown>;
}

const pkg = JSON.parse(read("package.json")) as PackageJson;
const tsconfigTest = JSON.parse(read("tsconfig.test.json")) as TsConfig;

describe("test/build pipeline wiring", () => {
  it("regenerates the frontend before the SPA-serving specs run", () => {
    expect(pkg.scripts.pretest).toBe("npm run build:frontend");
    expect(pkg.scripts["build:frontend"]).toBe("vite build");
  });

  it("typechecks the test tree with the dedicated test tsconfig", () => {
    expect(pkg.scripts.typecheck).toContain(
      "tsc -p tsconfig.test.json --noEmit"
    );
    expect(tsconfigTest.include).toContain("tests/**/*");
    expect(tsconfigTest.compilerOptions?.noEmit).toBe(true);
    expect(tsconfigTest.compilerOptions?.allowImportingTsExtensions).toBe(true);
  });

  it("keeps the send() fetch mock typed so mock.calls is sound", () => {
    const sendSpec = read("tests/send.spec.ts");
    expect(sendSpec).toContain("vi.fn<typeof fetch>");
  });
});
