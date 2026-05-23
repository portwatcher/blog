import { createError, getHeader, type H3Event } from 'h3'
import { timingSafeEqual } from 'node:crypto'
import { useRuntimeConfig } from '#imports'

export interface CmsGitHubProxyConfig {
  adminToken?: string
  githubToken?: string
}

const readString = (runtimeValue: unknown, envNames: string[], fallback = '') => {
  for (const envName of envNames) {
    const value = process.env[envName]
    if (value) return value
  }
  return typeof runtimeValue === 'string' && runtimeValue ? runtimeValue : fallback
}

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

export const assertCmsGitHubProxyAuthorized = (event: H3Event, config = getCmsGitHubProxyConfig(event)) => {
  assertCmsGitHubProxyConfigured(config)

  if (!config.adminToken) return

  const provided = getAuthorizationToken(event)

  if (!provided || !constantTimeEquals(provided, config.adminToken)) {
    throw createError({
      statusCode: 401,
      statusMessage: 'CMS admin token required',
    })
  }
}
