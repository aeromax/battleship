# --- build frontend ---
FROM node:20-alpine AS web
WORKDIR /
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- build/run server ---
FROM node:20-alpine AS server
WORKDIR /server
COPY server/package*.json ./
RUN npm ci --omit=dev

COPY server/ ./
# copy built frontend into server container
COPY --from=web /server /public

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["node", "index.js"]
