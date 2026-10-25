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

<img src="/public/screenshots/desktop.jpg" alt="Cheffect on desktop: the recipe library" />

<p>
  <img src="/public/screenshots/mobile-recipes.jpg" alt="Cheffect on mobile: the recipe library" width="24%" />
  <img src="/public/screenshots/mobile-recipe.jpg" alt="Cheffect on mobile: a recipe with its ingredients" width="24%" />
  <img src="/public/screenshots/mobile-meal-plan.jpg" alt="Cheffect on mobile: the weekly meal plan" width="24%" />
  <img src="/public/screenshots/mobile-grocery.jpg" alt="Cheffect on mobile: the grocery list grouped by aisle" width="24%" />
</p>

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

## Importing recipes from URLs

To import a recipe from a URL, the app needs the page's HTML. It asks the site
directly first. That works for sites that allow cross-origin requests, and the
request comes from your own browser. Most recipe sites don't allow it, so the
app then tries the **Recipe import fetch URL** from Settings. That's an address
with `{url}` where the recipe's URL goes, for example:

- `https://cheffect.example.com/fetch?url={url}`, the `/fetch` route of a
  self-hosted Docker image
- `https://r.jina.ai/{url}`, [Jina Reader](https://jina.ai/reader/). It works
  without a key at 20 requests a minute. Put a key in **Recipe import fetch
  API key** for more. The key is sent as a bearer token, never in the URL.

The service you set receives the URL of every recipe you import. It doesn't
receive the page's contents or your OpenAI key. The Docker image defaults to
its own `/fetch`, Vercel deployments default to `/api/fetch`, and a build can
set its own default with `VITE_IMPORT_FETCH_URL`. Clearing the setting returns
to that default. Builds with no default only import from sites that allow
direct requests.

Some sites block every server, so they fail however they are fetched. Allrecipes
and Serious Eats are two known examples.

### The `/fetch` route

The Docker image serves `GET /fetch?url=...` and the Vercel build serves
`/api/fetch?url=...`. Both fetch only public http(s) addresses. Private,
loopback and link-local addresses are refused, every redirect is checked again,
and fetches stop after 15 seconds or 2 MB. There is no authentication, so if it
faces the internet anyone can use it to fetch pages. Put it behind your own
reverse proxy or authentication if that matters to you.

If you host the static build somewhere else, a Cloudflare Worker can do the
same job:

```js
export default {
  async fetch(request) {
    const url = new URL(request.url).searchParams.get("url")
    if (!url || !/^https?:\/\//.test(url)) {
      return new Response("The url parameter is required", { status: 400 })
    }
    const page = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      },
    })
    return new Response(page.ok ? page.body : null, {
      status: page.status,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "access-control-allow-origin": "*",
      },
    })
  },
}
```

Then set the fetch URL to `https://<your-worker>.workers.dev/?url={url}`.

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
