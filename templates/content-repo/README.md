# Blog content

Private content repository for `{{BLOG_APP_REPOSITORY}}`.

This repository stores Markdown content and optional generated translations for a blog created from `{{BLOG_APP_REPOSITORY}}`. Decap CMS writes posts under `posts/`.

## Repository Shape

```text
categories/
  General.md
posts/
  General/
    welcome.md
translations/
media/
```

Post frontmatter should include at least:

```md
---
title: My post
description: Short summary
category: General
date: 2026-01-01 09:00
status: public
---
```

Use `status: private` to hide an article behind the blog's article password.

## Runtime Configuration

Configure the blog deployment that runs `{{BLOG_APP_REPOSITORY}}` with these runtime envs:

```env
NUXT_PUBLIC_CMS_CONTENT_REPO={{BLOG_CONTENT_REPOSITORY}}
NUXT_PUBLIC_CMS_CONTENT_BRANCH={{BLOG_CONTENT_BRANCH}}
BLOG_CONTENT_AUTH_TOKEN=github_token_with_read_access_to_this_repo
```

The public app image does not rebuild when content changes. A running app refreshes this repository from Git after `BLOG_CONTENT_CACHE_TTL_MS`.

Keep real infrastructure credentials in a private deployment repo or in this private content repo. The public app repo should build images only.
