# Known issues

_Recurring walls/gotchas and how to get past them. One bullet each._

- Port 81 is a privileged Linux port (< 1024): bare `npm start` as non-root fails with `EACCES` — use `sudo`, grant `CAP_NET_BIND_SERVICE`, or run via Docker (the stock `node:22-alpine` container runs as root, so it can bind 81).
- `node`/`npm` are not on this workspace's default `PATH` — locate the Node 22 install first, then run `npm test` / `npm run typecheck` (both verified green on Node 22).
