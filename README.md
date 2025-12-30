# Cheffect - a local-first recipe manager

- Manage your recipes locally on your devices
- Make meal plans for the week
- Create menus for quickly scheduling multiple meals
- Build grocery lists from your recipes & meal plans
- Extract recipes from URLs using AI
- Convert ingredient quantities for different countries using AI
- Smart grocery list organization and merging with AI
- AI chat assistant for cooking help
- Optionally sync your data across devices (powered by
  [LiveStore](https://livestore.dev) & [Cloudflare
  Workers](https://workers.cloudflare.com/))

<img src="/public/screenshots/android.jpg" alt="Cheffect Screenshot" width="300" />

## Docker Deployment

You can self-host Cheffect using Docker. The Docker image serves the static web application using nginx.

### Building the Docker Image

Build the image with the default sync server (`wss://cheffect-sync.timsmart.workers.dev`):

```bash
docker build -t cheffect .
```

Or build with a custom sync server URL:

```bash
docker build --build-arg VITE_SYNC_SERVER_URL=wss://your-sync-server.example.com -t cheffect .
```

### Running the Container

Run with the default sync server:

```bash
docker run -d -p 8080:80 --name cheffect cheffect
```

The application will be available at http://localhost:8080

### Docker Compose Example

```yaml
version: "3.8"

services:
  cheffect:
    build:
      context: .
      args:
        VITE_SYNC_SERVER_URL: wss://your-sync-server.example.com
    ports:
      - "8080:80"
    restart: unless-stopped
```

## License

MIT License
