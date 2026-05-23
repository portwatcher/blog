# Blog

My personal blog implementing the Classify theme of [Farbox](https://github.com/hepochen/FarBox), written with Nuxt3

I do this because Farbox is not longer updated and maintained, but my blog needs to do so

![](./screenshot.png)

## Features

- RSS feed at `/feed`
- Markdown
- Mathjax
- i18n
- Archive group by year
- giscus comment system
- neodb.social collections
- Git-backed content repo through Nuxt Content collections
- Decap CMS at `/admin`
- S3-compatible image/video uploads with multipart upload support
- Generated article translations from the content repo

## Setup

### Edit Config

In `nuxt.config.ts`, input your `host`

### Add Your Content

Content is expected to live in a separate git repository. The blog app still remains a single-clone user experience: this repo owns the Nuxt app, Decap admin UI, deploy workflow, and S3 upload endpoints. The private content repo stores Markdown only.

Set these envs in local dev and deploy:

```env
NUXT_PUBLIC_CMS_CONTENT_REPO=owner/private-blog-content
NUXT_PUBLIC_CMS_CONTENT_BRANCH=main
BLOG_CONTENT_AUTH_TOKEN=github_pat_or_deploy_token_with_read_access
```

If your content repo is not on GitHub HTTPS, set the full source URL:

```env
BLOG_CONTENT_REPOSITORY=https://git.example.com/owner/private-blog-content.git
```

Articles edited by Decap are stored under `posts/` in the content repo. Use the `category` frontmatter field for category pages.

An example article:

```
---
title: Your Title
description: Short summary
category: notes
date: 2015-02-04 20:31
status: public
cover:
  provider: s3
  key: blog-media/2026/05/22/example.webp
---

You content goes here

```

Make `status` private will hide your article

Generated translations are read from `translations/**/*.md` in the content repo. Configure visible/generated languages with:

```env
NUXT_PUBLIC_TRANSLATION_LANGUAGES=en,ja
NUXT_PUBLIC_ORIGINAL_LANGUAGE=zh
```

Translated article pages are available with `?lang=<code>` on the original article URL, for example `/articles/Your%20Title?lang=en`.

### CMS

Open `/admin` to use Decap CMS. Decap commits Markdown to `NUXT_PUBLIC_CMS_CONTENT_REPO`.

Images and videos are served from S3-compatible storage. The custom Decap widgets upload files through this Nuxt app and write object references into Markdown/frontmatter; an optional Git LFS mirror can keep a backup copy in the content repo.

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

For R2, MinIO, or other S3-compatible stores, also set:

```env
NUXT_S3_ENDPOINT=https://...
NUXT_S3_FORCE_PATH_STYLE=true
```

Multipart uploads are always used. The browser uploads each part directly to S3 with presigned URLs; S3 credentials never leave the server.

If you want the content repo to keep a backup copy of every uploaded image and video, enable the Git LFS mirror:

```env
NUXT_CMS_LFS_BACKUP_ENABLED=true
NUXT_CMS_LFS_REPOSITORY=https://github.com/owner/private-blog-content.git
NUXT_CMS_LFS_BRANCH=main
NUXT_CMS_LFS_MEDIA_DIR=media
NUXT_CMS_LFS_AUTH_USERNAME=x-access-token
NUXT_CMS_LFS_AUTH_TOKEN=github_pat_or_deploy_token_with_write_access
```

The deployment runtime must have `git` and `git-lfs` installed. After S3 multipart completion, the server clones the content repo, ensures `media/**` is tracked by Git LFS, downloads the S3 object, commits it under `NUXT_CMS_LFS_MEDIA_DIR`, and pushes it back. S3 remains the serving source; the Git LFS copy is the recovery archive.

When the mirror succeeds, Decap stores the backup path with the media reference:

```yaml
cover:
  provider: s3
  key: blog-media/2026/05/22/example.webp
  lfsPath: media/2026/05/22/example.webp
```

Configure bucket CORS for the admin origin:

```bash
S3_CORS_ALLOWED_ORIGINS=http://localhost:3000 pnpm cms:s3-cors
```

The required S3 CORS rule exposes the `ETag` header, which multipart completion needs.

In Markdown body content, use the Decap editor components or write MDC manually:

```md
::s3-image{objectKey="blog-media/2026/05/22/diagram.webp" alt="Diagram"}
::

::s3-video{objectKey="blog-media/2026/05/22/demo.mp4" posterKey="blog-media/2026/05/22/poster.webp"}
::
```

Content repo pushes should trigger this app repo's deploy. This repository includes a `Deploy` GitHub Actions workflow that accepts a `repository_dispatch` event named `blog-content-updated`, rebuilds the image with the private content repo, pushes `ghcr.io/portwatcher/blog:develop`, and restarts the production Kubernetes deployment.

### Deploy

The Docker build reads private content with a BuildKit secret named `blog_content_auth_token`; do not pass the content token as a normal Docker build arg.
