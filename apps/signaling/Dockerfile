# Signaling server image.
# Build context MUST be the repo root (for the workspace lockfile):
#   docker build -f apps/signaling/Dockerfile -t chickadee-signaling .
#   docker run -p 8080:8080 chickadee-signaling
FROM node:20-slim
WORKDIR /app

# Install production deps only. electron/react/vite are devDependencies of the
# desktop app, so --omit=dev keeps this image small; the workspace manifests +
# lockfile are required for npm ci to resolve the monorepo.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/signaling/package.json apps/signaling/
COPY apps/desktop/package.json apps/desktop/
RUN npm ci --omit=dev

# Runtime source (the server runs via tsx; shared provides runtime values).
COPY packages/shared ./packages/shared
COPY apps/signaling ./apps/signaling

ENV PORT=8080
EXPOSE 8080
CMD ["npm", "start", "--workspace", "@chickadee/signaling"]
