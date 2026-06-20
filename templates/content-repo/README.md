# Blog content

Private content repository for `{{BLOG_APP_REPOSITORY}}`.

This repository stores Markdown content and optional generated translations for a blog created from `{{BLOG_APP_REPOSITORY}}`. Decap CMS writes posts under `posts/`.

## Quick Start

Run the app repo initializer for the most guided setup:

```bash
pnpm content:init
```

The initializer can create this repository, select automation, initialize git, and optionally create/push the private GitHub repo with `gh`.

If this repository was created directly from a GitHub template, configure the repository variables and secrets listed below before enabling automation.

## Repository Shape

```text
categories/
  General.md
posts/
  General/
    welcome.md
translations/
media/
scripts/              # included when automation is selected
.github/workflows/   # included when automation is selected
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

Use `status: draft` to keep an article out of listings and direct article responses. Use `status: private` to hide an article behind the blog's article password.

## Runtime Configuration

Configure the blog deployment that runs `{{BLOG_APP_REPOSITORY}}` with these runtime envs:

```env
NUXT_PUBLIC_CMS_CONTENT_REPO={{BLOG_CONTENT_REPOSITORY}}
NUXT_PUBLIC_CMS_CONTENT_BRANCH={{BLOG_CONTENT_BRANCH}}
BLOG_CONTENT_AUTH_TOKEN=github_token_with_read_access_to_this_repo
```

The public app image does not rebuild when content changes. A running app refreshes this repository from Git after `BLOG_CONTENT_CACHE_TTL_MS`.

Keep real infrastructure credentials in a private deployment repo or in this private content repo. The public app repo should build images only.

## Automation

Generated repositories can be created in one of four modes:

| Mode | What it includes |
| --- | --- |
| `content` | Content files only. No GitHub Actions workflow. |
| `translate` | Generates Markdown translations when `TRANSLATION_OPENAI_API_KEY` is configured. |
| `build` | Translation plus a dispatch to the app repo image workflow. |
| `deploy` | Translation, image build, and either GitOps or direct Kubernetes rollout. |

Set this repository variable when the workflow is included:

```env
BLOG_AUTOMATION_MODE={{BLOG_AUTOMATION_MODE}}
```

### Translation

Translation is optional. If the API key is not set, the workflow skips translation and still succeeds.

```env
# secrets
TRANSLATION_OPENAI_API_KEY=...
TRANSLATION_OPENAI_BASE_URL=https://api.openai.com/v1

# variables
TRANSLATION_OPENAI_MODEL=gpt-4o-mini
TRANSLATION_LANGUAGES=zh,en,ja
TRANSLATION_SOURCE_LANG=zh
TRANSLATION_SOURCE_LANGUAGE=Chinese
TRANSLATION_BODY_CHUNK_CHARS=6000
TRANSLATION_REQUEST_TIMEOUT_MS=180000
TRANSLATION_MAX_RETRIES=3
```

Set `lang` in a post's frontmatter when its original language is not the default source language. For example, `lang: ja` keeps a Japanese source article canonical and skips generated Japanese translations for it.

Run the workflow manually with `force_translate=true` to regenerate all translations even when source hashes have not changed.

### Image Build Dispatch

Required for `build` and `deploy` modes:

```env
# secret
BLOG_DEPLOY_DISPATCH_TOKEN=github_token_that_can_dispatch_{{BLOG_APP_REPOSITORY}}_and_read_actions

# variables
BLOG_APP_REPOSITORY={{BLOG_APP_REPOSITORY}}
BLOG_APP_WORKFLOW_FILE=build-image.yml
BLOG_DISPATCH_EVENT=blog-content-updated
BLOG_IMAGE={{BLOG_IMAGE}}
```

`BLOG_DEPLOY_DISPATCH_TOKEN` needs permission to call `repository_dispatch` on the app repo and read workflow runs so this repo can wait for the image build result.

### Deployment

Required only for `deploy` mode:

```env
BLOG_DEPLOY_MODE={{BLOG_DEPLOY_MODE}}
```

For GitOps or Argo CD style deployments:

```env
# secret
ARGOCD_REPO_TOKEN=github_token_with_write_access_to_the_deployment_repo

# variables
ARGOCD_REPO=owner/infra
ARGOCD_BRANCH=main
ARGOCD_BLOG_DEPLOYMENT=path/to/deployment.yaml
KUBE_CONTAINER=blog
```

For direct Kubernetes rollout:

```env
# secret
KUBE_CONFIG=plain_or_base64_kubeconfig

# variables
KUBE_NAMESPACE=default
KUBE_DEPLOYMENT=blog
KUBE_CONTAINER=blog
```

Use `BLOG_DEPLOY_MODE=either` to prefer GitOps when `ARGOCD_REPO_TOKEN` is configured and fall back to `KUBE_CONFIG` otherwise.
