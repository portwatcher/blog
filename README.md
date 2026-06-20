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

Content lives in a separate Git repository. This app repo owns Nuxt, Decap, media upload endpoints, the Docker image recipe, and reusable deployment examples. Each site owner should keep real deployment credentials and infrastructure state in their own private repo.

To bootstrap a content repository from the bundled template, run the guided initializer:

```bash
pnpm content:init
```

The initializer copies `templates/content-repo`, fills repository-specific placeholders, creates an initial git commit by default, and prints the next steps for creating the private repo and configuring runtime envs. In interactive mode it asks for:

- target directory
- app repository and content repository
- content branch
- initial post title
- automation mode: content only, translations, image build dispatch, or deployment
- optional GitHub repository creation through `gh`

For non-interactive setup:

```bash
pnpm content:init \
  --yes \
  --target ../my-blog-content \
  --app-repo owner/blog \
  --content-repo owner/blog-content \
  --automation content
```

To generate a private content repo with translation and deployment automation:

```bash
pnpm content:init \
  --target ../my-blog-content \
  --app-repo owner/blog \
  --content-repo owner/blog-content \
  --automation deploy \
  --deploy-mode gitops \
  --github
```

After creating the generated repository, set these envs in local dev and in the deployment that runs the image:

```env
NUXT_PUBLIC_CMS_CONTENT_REPO=owner/private-blog-content
NUXT_PUBLIC_CMS_CONTENT_BRANCH=main
BLOG_CONTENT_AUTH_TOKEN=github_pat_or_deploy_token_with_read_access
BLOG_CONTENT_CACHE_TTL_MS=60000
```

`BLOG_CONTENT_AUTH_TOKEN` can be omitted when `NUXT_CMS_GITHUB_AUTH_TOKEN` is already set and can read the content repo.

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
status: draft
cover:
  provider: s3
  key: blog-media/2026/05/23/example.webp
---

Your content goes here.
```

Set `status: draft` to keep an article out of listings and direct article responses. Set `status: private` to hide an article behind the article password, or `status: public` to publish it.

Generated translations are read from `translations/**/*.md`. Configure visible/generated languages with:

```env
NUXT_PUBLIC_TRANSLATION_LANGUAGES=zh,en,ja
NUXT_PUBLIC_ORIGINAL_LANGUAGE=zh
```

Translated article pages are available with `?lang=<code>` on the original article URL, for example `/articles/Your%20Title?lang=en`.

### GitHub Template Onboarding

For teams, the lowest-friction onboarding path is to create each private content repo from the sanitized content template: [portwatcher/blog-content-template](https://github.com/portwatcher/blog-content-template). Keep each developer's real content repo private.

Recommended repository split:

1. App repo: create from [portwatcher/blog](https://github.com/portwatcher/blog) or fork it if you want an upstream update path.
2. Content template repo: [portwatcher/blog-content-template](https://github.com/portwatcher/blog-content-template), generated from `templates/content-repo`.
3. Content repo: private repo created from the content template or from `pnpm content:init`.
4. Infrastructure repo or platform: stores runtime secrets, image pull secrets, and deployment manifests.

GitHub template repositories are best for initial scaffolding. They do not provide an easy upstream update path, so keep reusable app behavior in this app repo and keep content-template files small and generic.

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

In Markdown body content, use the Decap editor components, paste/drop an image or video in Markdown mode, or write MDC manually:

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

## Deploy Your Own Blog

Production deployment has three separate pieces:

1. This public app repo builds a reusable Nuxt Docker image.
2. Your private content repo stores Markdown.
3. Your infrastructure repo or platform deploys the image and provides runtime envs/secrets.

The image is not content-bound. It reads `NUXT_PUBLIC_CMS_CONTENT_REPO` or `BLOG_CONTENT_REPOSITORY` at runtime and refreshes content after `BLOG_CONTENT_CACHE_TTL_MS`.

## Docker Build

The Docker build does not read private content and does not need content credentials.

```bash
docker build -t ghcr.io/owner/blog:main .
```

Run the image with the runtime envs from `.env.example`:

```bash
docker run --rm -p 3000:3000 --env-file .env ghcr.io/owner/blog:main
```

## GitHub Actions Image Build

The app repo includes `.github/workflows/build-image.yml`. It builds and pushes a Docker image, but does not deploy to any specific infrastructure.

App repo variables:

| Variable | Default |
| --- | --- |
| `IMAGE` | `ghcr.io/${{ github.repository }}` |
| `IMAGE_TAG` | current ref name |

No app repo secret is required for image builds. Content tokens, CMS tokens, S3 credentials, OAuth secrets, upload tokens, and NeoDB keys belong on the server or Kubernetes deployment that runs the image.

The runtime must have `git` available so it can clone the configured content repo. The provided Docker image includes `git` and `git-lfs`.

For Kubernetes, keep manifests, image-pull secrets, runtime secrets, and rollout credentials in a private infra repo or private content/site repo. Do not put live cluster defaults in this public app repo.

## Publishing Content

Publishing or updating a post is just a commit to the content repo. The running app refreshes from Git after `BLOG_CONTENT_CACHE_TTL_MS`, so ordinary content changes do not require rebuilding the image.

If your content repo has extra automation, such as generated translations or an infrastructure-specific rollout hook, keep that workflow in the private content or infra repo. Do not put live deployment credentials in this public app repo.
