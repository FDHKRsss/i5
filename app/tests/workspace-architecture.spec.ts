// @vitest-environment node
//
// Pins the workspace-root docs/ARCHITECTURE.md "Key points" → "Port 81" bullet
// to the REAL bind address in app/server/index.ts. The app must listen on
// 0.0.0.0:81 (all interfaces) so that BOTH the cloudflared loopback dial
// (http://127.0.0.1:81) AND the EC2 TCP exposure keep working; the tunnel
// *origin* command stays http://127.0.0.1:81. This guards against the doc
// drifting back to "binds `127.0.0.1:81` (host + container)" or the code
// silently changing its bind address, which no other spec covers.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, ".."); // app/
const wsRoot = resolve(here, "..", ".."); // workspace root (holds docs/ + app/)

const workspaceArch = readFileSync(resolve(wsRoot, "docs/ARCHITECTURE.md"), "utf8");
const serverSource = readFileSync(resolve(appRoot, "server/index.ts"), "utf8");

describe("workspace docs/ARCHITECTURE.md bind address vs the real code", () => {
  it("documents the bind as 0.0.0.0:81 (all interfaces)", () => {
    expect(workspaceArch).toContain("the app binds `0.0.0.0:81` (host + container)");
    expect(workspaceArch).toContain("listens on `0.0.0.0:81`");
    // The stale loopback-bind wording must not come back.
    expect(workspaceArch).not.toContain("binds `127.0.0.1:81` (host + container)");
  });

  it("keeps the tunnel command on the loopback origin (cloudflared dials 127.0.0.1)", () => {
    expect(workspaceArch).toContain("cloudflared tunnel --url http://127.0.0.1:81");
  });

  it("matches the actual server listen() call and PORT default", () => {
    expect(serverSource).toContain('app.listen(PORT, "0.0.0.0"');
    expect(serverSource).toContain("process.env.PORT ?? 81");
  });
});
