# ============================================================
# Eldermin ERP Backend — Multi-stage Dockerfile for Railway
# ============================================================

# ---- Build stage ----
FROM node:22-alpine AS builder
WORKDIR /app

# Puppeteer's own postinstall step downloads a glibc-built Chromium binary
# that cannot run on Alpine (musl libc, missing shared libs) - see the
# production stage below, where Alpine's own `chromium` package is installed
# instead and Puppeteer is pointed at it via PUPPETEER_EXECUTABLE_PATH.
# Skipping the bundled download here just keeps the build fast; that binary
# would never have been usable at runtime anyway.
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Production stage ----
FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

# Report Templates (custom letterheads/receipts/vouchers/payslips/result
# cards/attendance sheets/admission letters — see pdf.service.ts
# generateFromTemplate) render through Puppeteer. Without a working
# Chromium binary, every one of those document types fails to generate in
# this container — this is the same class of bug that was separately
# worked around for fee receipts by rewriting that one path with pdf-lib
# instead of Puppeteer. Installing Alpine's own Chromium build (plus the
# shared libraries it needs) and pointing Puppeteer at it fixes the whole
# family of documents at once instead of rewriting each one individually.
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    font-noto \
    font-noto-arabic

ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 3001
CMD ["node", "dist/main"]
