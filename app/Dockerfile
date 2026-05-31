# Production Dockerfile for Cheap Travels India
# Single-stage build; suitable for Render / Hetzner / DigitalOcean.

FROM node:20-bookworm-slim AS base
WORKDIR /app

# Playwright system deps (Chromium needs these libs to run headless)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 \
    libatspi2.0-0 libcairo2 libcups2 libdbus-1-3 libdrm2 libexpat1 libgbm1 \
    libglib2.0-0 libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 libx11-6 \
    libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxkbcommon0 \
    libxrandr2 wget xdg-utils \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install --omit=dev=false

# Install Chromium for Playwright (must be done before COPY to keep cached)
RUN npx playwright install chromium --with-deps || npx playwright install chromium

COPY . .

# Create data dir for SQLite
RUN mkdir -p /app/data

RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
