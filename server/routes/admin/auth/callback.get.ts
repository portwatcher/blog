import { deleteCookie, getCookie, getHeader, getQuery, type H3Event } from 'h3'
import { timingSafeEqual } from 'node:crypto'
import {
  assertCmsGitHubOAuthConfigured,
  getCmsAuthMode,
  getCmsGitHubOAuthConfig,
} from '../../../utils/cms-github'

interface GitHubTokenResponse {
  access_token?: string
  error?: string
  error_description?: string
}

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '')

const firstQueryValue = (value: unknown) => Array.isArray(value) ? value[0] : String(value || '')

const constantTimeEquals = (provided: string, expected: string) => {
  const providedBuffer = Buffer.from(provided)
  const expectedBuffer = Buffer.from(expected)

  return providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
}

const getRequestOrigin = (event: H3Event) => {
  const host = getHeader(event, 'x-forwarded-host') || getHeader(event, 'host') || 'localhost:3000'
  const isLocalHost = host.includes('localhost') || host.startsWith('127.') || host.startsWith('[::1]')
  const protocol = isLocalHost
    ? 'http'
    : getHeader(event, 'x-forwarded-proto') || 'https'

  return `${protocol}://${host}`
}

const getCmsOrigin = (event: H3Event, publicHost: unknown) => {
  const configured = typeof publicHost === 'string' ? publicHost : ''

  if (configured && !configured.includes('localhost')) {
    return trimTrailingSlash(configured)
  }

  return trimTrailingSlash(getRequestOrigin(event))
}

const getOAuthCallbackUrl = (event: H3Event, publicHost: unknown) =>
  `${getCmsOrigin(event, publicHost)}/admin/auth/callback`

const authResultPage = (type: 'success' | 'error', data: Record<string, string>, targetOrigin: string) => {
  const provider = 'github'

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>CMS Authorization</title>
  </head>
  <body>
    <script>
      (function () {
        var data = ${JSON.stringify(data)};
        var targetOrigin = ${JSON.stringify(targetOrigin)};
        var message = 'authorization:${provider}:${type}:' + JSON.stringify(data);

        if (window.opener) {
          window.opener.postMessage(message, targetOrigin);
          window.close();
        } else {
          document.body.textContent = ${JSON.stringify(type === 'success'
            ? 'Authentication complete. You can close this window.'
            : 'Authentication failed.')};
        }
      })();
    </script>
  </body>
</html>`
}

export default defineEventHandler(async (event) => {
  const runtimeConfig = useRuntimeConfig(event)
  const targetOrigin = getCmsOrigin(event, runtimeConfig.public.host)

  event.node.res.setHeader('content-type', 'text/html; charset=utf-8')
  event.node.res.setHeader('cache-control', 'no-store')

  if (getCmsAuthMode(event) !== 'github-oauth') {
    event.node.res.statusCode = 404
    return authResultPage('error', { message: 'GitHub OAuth is not enabled.' }, targetOrigin)
  }

  const config = getCmsGitHubOAuthConfig(event)
  assertCmsGitHubOAuthConfigured(config)

  const query = getQuery(event)
  const error = firstQueryValue(query.error)
  if (error) {
    event.node.res.statusCode = 400
    return authResultPage(
      'error',
      { message: firstQueryValue(query.error_description) || error },
      targetOrigin,
    )
  }

  const code = firstQueryValue(query.code)
  const state = firstQueryValue(query.state)
  const expectedState = getCookie(event, 'blog_cms_oauth_state') || ''
  deleteCookie(event, 'blog_cms_oauth_state', { path: '/admin/auth' })

  if (!code || !state || !expectedState || !constantTimeEquals(state, expectedState)) {
    event.node.res.statusCode = 400
    return authResultPage('error', { message: 'Invalid GitHub OAuth state.' }, targetOrigin)
  }

  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'user-agent': 'juryquinn-blog-cms',
    },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: getOAuthCallbackUrl(event, runtimeConfig.public.host),
    }),
  })
  const tokenResponse = await response.json() as GitHubTokenResponse

  if (!response.ok || tokenResponse.error || !tokenResponse.access_token) {
    event.node.res.statusCode = response.ok ? 400 : response.status
    return authResultPage(
      'error',
      { message: tokenResponse.error_description || tokenResponse.error || 'GitHub OAuth token exchange failed.' },
      targetOrigin,
    )
  }

  return authResultPage('success', { token: tokenResponse.access_token }, targetOrigin)
})
