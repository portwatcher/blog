import { getHeader, sendRedirect, setCookie, type H3Event } from 'h3'
import { randomBytes } from 'node:crypto'
import {
  assertCmsGitHubOAuthConfigured,
  assertCmsGitHubProxyConfigured,
  getCmsAuthMode,
  getCmsGitHubOAuthConfig,
  getCmsGitHubProxyConfig,
} from '../../utils/cms-github'

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '')

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

export default defineEventHandler(async (event) => {
  if (getCmsAuthMode(event) === 'github-oauth') {
    const runtimeConfig = useRuntimeConfig(event)
    const config = getCmsGitHubOAuthConfig(event)
    assertCmsGitHubOAuthConfigured(config)

    const state = randomBytes(32).toString('hex')
    const redirectUri = getOAuthCallbackUrl(event, runtimeConfig.public.host)
    const authorizeUrl = new URL('https://github.com/login/oauth/authorize')

    authorizeUrl.searchParams.set('client_id', config.clientId || '')
    authorizeUrl.searchParams.set('redirect_uri', redirectUri)
    authorizeUrl.searchParams.set('scope', config.scope)
    authorizeUrl.searchParams.set('state', state)

    setCookie(event, 'blog_cms_oauth_state', state, {
      httpOnly: true,
      maxAge: 10 * 60,
      sameSite: 'lax',
      secure: redirectUri.startsWith('https://'),
      path: '/admin/auth',
    })

    return sendRedirect(event, authorizeUrl.toString(), 302)
  }

  const config = getCmsGitHubProxyConfig(event)
  assertCmsGitHubProxyConfigured(config)

  event.node.res.setHeader('content-type', 'text/html; charset=utf-8')
  event.node.res.setHeader('cache-control', 'no-store')

  const tokenRequired = Boolean(config.adminToken)

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>CMS Authorization</title>
  </head>
  <body>
    <script>
      (function () {
        var params = new URLSearchParams(window.location.search);
        var provider = params.get('provider') || 'github';
        var targetOrigin = window.location.origin;
        var authorizingMessage = 'authorizing:' + provider;
        var completed = false;

        function post(type, data) {
          if (!window.opener || completed) return;
          completed = true;
          window.opener.postMessage(
            'authorization:' + provider + ':' + type + ':' + JSON.stringify(data),
            targetOrigin
          );
        }

        async function validateToken(token) {
          if (!${tokenRequired ? 'true' : 'false'}) return true;

          var response = await fetch('/admin/github-api/user', {
            cache: 'no-store',
            headers: {
              authorization: 'token ' + token
            }
          });

          return response.ok;
        }

        async function requestToken() {
          var token = ${tokenRequired ? 'window.prompt("CMS admin token")' : '"local-dev"'};
          if (!token) {
            post('error', { message: 'CMS admin token required' });
            window.close();
            return;
          }

          try {
            if (!(await validateToken(token))) {
              window.alert('Invalid CMS admin token.');
              requestToken();
              return;
            }
          } catch (error) {
            window.alert('Could not validate the CMS admin token.');
            requestToken();
            return;
          }

          post('success', { token: token });
          window.close();
        }

        window.addEventListener('message', function (event) {
          if (event.origin !== targetOrigin || event.data !== authorizingMessage) return;

          requestToken();
        });

        if (!window.opener) {
          document.body.textContent = 'This authorization page must be opened from Decap CMS.';
          return;
        }

        window.opener.postMessage(authorizingMessage, targetOrigin);

        window.setTimeout(function () {
          post('error', { message: 'CMS authorization timed out' });
          window.close();
        }, 30000);
      })();
    </script>
  </body>
</html>`
})
