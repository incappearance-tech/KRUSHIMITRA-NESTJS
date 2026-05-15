# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Create a non-root user — container escape attacks escalate to root otherwise
RUN addgroup -g 1001 -S nodejs && \
    adduser  -S nestjs -u 1001 -G nodejs

# Copy runtime files from builder
COPY --from=builder --chown=nestjs:nodejs /app/package*.json ./
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/prisma ./prisma

# Switch to non-root user before starting
USER nestjs

# Expose port
EXPOSE 3000

# Health check — lets Docker / load balancer detect crashes
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/v1/health || exit 1

# Command to run the application
CMD ["npm", "run", "start:prod"]
