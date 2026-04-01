# Multi-stage build: compile TypeScript, then produce a lean runtime image
# ─────────────────────────────────────────────────────────────────────────

# ── Stage 1: builder ─────────────────────────────────────────────────────
FROM node:22-slim AS builder
WORKDIR /app

COPY package*.json tsconfig.json ./
RUN npm ci

COPY src ./src
COPY public ./public
RUN npm run build

# Remove devDependencies to slim down the install before copying to runner
RUN npm prune --omit=dev

# ── Stage 2: runtime ─────────────────────────────────────────────────────
FROM node:22-slim AS runner

# Install Chromium + system deps for Playwright headless browser
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    chromium-sandbox \
    fonts-liberation \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

# Tell Playwright to use the system Chromium instead of downloading its own
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Copy production artefacts from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json

# Persist SQLite DB and run artifacts outside the container FS
VOLUME ["/app/artifacts"]

# Run as a non-root user for isolation
RUN useradd --uid 1001 --create-home agent
USER agent

EXPOSE 3000

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

CMD ["node", "dist/api/server.js"]
