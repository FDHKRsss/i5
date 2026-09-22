# ---------- build stage ----------
FROM node:22-alpine AS build
WORKDIR /app

# Install all dependencies (frontend + server build tools).
COPY package*.json ./
RUN npm install

# Build the frontend bundle and compile the server.
COPY . .
RUN npm run build

# ---------- runtime stage ----------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Install runtime-only dependencies (express, pg, busboy).
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/server-dist ./server-dist

# Port 81 is the Cloudflare Quick Tunnel origin (see docs/ARCHITECTURE.md).
ENV PORT=81
EXPOSE 81

CMD ["node", "server-dist/index.js"]
