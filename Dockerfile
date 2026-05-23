# syntax=docker/dockerfile:1.7

FROM node:lts AS base

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

ARG BLOG_CONTENT_AUTH_USERNAME=x-access-token
ARG BLOG_CONTENT_BRANCH=main
ARG BLOG_CONTENT_INCLUDE=posts/**/*.md
ARG BLOG_CONTENT_REPOSITORY
ARG NUXT_PUBLIC_CMS_CONTENT_REPO
ARG NUXT_PUBLIC_CMS_CONTENT_BRANCH=main
ARG NUXT_PUBLIC_MEDIA_BASE_URL

ENV BLOG_CONTENT_AUTH_USERNAME=$BLOG_CONTENT_AUTH_USERNAME \
    BLOG_CONTENT_BRANCH=$BLOG_CONTENT_BRANCH \
    BLOG_CONTENT_INCLUDE=$BLOG_CONTENT_INCLUDE \
    BLOG_CONTENT_REPOSITORY=$BLOG_CONTENT_REPOSITORY \
    NUXT_PUBLIC_CMS_CONTENT_REPO=$NUXT_PUBLIC_CMS_CONTENT_REPO \
    NUXT_PUBLIC_CMS_CONTENT_BRANCH=$NUXT_PUBLIC_CMS_CONTENT_BRANCH \
    NUXT_PUBLIC_MEDIA_BASE_URL=$NUXT_PUBLIC_MEDIA_BASE_URL

RUN --mount=type=secret,id=blog_content_auth_token \
  if [ -f /run/secrets/blog_content_auth_token ]; then \
    export BLOG_CONTENT_AUTH_TOKEN="$(cat /run/secrets/blog_content_auth_token)"; \
  fi; \
  npm run build


FROM base AS runner
WORKDIR /app

COPY --from=builder /app/.output  /app/.output

ENV NITRO_PORT=3000

EXPOSE 3000

CMD [ "node", ".output/server/index.mjs" ]
