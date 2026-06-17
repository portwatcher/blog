# syntax=docker/dockerfile:1.7

FROM node:lts AS base
RUN apt-get update && \
  apt-get install -y --no-install-recommends ca-certificates git git-lfs && \
  git lfs install --system && \
  rm -rf /var/lib/apt/lists/*

FROM base AS deps
WORKDIR /app

# Enable Corepack
RUN corepack enable

# Copy package management files and install dependencies
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* ./
RUN \
  if [ -f yarn.lock ]; then yarn --frozen-lockfile; \
  elif [ -f package-lock.json ]; then npm ci; \
  elif [ -f pnpm-lock.yaml ]; then pnpm i --frozen-lockfile; \
  else echo "Lockfile not found." && exit 1; \
  fi


# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build


FROM base AS runner
WORKDIR /app

COPY --from=builder /app/.output  /app/.output

ENV NITRO_PORT=3000

EXPOSE 3000

CMD [ "node", ".output/server/index.mjs" ]
