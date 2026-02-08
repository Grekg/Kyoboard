# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY server/package*.json ./

# Install dependencies
RUN npm install --only=production

# Copy Prisma schema and generate client
COPY server/prisma ./prisma
RUN npx prisma generate

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy node_modules from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Copy server source code
COPY server/ ./

# Copy frontend files (static serving)
COPY index.html login.html dashboard.html board.html 404.html 500.html ./public/
COPY css/ ./public/css/
COPY js/ ./public/js/
COPY logo2-removebg-preview.png ./public/

# Update static file path in server for Docker
ENV NODE_ENV=production

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Start the server
CMD ["node", "src/server.js"]