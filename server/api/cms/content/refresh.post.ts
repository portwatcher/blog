import { assertCmsAdminAuthorized, getCmsGitHubProxyConfig } from '../../../utils/cms-github'
import { getRuntimeContentStatus, refreshRuntimeContent } from '../../../utils/runtime-content'

export default defineEventHandler(async (event) => {
  assertCmsAdminAuthorized(event, getCmsGitHubProxyConfig(event))

  const content = await refreshRuntimeContent(event)
  const status = getRuntimeContentStatus(event)

  return {
    ok: true,
    articles: content.articles.length,
    translations: content.translations.length,
    refreshedAt: status.refreshedAt ? new Date(status.refreshedAt).toISOString() : undefined,
  }
})
