# Signaling server image (Bun runtime — runs the TypeScript entry directly, no build step).
# Build context MUST be the repo root (on Render, leave Root Directory blank) so the
# server can resolve the @chickadee/shared workspace from packages/shared:
#   docker build -f apps/signaling/Dockerfile -t chickadee-signaling .
#   docker run -p 8080:8080 chickadee-signaling
FROM oven/bun:latest
WORKDIR /app

# Install workspace deps. Copy manifests first so Docker caches the install layer
# across source edits. The desktop workspace is omitted on purpose — the signaling
# server only needs `ws` plus the shared TS source.
COPY package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/signaling/package.json apps/signaling/
RUN bun install

# Runtime source: shared provides protocol + runtime constants; signaling is the server.
COPY packages/shared ./packages/shared
COPY apps/signaling ./apps/signaling

# Render injects its own PORT and overrides this; the server reads process.env.PORT.
# 8080 is just the local `docker run` default.
ENV PORT=8080
EXPOSE 8080
CMD ["bun", "apps/signaling/src/index.ts"]
