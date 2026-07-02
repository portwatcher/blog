import { createError, getHeader, type H3Event } from 'h3'
import { createHash, timingSafeEqual } from 'node:crypto'
import { useRuntimeConfig } from '#imports'

export type CmsAuthMode = 'proxy-token' | 'github-oauth'

export interface CmsGitHubProxyConfig {
  adminToken?: string
  githubToken?: string
}

export interface CmsGitHubOAuthConfig {
  clientId?: string
  clientSecret?: string
  scope: string
}

const readString = (runtimeValue: unknown, envNames: string[], fallback = '') => {
  for (const envName of envNames) {
    const value = process.env[envName]
    if (value) return value
  }
  return typeof runtimeValue === 'string' && runtimeValue ? runtimeValue : fallback
}

const githubWritePermissionCache = new Map<string, number>()
const githubWritePermissionCacheMs = 5 * 60 * 1000

const normalizeCmsAuthMode = (value: string): CmsAuthMode =>
  ['github-oauth', 'oauth', 'github'].includes(value.trim().toLowerCase()) ? 'github-oauth' : 'proxy-token'

const getAuthorizationToken = (event: H3Event) => {
  const authorization = getHeader(event, 'authorization') || ''
  const match = authorization.match(/^(?:token|bearer)\s+(.+)$/i)

  return match?.[1] || ''
}

const constantTimeEquals = (provided: string, expected: string) => {
  const providedBuffer = Buffer.from(provided)
  const expectedBuffer = Buffer.from(expected)

  return providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
}

export const getCmsAuthMode = (event?: H3Event): CmsAuthMode => {
  const config = useRuntimeConfig(event)
  const configuredMode = readString(
    config.public.cmsAuthMode,
    ['NUXT_PUBLIC_CMS_AUTH_MODE', 'CMS_AUTH_MODE'],
    'proxy-token'
  )

  return normalizeCmsAuthMode(configuredMode)
}

export const getCmsGitHubProxyConfig = (event?: H3Event): CmsGitHubProxyConfig => {
  const config = useRuntimeConfig(event)

  return {
    adminToken: readString(
      config.cmsAdminToken,
      ['NUXT_CMS_ADMIN_TOKEN', 'CMS_ADMIN_TOKEN', 'NUXT_CMS_UPLOAD_TOKEN', 'CMS_UPLOAD_TOKEN']
    ) || undefined,
    githubToken: readString(
      config.cmsGithubAuthToken,
      [
        'NUXT_CMS_GITHUB_AUTH_TOKEN',
        'CMS_GITHUB_AUTH_TOKEN',
        'BLOG_CONTENT_WRITE_AUTH_TOKEN',
        'BLOG_CONTENT_AUTH_TOKEN',
      ]
    ) || undefined,
  }
}

export const getCmsGitHubOAuthConfig = (event?: H3Event): CmsGitHubOAuthConfig => {
  const config = useRuntimeConfig(event)

  return {
    clientId: readString(
      config.cmsGithubOAuthClientId,
      ['NUXT_CMS_GITHUB_OAUTH_CLIENT_ID', 'CMS_GITHUB_OAUTH_CLIENT_ID']
    ) || undefined,
    clientSecret: readString(
      config.cmsGithubOAuthClientSecret,
      ['NUXT_CMS_GITHUB_OAUTH_CLIENT_SECRET', 'CMS_GITHUB_OAUTH_CLIENT_SECRET']
    ) || undefined,
    scope: readString(
      config.cmsGithubOAuthScope,
      ['NUXT_CMS_GITHUB_OAUTH_SCOPE', 'CMS_GITHUB_OAUTH_SCOPE'],
      'repo'
    ),
  }
}

export const assertCmsGitHubProxyConfigured = (config: CmsGitHubProxyConfig) => {
  if (!config.githubToken) {
    throw createError({
      statusCode: 500,
      statusMessage: 'CMS GitHub token is not configured',
    })
  }

  if (!config.adminToken && process.env.NODE_ENV === 'production') {
    throw createError({
      statusCode: 500,
      statusMessage: 'CMS admin token is not configured',
    })
  }
}

export const assertCmsGitHubOAuthConfigured = (config: CmsGitHubOAuthConfig) => {
  if (!config.clientId || !config.clientSecret) {
    throw createError({
      statusCode: 500,
      statusMessage: 'CMS GitHub OAuth client is not configured',
    })
  }
}

export const assertCmsGitHubTokenCanWriteContentRepo = async (event: H3Event, token: string) => {
  const config = useRuntimeConfig(event)
  const repo = readString(
    config.public.cmsContentRepo,
    ['NUXT_PUBLIC_CMS_CONTENT_REPO']
  )
  const [owner, name] = repo.split('/')

  if (!owner || !name || repo.split('/').length !== 2) {
    throw createError({
      statusCode: 500,
      statusMessage: 'NUXT_PUBLIC_CMS_CONTENT_REPO must be set to owner/repo for GitHub OAuth authorization',
    })
  }

  const cacheKey = createHash('sha256').update(`${repo}\0${token}`).digest('hex')
  const cachedUntil = githubWritePermissionCache.get(cacheKey) || 0
  if (cachedUntil > Date.now()) return

  const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'user-agent': 'juryquinn-blog-cms',
      'x-github-api-version': '2022-11-28',
    },
  })

  if (!response.ok) {
    throw createError({
      statusCode: response.status === 404 ? 403 : response.status,
      statusMessage: 'GitHub token cannot access the CMS content repo',
    })
  }

  const payload = await response.json() as {
    permissions?: {
      admin?: boolean
      maintain?: boolean
      push?: boolean
    }
  }
  const permissions = payload.permissions || {}

  if (!permissions.admin && !permissions.maintain && !permissions.push) {
    throw createError({
      statusCode: 403,
      statusMessage: 'GitHub token does not have write access to the CMS content repo',
    })
  }

  githubWritePermissionCache.set(cacheKey, Date.now() + githubWritePermissionCacheMs)
}

export const assertCmsGitHubProxyAuthorized = (event: H3Event, config = getCmsGitHubProxyConfig(event)) => {
  assertCmsGitHubProxyConfigured(config)
  assertCmsAdminAuthorized(event, config)
}

export const assertCmsAdminAuthorized = (event: H3Event, config = getCmsGitHubProxyConfig(event)) => {
  if (!config.adminToken && process.env.NODE_ENV !== 'production') return

  if (!config.adminToken) {
    throw createError({
      statusCode: 500,
      statusMessage: 'CMS admin token is not configured',
    })
  }

  const provided = getAuthorizationToken(event)

  if (!provided || !constantTimeEquals(provided, config.adminToken)) {
    throw createError({
      statusCode: 401,
      statusMessage: 'CMS admin token required',
    })
  }
}
