# Build stage
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++ git

WORKDIR /app

# Copy package files
COPY package*.json ./

# Debug: List files and install dependencies
RUN ls -la && \
    npm --version && \
    node --version && \
    npm cache clean --force && \
    npm install --legacy-peer-deps --verbose 2>&1 || \
    (echo "NPM install failed!" && exit 1)

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine

# Install dumb-init for proper signal handling and curl for healthchecks
RUN apk add --no-cache dumb-init curl

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm cache clean --force && \
    npm install --production --legacy-peer-deps

# Copy built application from builder stage
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist

# Copy plugins assets folder
COPY --from=builder --chown=nodejs:nodejs /app/plugins-assets ./plugins-assets

# Switch to non-root user
USER nodejs

# Expose port (default 3062, can be overridden by PORT env)
EXPOSE ${PORT:-3062}

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/main"]