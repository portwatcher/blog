import { createError, getHeader, getMethod, getRequestURL, readRawBody } from 'h3'
import { assertCmsGitHubProxyAuthorized, getCmsGitHubProxyConfig } from '../../../utils/cms-github'

const githubApiOrigin = 'https://api.github.com'
const routePrefix = '/admin/github-api/'

const responseHeadersToForward = [
  'content-type',
  'etag',
  'last-modified',
  'link',
  'x-github-request-id',
  'x-oauth-scopes',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
  'x-ratelimit-resource',
  'x-ratelimit-used',
]

export default defineEventHandler(async (event) => {
  const config = getCmsGitHubProxyConfig(event)
  assertCmsGitHubProxyAuthorized(event, config)

  const requestURL = getRequestURL(event)
  const apiPath = requestURL.pathname.startsWith(routePrefix)
    ? requestURL.pathname.slice(routePrefix.length)
    : ''

  if (!apiPath || apiPath.includes('..')) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid GitHub API path',
    })
  }

  const targetURL = `${githubApiOrigin}/${apiPath}${requestURL.search}`
  const method = getMethod(event)
  const headers = new Headers({
    accept: getHeader(event, 'accept') || 'application/vnd.github+json',
    authorization: `token ${config.githubToken}`,
    'user-agent': 'juryquinn-blog-cms',
    'x-github-api-version': getHeader(event, 'x-github-api-version') || '2022-11-28',
  })
  const contentType = getHeader(event, 'content-type')

  if (contentType) {
    headers.set('content-type', contentType)
  }

  const body = method === 'GET' || method === 'HEAD'
    ? undefined
    : await readRawBody(event, false) as unknown as BodyInit
  const response = await fetch(targetURL, {
    method,
    headers,
    body,
  })

  event.node.res.statusCode = response.status
  for (const headerName of responseHeadersToForward) {
    const value = response.headers.get(headerName)
    if (value) event.node.res.setHeader(headerName, value)
  }

  return Buffer.from(await response.arrayBuffer())
})
