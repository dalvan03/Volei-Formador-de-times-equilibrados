# Stage 1: Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency specifications
COPY package*.json ./

# Install dependencies including devDependencies for building
RUN npm ci || npm install

# Copy source files
COPY . .

# Build application
RUN npm run build

# Stage 2: Runtime stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy package files and install only production dependencies
COPY package*.json ./
RUN npm ci --only=production || npm install --production

# Copy compiled assets and db schema from build stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/src/db ./src/db

# Ensure data directory exists for db persistence
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "dist/server.cjs"]
