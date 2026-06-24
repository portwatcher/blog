import { getAdminCmsConfig } from '../../utils/admin-cms-config'

export default defineEventHandler((event) => {
  event.node.res.setHeader('content-type', 'text/yaml; charset=utf-8')

  return `${JSON.stringify(getAdminCmsConfig(event), null, 2)}\n`
})
