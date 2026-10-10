FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine AS production
LABEL org.opencontainers.image.vendor="wecrew" \
      org.opencontainers.image.authors="wecrew-incident-team" \
      org.opencontainers.image.title="linkedeye-voice-agent"
WORKDIR /app
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
COPY package*.json ./
RUN npm install --production && npm cache clean --force
COPY --from=builder /app/dist ./dist
RUN chown -R nodejs:nodejs /app
USER nodejs
EXPOSE 4002
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:4002/health || exit 1
ENV NODE_ENV=production
ENV PORT=4002
CMD ["node", "dist/index.js"]
