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

### CMS

Open `/admin` to use Decap CMS. Decap commits Markdown to `NUXT_PUBLIC_CMS_CONTENT_REPO`.

Images and videos are not committed to git. The custom Decap widgets upload files through this Nuxt app into S3-compatible storage and write only object references into Markdown/frontmatter.

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

Content repo pushes should trigger this app repo's deploy through your host's deploy hook or GitHub Actions workflow. The content repo itself does not need CI.

### Deploy

vercel, netlify, self made image with `Dockerfile`, you name it.
