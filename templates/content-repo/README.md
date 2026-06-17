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

## Image Build Dispatch

The bundled workflow dispatches `{{BLOG_APP_REPOSITORY}}` to rebuild the blog image when content changes. Configure these in this content repository:

```bash
gh variable set BLOG_APP_REPOSITORY --repo {{BLOG_CONTENT_REPOSITORY}} --body "{{BLOG_APP_REPOSITORY}}"
gh variable set BLOG_DISPATCH_EVENT --repo {{BLOG_CONTENT_REPOSITORY}} --body "{{BLOG_DISPATCH_EVENT}}"
gh secret set BLOG_DEPLOY_DISPATCH_TOKEN --repo {{BLOG_CONTENT_REPOSITORY}}
```

`BLOG_DEPLOY_DISPATCH_TOKEN` must be able to call `repository_dispatch` on the app repository.

Then configure the app repository build to read this repository:

```bash
gh variable set CONTENT_REPO --repo {{BLOG_APP_REPOSITORY}} --body "{{BLOG_CONTENT_REPOSITORY}}"
gh variable set CONTENT_BRANCH --repo {{BLOG_APP_REPOSITORY}} --body "{{BLOG_CONTENT_BRANCH}}"
gh secret set BLOG_CONTENT_AUTH_TOKEN --repo {{BLOG_APP_REPOSITORY}}
```

`BLOG_CONTENT_AUTH_TOKEN` only needs read access to this content repository.

Keep real infrastructure credentials in a private deployment repo or in this private content repo. The public app repo should build images only.
