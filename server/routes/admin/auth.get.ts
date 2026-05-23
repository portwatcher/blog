import { getCmsGitHubProxyConfig, assertCmsGitHubProxyConfigured } from '../../utils/cms-github'

export default defineEventHandler((event) => {
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
