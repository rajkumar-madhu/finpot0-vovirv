FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine AS production
WORKDIR /app
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
COPY package*.json ./
RUN npm install --production && npm cache clean --force
COPY --from=builder /app/dist ./dist
RUN chown -R nodejs:nodejs /app
USER nodejs
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
