import { existsSync } from 'node:fs'
import {
  chmod,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { basename, join, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { createMarkdownParser } from '@nuxtjs/mdc/runtime'
import rehypeMathjax from 'rehype-mathjax'
import remarkMath from 'remark-math'
import { useRuntimeConfig } from '#imports'
import type { H3Event } from 'h3'

const execFileAsync = promisify(execFile)
const defaultCacheTtlMs = 60 * 1000

export type RuntimeArticleDocument = Record<string, any>

export interface RuntimeContent {
  articles: RuntimeArticleDocument[]
  translations: RuntimeArticleDocument[]
}

interface RuntimeContentConfig {
  repository: string
  branch: string
  authUsername: string
  authToken?: string
  localDir: string
  articleIncludes: string[]
  translationIncludes: string[]
  cacheTtlMs: number
  mediaBaseUrl: string
  key: string
}

interface FileRef {
  absolutePath: string
  relativePath: string
}

interface RuntimeContentCache {
  key: string
  expiresAt: number
  value: RuntimeContent
}

let runtimeContentCache: RuntimeContentCache | undefined
let pendingRuntimeContent: { key: string, promise: Promise<RuntimeContent> } | undefined

const readString = (runtimeValue: unknown, envNames: string[], fallback = '') => {
  for (const envName of envNames) {
    const value = process.env[envName]
    if (value) return value
  }
  return typeof runtimeValue === 'string' && runtimeValue ? runtimeValue : fallback
}

const readNumber = (runtimeValue: unknown, envNames: string[], fallback: number) => {
  for (const envName of envNames) {
    const value = Number(process.env[envName])
    if (Number.isFinite(value) && value >= 0) return value
  }
  if (typeof runtimeValue === 'number' && Number.isFinite(runtimeValue) && runtimeValue >= 0) return runtimeValue
  if (typeof runtimeValue === 'string') {
    const value = Number(runtimeValue)
    if (Number.isFinite(value) && value >= 0) return value
  }
  return fallback
}

const githubRepoUrl = (repo: string) => {
  if (!repo) return ''
  if (repo.includes('://') || repo.startsWith('git@')) return repo
  return `https://github.com/${repo}.git`
}

const splitPatterns = (value: string, fallback: string) =>
  String(value || fallback)
    .split(',')
    .map((pattern) => pattern.trim().replace(/^\/+/, ''))
    .filter(Boolean)

const normalizePath = (value: string) => value.split(sep).join('/')

const globToRegExp = (pattern: string) => {
  let source = '^'

  for (let index = 0; index < pattern.length; index += 1) {
    if (pattern.startsWith('**/', index)) {
      source += '(?:.*/)?'
      index += 2
      continue
    }

    if (pattern.startsWith('**', index)) {
      source += '.*'
      index += 1
      continue
    }

    const char = pattern[index]
    if (char === '*') {
      source += '[^/]*'
      continue
    }

    source += char.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
  }

  return new RegExp(`${source}$`)
}

const matchesPattern = (relativePath: string, pattern: string) =>
  globToRegExp(pattern).test(relativePath)

const matchesAnyPattern = (relativePath: string, patterns: string[]) =>
  patterns.some((pattern) => matchesPattern(relativePath, pattern))

const tokenHash = (token?: string) =>
  token ? createHash('sha256').update(token).digest('hex').slice(0, 16) : ''

const normalizeManagedMediaKey = (value: string) => {
  const withoutQuery = value.split(/[?#]/)[0]

  try {
    return withoutQuery
      .split('/')
      .map(decodeURIComponent)
      .join('/')
  } catch (_error) {
    return withoutQuery
  }
}

const getManagedMediaProxyUrl = (value: unknown, config: RuntimeContentConfig) => {
  const url = String(value || '').trim()
  const mediaBaseUrl = config.mediaBaseUrl.replace(/\/+$/, '')

  if (!url || !mediaBaseUrl || !url.startsWith(`${mediaBaseUrl}/`)) return undefined

  const key = normalizeManagedMediaKey(url.slice(mediaBaseUrl.length + 1))
  return key ? `/api/cms/media/object?key=${encodeURIComponent(key)}` : undefined
}

const rewriteManagedMediaUrls = <T>(value: T, config: RuntimeContentConfig): T => {
  if (!config.mediaBaseUrl || value === null || value === undefined) return value
  if (typeof value !== 'object') return value
  if (Array.isArray(value)) {
    return value.map((item) => rewriteManagedMediaUrls(item, config)) as T
  }

  const next: Record<string, any> = { ...(value as Record<string, any>) }

  for (const [key, child] of Object.entries(next)) {
    if ((key === 'src' || key === 'poster') && typeof child === 'string') {
      next[key] = getManagedMediaProxyUrl(child, config) || child
      continue
    }

    next[key] = rewriteManagedMediaUrls(child, config)
  }

  return next as T
}

const getRuntimeContentConfig = (event?: H3Event): RuntimeContentConfig => {
  const config = useRuntimeConfig(event)
  const publicRepo = readString(config.public.cmsContentRepo, ['NUXT_PUBLIC_CMS_CONTENT_REPO'])
  const mediaBaseUrl = readString(config.public.mediaBaseUrl, ['NUXT_PUBLIC_MEDIA_BASE_URL'])
    .replace(/\/+$/, '')
  const repository = readString(
    undefined,
    ['BLOG_CONTENT_REPOSITORY'],
    githubRepoUrl(publicRepo)
  )
  const branch = readString(
    config.public.cmsContentBranch,
    ['BLOG_CONTENT_BRANCH', 'NUXT_PUBLIC_CMS_CONTENT_BRANCH'],
    'main'
  )
  const authToken = readString(
    config.cmsGithubAuthToken,
    [
      'BLOG_CONTENT_AUTH_TOKEN',
      'NUXT_CMS_GITHUB_AUTH_TOKEN',
      'CMS_GITHUB_AUTH_TOKEN',
      'BLOG_CONTENT_WRITE_AUTH_TOKEN',
    ]
  ) || undefined
  const localDir = resolve(
    process.cwd(),
    readString(undefined, ['BLOG_CONTENT_LOCAL_DIR'], 'content')
  )
  const articleFallback = repository ? 'posts/**/*.md' : '**/*.md'
  const articleIncludes = splitPatterns(
    readString(undefined, ['BLOG_CONTENT_INCLUDE']),
    articleFallback
  )
  const translationIncludes = splitPatterns(
    readString(undefined, ['BLOG_TRANSLATION_INCLUDE']),
    'translations/**/*.md'
  )
  const cacheTtlMs = readNumber(
    undefined,
    ['BLOG_CONTENT_CACHE_TTL_MS'],
    defaultCacheTtlMs
  )
  const key = JSON.stringify({
    repository,
    branch,
    localDir,
    articleIncludes,
    translationIncludes,
    token: tokenHash(authToken),
    mediaBaseUrl,
  })

  return {
    repository,
    branch,
    authUsername: readString(undefined, ['BLOG_CONTENT_AUTH_USERNAME'], 'x-access-token'),
    authToken,
    localDir,
    articleIncludes,
    translationIncludes,
    cacheTtlMs,
    mediaBaseUrl,
    key,
  }
}

const redact = (message: string, config: RuntimeContentConfig) =>
  config.authToken ? message.split(config.authToken).join('[redacted]') : message

const gitEnv = (config: RuntimeContentConfig, askPassPath?: string) => ({
  ...process.env,
  GIT_TERMINAL_PROMPT: '0',
  GIT_LFS_SKIP_SMUDGE: '1',
  GIT_ASKPASS: askPassPath || process.env.GIT_ASKPASS,
  GIT_AUTH_USERNAME: config.authUsername,
  GIT_AUTH_TOKEN: config.authToken || '',
})

const runGit = async (
  args: string[],
  cwd: string,
  config: RuntimeContentConfig,
  askPassPath?: string
) => {
  try {
    await execFileAsync('git', args, {
      cwd,
      env: gitEnv(config, askPassPath),
      maxBuffer: 10 * 1024 * 1024,
    })
  } catch (error: any) {
    const stderr = String(error.stderr || '')
    const stdout = String(error.stdout || '')
    const message = stderr || stdout || error.message || 'git failed'
    throw new Error(redact(message.trim(), config))
  }
}

const writeAskPassScript = async (directory: string, config: RuntimeContentConfig) => {
  if (!config.authToken) return undefined

  const scriptPath = join(directory, 'git-askpass.sh')
  await writeFile(scriptPath, [
    '#!/bin/sh',
    'case "$1" in',
    '  *Username*) printf "%s\\n" "$GIT_AUTH_USERNAME" ;;',
    '  *) printf "%s\\n" "$GIT_AUTH_TOKEN" ;;',
    'esac',
    '',
  ].join('\n'))
  await chmod(scriptPath, 0o700)
  return scriptPath
}

const cloneContentRepository = async (config: RuntimeContentConfig) => {
  const tempRoot = await mkdtemp(join(tmpdir(), 'blog-content-'))
  const checkoutPath = join(tempRoot, 'repo')
  const askPassPath = await writeAskPassScript(tempRoot, config)

  await runGit([
    'clone',
    '--depth',
    '1',
    '--single-branch',
    '--branch',
    config.branch,
    '--no-tags',
    config.repository,
    checkoutPath,
  ], tempRoot, config, askPassPath)

  return {
    root: checkoutPath,
    cleanup: () => rm(tempRoot, { recursive: true, force: true }),
  }
}

const collectMarkdownFiles = async (root: string, current = root): Promise<FileRef[]> => {
  if (!existsSync(root)) return []

  const entries = await readdir(current, { withFileTypes: true })
  const files = await Promise.all(entries.map(async (entry) => {
    if (entry.name === '.git' || entry.name === 'node_modules') return []

    const absolutePath = join(current, entry.name)
    if (entry.isDirectory()) return collectMarkdownFiles(root, absolutePath)
    if (!entry.isFile() || !entry.name.endsWith('.md')) return []

    return [{
      absolutePath,
      relativePath: normalizePath(relative(root, absolutePath)),
    }]
  }))

  return files.flat()
}

const stripArticleRoot = (relativePath: string) =>
  relativePath.startsWith('posts/') ? relativePath.slice('posts/'.length) : relativePath

const stripTranslationRoot = (relativePath: string) =>
  relativePath.startsWith('translations/') ? relativePath.slice('translations/'.length) : relativePath

const stripMarkdownExtension = (relativePath: string) => relativePath.replace(/\.md$/i, '')

const slugSegment = (segment: string) =>
  segment
    .trim()
    .replace(/\s+/g, '-')
    .replace(/_+/g, '-')
    .toLowerCase()

const documentPathFromStem = (stem: string) =>
  `/${stem.split('/').map(slugSegment).filter(Boolean).join('/')}`

const getDefaultCategory = (relativePath: string) => {
  const articlePath = stripArticleRoot(relativePath)
  return articlePath.split('/').filter(Boolean)[0] || ''
}

const normalizeStatus = (status: unknown) => {
  const normalized = String(status || 'public').trim().toLowerCase()
  if (normalized === 'draft') return 'draft'
  if (normalized === 'private') return 'private'
  return 'public'
}

const parseDateValue = (value: unknown) => {
  const normalized = String(value || '')
  const timestamp = Date.parse(normalized)
  if (Number.isFinite(timestamp)) return timestamp

  return Date.parse(normalized.replace(' ', 'T'))
}

export const sortArticlesByDateDesc = (left: RuntimeArticleDocument, right: RuntimeArticleDocument) => {
  const leftDate = parseDateValue(left.date)
  const rightDate = parseDateValue(right.date)
  if (Number.isFinite(leftDate) && Number.isFinite(rightDate) && leftDate !== rightDate) {
    return rightDate - leftDate
  }

  return String(right.title || '').localeCompare(String(left.title || ''))
}

const parserPromise = createMarkdownParser({
  remark: {
    plugins: {
      'remark-math': { instance: remarkMath },
    },
  },
  rehype: {
    plugins: {
      'rehype-mathjax': { instance: rehypeMathjax },
    },
  },
  highlight: false,
})

const parseMarkdownDocument = async (
  file: FileRef,
  root: string,
  collection: 'articles' | 'translations',
  config: RuntimeContentConfig
) => {
  const parser = await parserPromise
  const raw = await readFile(file.absolutePath, 'utf8')
  const parsed = await parser(raw, {
    fileOptions: {
      cwd: root,
      path: file.relativePath,
    },
  })
  const data = parsed.data || {}
  const collectionRelativePath = collection === 'articles'
    ? stripArticleRoot(file.relativePath)
    : stripTranslationRoot(file.relativePath)
  const stem = stripMarkdownExtension(collectionRelativePath)
  const path = documentPathFromStem(stem)
  const title = String(data.title || basename(stem) || file.relativePath)
  const category = String(data.category || getDefaultCategory(file.relativePath))
  const rawBody = parsed.toc ? { ...parsed.body, toc: parsed.toc } : parsed.body
  const body = rewriteManagedMediaUrls(rawBody, config)

  return {
    ...data,
    id: `${collection}:${file.relativePath}`,
    title,
    description: String(data.description || ''),
    category,
    date: String(data.date || ''),
    status: normalizeStatus(data.status),
    path,
    _path: path,
    _dir: category,
    stem,
    extension: 'md',
    basename: basename(stem),
    body,
    excerpt: parsed.excerpt,
  }
}

const loadRuntimeContentFromRoot = async (root: string, config: RuntimeContentConfig): Promise<RuntimeContent> => {
  const files = await collectMarkdownFiles(root)
  const translationFiles = files.filter((file) =>
    matchesAnyPattern(file.relativePath, config.translationIncludes)
  )
  const articleFiles = files.filter((file) =>
    matchesAnyPattern(file.relativePath, config.articleIncludes) &&
    !matchesAnyPattern(file.relativePath, config.translationIncludes)
  )
  const [articles, translations] = await Promise.all([
    Promise.all(articleFiles.map((file) => parseMarkdownDocument(file, root, 'articles', config))),
    Promise.all(translationFiles.map((file) => parseMarkdownDocument(file, root, 'translations', config))),
  ])

  return {
    articles: articles.sort(sortArticlesByDateDesc),
    translations,
  }
}

const loadRuntimeContent = async (config: RuntimeContentConfig) => {
  if (!config.repository) {
    return loadRuntimeContentFromRoot(config.localDir, config)
  }

  const checkout = await cloneContentRepository(config)
  try {
    return await loadRuntimeContentFromRoot(checkout.root, config)
  } finally {
    await checkout.cleanup()
  }
}

export const getRuntimeContent = async (event?: H3Event): Promise<RuntimeContent> => {
  const config = getRuntimeContentConfig(event)
  const now = Date.now()

  if (
    runtimeContentCache?.key === config.key &&
    runtimeContentCache.expiresAt > now
  ) {
    return runtimeContentCache.value
  }

  if (pendingRuntimeContent?.key === config.key) {
    return pendingRuntimeContent.promise
  }

  const staleValue = runtimeContentCache?.key === config.key
    ? runtimeContentCache.value
    : undefined

  const promise = loadRuntimeContent(config)
    .then((value) => {
      runtimeContentCache = {
        key: config.key,
        expiresAt: Date.now() + config.cacheTtlMs,
        value,
      }
      return value
    })
    .catch((error) => {
      if (staleValue) {
        console.error('Failed to refresh runtime blog content; serving stale content.', error)
        return staleValue
      }
      throw error
    })
    .finally(() => {
      if (pendingRuntimeContent?.key === config.key) {
        pendingRuntimeContent = undefined
      }
    })

  pendingRuntimeContent = { key: config.key, promise }
  return promise
}
