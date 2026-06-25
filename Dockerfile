# Base image
FROM oven/bun:1.1-alpine AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Build the application
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Pass build arguments from Coolify to environment variables so they are embedded at build time
ARG SUPABASE_PROJECT_ID
ARG SUPABASE_PUBLISHABLE_KEY
ARG SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PROJECT_ID

ENV SUPABASE_PROJECT_ID=$SUPABASE_PROJECT_ID
ENV SUPABASE_PUBLISHABLE_KEY=$SUPABASE_PUBLISHABLE_KEY
ENV SUPABASE_URL=$SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID

# Set environment to production and force Nitro to use the node-server preset
ENV NODE_ENV=production
ENV NITRO_PRESET=node-server

RUN bun run build

# Production runtime stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Copy only the output and public folder
COPY --from=builder /app/.output ./.output

EXPOSE 3000

# Run using bun
CMD ["bun", "run", ".output/server/index.mjs"]
