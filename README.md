# Cheffect - a local-first recipe manager

- Manage your recipes locally on your devices
- Make meal plans for the week
- Create menus for quickly scheduling multiple meals
- Build grocery lists from your recipes & meal plans
- Extract recipes from URLs using AI
- Convert ingredient quantities for different countries using AI
- Smart grocery list organization and merging with AI
- AI chat assistant for cooking help
- Optionally sync your data across devices, end-to-end encrypted

<img src="/public/screenshots/android.jpg" alt="Cheffect Screenshot" width="300" />

## Docker Deployment

You can self-host Cheffect using Docker. The image runs one Node process that
serves the web app and an encrypted sync server on the same origin, at `/sync`.
Apps loaded from it sync to that server by default once sync is turned on.

### Building the Docker Image

```bash
docker build -t cheffect .
```

### Running the Container

```bash
docker run -d -p 8080:8080 -v cheffect-data:/data --name cheffect cheffect
```

The application will be available at http://localhost:8080

The sync database is stored at `/data/cheffect-sync.db`. Set `PORT` (default
`8080`) or `DATABASE_PATH` to change either.

### Docker Compose Example

```yaml
services:
  cheffect:
    build: .
    ports:
      - "8080:8080"
    volumes:
      - cheffect-data:/data
    restart: unless-stopped

volumes:
  cheffect-data:
```

### Operating the sync server

- **Run a single instance.** Live updates between devices go through the
  process's memory, so two containers sharing a database won't see each other's
  writes until clients reconnect.
- **The server is open.** Anyone who can reach it can store data on it. It only
  ever sees encrypted entries, so the risk is disk use. If it faces the internet,
  put it behind your own reverse proxy, VPN or authentication.
- **Backups are optional.** If the volume is lost, the server starts with a new
  identity and every device uploads its full history again on its next sync.
- **Compression** isn't built in. A reverse proxy in front can add it.

Without Docker, `pnpm build` produces the same two parts: the web app in `dist/`
and the server in `dist-server/main.mjs` (`pnpm start`). A plain `pnpm build`
has no default sync server; users enter one in Settings.

## Tests

```bash
pnpm test
```

Runs the unit tests: the EventLog event wire-format fixtures, the handler
convergence tests on `fake-indexeddb`, the conversion CLI and import tests, the
regression tests for the patched Effect AI packages, and an integration test
that starts the server and syncs two clients through it. CI runs them on every
pull request.

### Browser regression checks

`pnpm test:e2e` starts the dev server and drives a browser over the DevTools
protocol. It checks that edits and deletes made on a directly opened page are
persisted, that a share link joins another collection, the AI chat model
setting and scaled quantity formatting. CI runs them on
every pull request against `google-chrome-stable`. Run them by hand before
accepting changes to the EventLog write path, the store atoms, the join flow or
the edit and delete flows.

For acceptance runs, set `E2E_REQUIRE_BROWSER=1` so a missing browser fails
instead of skipping the tests. An explicitly set `CHROMIUM_PATH` also fails if
the executable is unavailable or its `--version` check fails. Without either
setting, a missing default `chromium` still skips the tests for local development;
that is not an acceptance check.

```bash
(
  set -euo pipefail
  CHROMIUM_PATH=$(command -v google-chrome-stable) || {
    echo "google-chrome-stable not found, not running the browser checks" >&2
    exit 1
  }
  export CHROMIUM_PATH E2E_REQUIRE_BROWSER=1
  "$CHROMIUM_PATH" --version
  pnpm test:e2e
)
```

With Nix, run it inside
`NIXPKGS_ALLOW_UNFREE=1 nix shell --impure nixpkgs#google-chrome`.

A `BrowserCrashError` is a browser failure, not a passing run. Its minidump is
copied to `test-results/e2e-crashes/`. Rerun, and report the crash separately
from assertion failures.

## License

MIT License
