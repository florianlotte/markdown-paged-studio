# syntax=docker/dockerfile:1

# ---- Build stage: compile the static site with Vite ----------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

# Install dependencies first so this layer is cached until package files change.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Everything else, including the optional gitignored local/ folder (personal defaults are baked in).
COPY . .
RUN npm run build

# ---- Runtime stage: serve dist/ with nginx -------------------------------------------------------
FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1/ > /dev/null || exit 1
