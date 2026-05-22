export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event)

  event.node.res.setHeader('content-type', 'application/javascript; charset=utf-8')

  return [
    `window.BLOG_CMS_MEDIA_BASE_URL = ${JSON.stringify(config.public.mediaBaseUrl || '')};`,
    `window.BLOG_CMS_UPLOAD_CONFIG_URL = ${JSON.stringify('/api/cms/media/config')};`,
  ].join('\n')
})
