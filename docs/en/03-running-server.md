# Running the Server

This guide covers how to run Rijan WA Gateway in development and production.

## Development mode

Hot reload for local development:

```bash
npm run dev
```

## Production mode

### 1) Build

```bash
npm run build
```

### 2) Start

```bash
npm start
```

Or:

```bash
NODE_ENV=production node dist/index.js
```

## Docker

### Docker Compose (recommended)

```bash
docker-compose up -d
docker-compose logs -f
```

### Manual Docker

```bash
docker build -t rijan-wa:latest .

docker run -d \
  --name rijan-wa \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -e MASTER_KEY=your_master_key_here \
  -e PORT=3000 \
  -e NODE_ENV=production \
  rijan-wa:latest
```

## Verify

Health:

```bash
curl http://localhost:3000/health
```

Readiness:

```bash
curl http://localhost:3000/ready
```

OpenAPI docs:

- `http://localhost:3000/docs`

---

Indonesian reference: [../id/03-running-server.md](../id/03-running-server.md)
