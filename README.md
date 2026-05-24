# Blog

Personal blog implementing the Classify theme of [Farbox](https://github.com/hepochen/FarBox), written with Nuxt 3.

![](./screenshot.png)

## Features

- RSS feed at `/feed`
- Markdown and MathJax
- i18n article UI and generated article translations
- Archive pages grouped by year
- giscus comments
- neodb.social collections
- Git-backed private content repo through Nuxt Content
- Decap CMS at `/admin`
- S3-compatible image/video uploads with multipart upload support
- Optional Git LFS media backup into the content repo

## Local Development

Prerequisites:

- Node.js 20 or newer
- pnpm through Corepack
- `git`
- `git-lfs` if you enable the optional LFS media backup

```bash
corepack enable
pnpm install
cp .env.example .env
pnpm dev
```

Open `http://localhost:3000`.

The app can run against local Markdown under `content/`, but production-style usage expects a separate content repository.

## Content Repo

Content lives in a separate Git repository. This app repo owns Nuxt, Decap, media upload endpoints, Docker, and deployment. The content repo stores Markdown.

Set these envs in local dev, Docker build, and deployment:

```env
NUXT_PUBLIC_CMS_CONTENT_REPO=owner/private-blog-content
NUXT_PUBLIC_CMS_CONTENT_BRANCH=main
BLOG_CONTENT_AUTH_TOKEN=github_pat_or_deploy_token_with_read_access
```

If your content repo is not a GitHub `owner/repo` HTTPS repo, set the full source URL:

```env
BLOG_CONTENT_REPOSITORY=https://git.example.com/owner/private-blog-content.git
```

Expected content repo shape:

```text
categories/
  Technology.md
posts/
  Technology/
    2026-05-23-example.md
translations/
  en/
    Technology/
      2026-05-23-example.md
```

Articles edited by Decap are stored under `posts/`. Use the `category` frontmatter field for category pages.

```md
---
title: Your Title
description: Short summary
category: Technology
date: 2026-05-23 20:31
status: public
cover:
  provider: s3
  key: blog-media/2026/05/23/example.webp
---

Your content goes here.
```

Set `status: private` to hide an article behind the article password.

Generated translations are read from `translations/**/*.md`. Configure visible/generated languages with:

```env
NUXT_PUBLIC_TRANSLATION_LANGUAGES=zh,en,ja
NUXT_PUBLIC_ORIGINAL_LANGUAGE=zh
```

Translated article pages are available with `?lang=<code>` on the original article URL, for example `/articles/Your%20Title?lang=en`.

## Decap CMS Auth

Open `/admin` to use Decap CMS.

This project supports two CMS auth modes. The default preserves the current production behavior.

### Server Token Proxy

This is the default:

```env
NUXT_PUBLIC_CMS_AUTH_MODE=proxy-token
NUXT_CMS_ADMIN_TOKEN=replace-with-a-long-random-admin-token
NUXT_CMS_GITHUB_AUTH_TOKEN=github_pat_or_deploy_token_with_write_access
```

Decap prompts for the CMS admin token. The server-side GitHub proxy then commits to `NUXT_PUBLIC_CMS_CONTENT_REPO` using `NUXT_CMS_GITHUB_AUTH_TOKEN`.

For compatibility, `CMS_ADMIN_TOKEN`, `CMS_GITHUB_AUTH_TOKEN`, `BLOG_CONTENT_WRITE_AUTH_TOKEN`, and `BLOG_CONTENT_AUTH_TOKEN` are also read as fallbacks.

### Login With GitHub

Use this mode when each editor should authenticate with GitHub and GitHub should decide whether they can write to the content repo:

```env
NUXT_PUBLIC_CMS_AUTH_MODE=github-oauth
NUXT_CMS_GITHUB_OAUTH_CLIENT_ID=...
NUXT_CMS_GITHUB_OAUTH_CLIENT_SECRET=...
NUXT_CMS_GITHUB_OAUTH_SCOPE=repo
```

Create a GitHub OAuth app with this callback URL:

```text
https://your-blog.example.com/admin/auth/callback
```

Editors must have write access to `NUXT_PUBLIC_CMS_CONTENT_REPO`. In this mode Decap uses the editor's GitHub OAuth token directly for content edits. Media upload endpoints also accept that GitHub token after verifying write access to the content repo.

For private content repos, keep `NUXT_CMS_GITHUB_OAUTH_SCOPE=repo`. For public-only repos, `public_repo` can be enough.

## Media Uploads

Images and videos are served from S3-compatible storage. Custom Decap widgets upload files through this Nuxt app and write object references into Markdown/frontmatter.

Set media envs:

```env
NUXT_PUBLIC_MEDIA_BASE_URL=https://media.example.com
NUXT_CMS_UPLOAD_TOKEN=replace-with-a-long-random-token
NUXT_S3_BUCKET=blog-media
NUXT_S3_REGION=us-east-1
NUXT_S3_ACCESS_KEY_ID=...
NUXT_S3_SECRET_ACCESS_KEY=...
NUXT_S3_KEY_PREFIX=blog-media
```

`NUXT_CMS_UPLOAD_TOKEN` is required in production unless `NUXT_PUBLIC_CMS_AUTH_MODE=github-oauth` is enabled and editors authenticate with a GitHub token that can write to the content repo.

For R2, MinIO, or other S3-compatible stores, also set:

```env
NUXT_S3_ENDPOINT=https://...
NUXT_S3_FORCE_PATH_STYLE=true
```

Multipart uploads are always used. The browser uploads each part directly to S3 with presigned URLs; S3 credentials never leave the server.

Configure bucket CORS for the admin origin:

```bash
S3_CORS_ALLOWED_ORIGINS=http://localhost:3000 pnpm cms:s3-cors
```

The required S3 CORS rule exposes the `ETag` header, which multipart completion needs.

In Markdown body content, use the Decap editor components or write MDC manually:

```md
::s3-image{objectKey="blog-media/2026/05/23/diagram.webp" alt="Diagram"}
::

::s3-video{objectKey="blog-media/2026/05/23/demo.mp4" posterKey="blog-media/2026/05/23/poster.webp"}
::
```

### Optional Git LFS Backup

S3 remains the serving source. The Git LFS mirror only keeps a recovery copy in the content repo.

```env
NUXT_CMS_LFS_BACKUP_ENABLED=true
NUXT_CMS_LFS_REPOSITORY=https://github.com/owner/private-blog-content.git
NUXT_CMS_LFS_BRANCH=main
NUXT_CMS_LFS_MEDIA_DIR=media
NUXT_CMS_LFS_AUTH_USERNAME=x-access-token
NUXT_CMS_LFS_AUTH_TOKEN=github_pat_or_deploy_token_with_write_access
```

The deployment runtime must have `git` and `git-lfs` installed. After S3 multipart completion, the server clones the content repo, ensures `media/**` is tracked by Git LFS, downloads the S3 object, commits it under `NUXT_CMS_LFS_MEDIA_DIR`, and pushes it back.

## Docker Build

The Docker build reads private content with a BuildKit secret named `blog_content_auth_token`. Do not pass the content token as a normal Docker build arg.

```bash
DOCKER_BUILDKIT=1 docker buildx build \
  --secret id=blog_content_auth_token,env=BLOG_CONTENT_AUTH_TOKEN \
  --build-arg NUXT_PUBLIC_CMS_CONTENT_REPO=owner/private-blog-content \
  --build-arg NUXT_PUBLIC_CMS_CONTENT_BRANCH=main \
  --build-arg NUXT_PUBLIC_MEDIA_BASE_URL=https://media.example.com \
  -t ghcr.io/owner/blog:main \
  .
```

Run the built image with the runtime envs from `.env.example`:

```bash
docker run --rm -p 3000:3000 --env-file .env ghcr.io/owner/blog:main
```

## GitHub Actions Deploy

The app repo includes `.github/workflows/deploy.yml`. It builds and pushes a Docker image, then optionally restarts a Kubernetes deployment if `KUBE_CONFIG` is set.

Required app repo secret:

```env
BLOG_CONTENT_AUTH_TOKEN=github_pat_or_deploy_token_with_read_access
```

Optional app repo secret:

```env
KUBE_CONFIG=base64_or_plain_kubeconfig_used_by_kubectl
```

App repo variables:

| Variable | Default |
| --- | --- |
| `IMAGE` | `ghcr.io/${{ github.repository }}` |
| `IMAGE_TAG` | current ref name |
| `CONTENT_REPO` | `${{ github.repository_owner }}/blog-content` |
| `CONTENT_BRANCH` | `main` |
| `BLOG_CONTENT_REPOSITORY` | empty |
| `MEDIA_BASE_URL` | current juryquinn.com media bucket URL |
| `KUBE_NAMESPACE` | `perohub` |
| `KUBE_DEPLOYMENT` | `blog` |
| `KUBE_CONTAINER` | `blog` |

The defaults keep the current `portwatcher/blog` production deployment working. Other developers should set at least `CONTENT_REPO`, `MEDIA_BASE_URL`, and their Kubernetes variables, or omit `KUBE_CONFIG` to build and push only.

Runtime envs such as S3 credentials, CMS auth mode, OAuth secrets, upload token, and NeoDB key must be configured on the server or Kubernetes deployment that runs the image.

## Content Repo Dispatch Workflow

Content repo pushes should trigger this app repo's deploy through a `repository_dispatch` event named `blog-content-updated`.

Add this to the content repo as `.github/workflows/deploy-blog.yml`:

```yaml
name: Deploy Blog

on:
  push:
    branches:
      - main
    paths:
      - posts/**
      - media/**
      - translations/**
      - .github/workflows/deploy-blog.yml
  workflow_dispatch:

concurrency:
  group: deploy-blog
  cancel-in-progress: true

permissions:
  contents: read

env:
  BLOG_APP_REPOSITORY: ${{ vars.BLOG_APP_REPOSITORY || 'owner/blog' }}
  BLOG_DISPATCH_EVENT: ${{ vars.BLOG_DISPATCH_EVENT || 'blog-content-updated' }}

jobs:
  dispatch:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout content
        uses: actions/checkout@v4

      - name: Dispatch blog rebuild
        env:
          GH_TOKEN: ${{ secrets.BLOG_DEPLOY_DISPATCH_TOKEN }}
        run: |
          COMMIT_SHA="$(git rev-parse HEAD)"
          gh api "repos/${BLOG_APP_REPOSITORY}/dispatches" \
            --method POST \
            --field "event_type=${BLOG_DISPATCH_EVENT}" \
            --field "client_payload[content_sha]=${COMMIT_SHA}"
```

Set this content repo secret:

```env
BLOG_DEPLOY_DISPATCH_TOKEN=github_token_with_contents_write_on_the_app_repo
```

For fine-grained GitHub tokens, grant access to the app repo and `Contents: Read and write`. For classic PATs, use `repo` scope when either repo is private.
