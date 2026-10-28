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
app falls back to a fetch service picked for the build. There's nothing to set
up:

- The Docker image uses its own server's `/fetch` route.
- Deployments on Vercel use `api/fetch.ts`, served by the same deployment.
- Any other build, `pnpm dev` included, uses
  [Jina Reader](https://jina.ai/reader/) without a key, which allows 20
  requests a minute.

The fetch service receives the URL of each recipe imported this way, but not
your OpenAI key. With Jina, that's a third party.

Some sites block every server, so they fail however they are fetched. Allrecipes
and Serious Eats are two known examples.

### Using your own import server

Settings → AI Settings → **Import server** points imports at a Cheffect server
of your choice: the Docker image's address, or a Vercel deployment's address
followed by `/api` (for example `https://example.vercel.app/api`). Page fetches
then go through its `/fetch` route, and YouTube imports through its `/youtube`
route. Leave it blank to keep the build's default. The field is hidden in the
Docker image, which already uses its own server.

This helps most when the server runs at home. Sites and YouTube transcripts that
block datacenter IP addresses usually let a home connection through. The server
sees the URL of every recipe you import and the id of every video. The setting
is stored on each device and is not synced.

The hosted app is served over HTTPS, and browsers block it from calling a plain
`http://` server (mixed content), `localhost` excepted. To use a home server
from the hosted app, put it behind HTTPS, for example with a reverse proxy or
`tailscale serve`.

### YouTube imports

YouTube imports read the video description and, on Docker and Vercel
deployments, the video's transcript when one can be fetched. A video whose
description and transcript both lack the ingredients cannot produce a recipe.
Watch, Shorts, live, embed and youtu.be links are resolved to the same video id.

For Docker or Vercel deployments, enable **YouTube Data API v3** in a Google
Cloud project and set `YOUTUBE_API_KEY` in the server environment. For example,
pass `-e YOUTUBE_API_KEY=...` when starting the Docker container, or add the
variable to the Vercel deployment and redeploy. Do not prefix it with `VITE_`: the
key must never be included in the browser bundle. Restrict the key to YouTube
Data API v3 and, where possible, your server IP addresses.

With a key, `/youtube?id=...` (Docker) or `/api/youtube?id=...` (Vercel) reads
public video metadata using the supported
[`videos.list` API](https://developers.google.com/youtube/v3/docs/videos/list).
Each uncached lookup costs one quota unit. Concurrent requests for the same
video share a lookup; successful results are cached in memory for five minutes
(up to 256 videos per server process). Vercel instances do not share this cache.
API failures are reported without retrying or falling back to page scraping.
Private or deleted videos are not supported; an API key does not sign a user in.

Without a key, these routes read metadata from one best-effort watch-page
request. Static builds and `pnpm dev` use their existing Jina HTML endpoint
instead, and get no transcripts, unless an
[import server](#using-your-own-import-server) is set. With one, YouTube imports
go to its `/youtube` route, which answers any origin. YouTube browser requests are skipped because YouTube does not allow
cross-origin page reads. Consent pages and bot checks can still block the unauthenticated path.
We do not pass browser cookies, solve challenges, or rotate identities.

#### Transcripts

Transcripts are best-effort and unofficial. YouTube's API only lets a video's
owner download captions, so the server asks YouTube's internal player endpoint,
the one its Android app uses, for the caption tracks. YouTube can change or
block this without notice. It also blocks most of these requests from cloud and
datacenter IP addresses (Vercel and most Docker hosts), so expect transcripts to
be missing in production more often than not. When the transcript can't be
fetched for any reason, the import uses the description alone. The API key is
not used or needed for transcripts.

Manual captions are preferred over auto-generated ones, in the video's language
or else English. The transcript is flattened to plain text and capped at 15,000
characters. Auto-generated captions often mishear quantities, and many recipe
Shorts have no speech at all (music with on-screen text), so a transcript does
not guarantee a recipe. We do not download audio, read on-screen text, pass
cookies, solve bot checks, or use proxies. The transcript is cached with the
video metadata.

These metadata routes are unauthenticated. On public deployments, protect them
with your reverse proxy/authentication or rate limits to prevent others from
spending your API quota. Monitor quota use in Google Cloud. The API receives the
video id, never your OpenAI key.

### The `/fetch` route

The Docker image serves `GET /fetch?url=...` and the Vercel build serves
`/api/fetch?url=...`. Both fetch only public http(s) addresses. Private,
loopback and link-local addresses are refused, every redirect is checked again,
and fetches stop after 15 seconds or 2 MB. Pages come back as sandboxed plain
text, so opening a `/fetch` link in a browser never runs the page's scripts on
the app's origin. There is no authentication, so if it
faces the internet anyone can use it to fetch pages. Put it behind your own
reverse proxy or authentication if that matters to you.

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
