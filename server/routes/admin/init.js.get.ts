import { getAdminCmsConfig } from '../../utils/admin-cms-config'

export default defineEventHandler((event) => {
  event.node.res.setHeader('content-type', 'application/javascript; charset=utf-8')
  event.node.res.setHeader('cache-control', 'no-store')

  return [
    `window.BLOG_CMS_CONFIG = ${JSON.stringify(getAdminCmsConfig(event))};`,
    'if (window.CMS && typeof window.CMS.init === "function") {',
    '  window.CMS.init({ config: window.BLOG_CMS_CONFIG });',
    '} else {',
    '  console.error("Decap CMS was not available for manual initialization.");',
    '}',
  ].join('\n')
})
