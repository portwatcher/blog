const yamlString = (value: unknown) => JSON.stringify(String(value ?? ''))

const yamlBoolean = (value: unknown) => value === true || value === 'true' || value === '1'

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '')

const getRequestOrigin = (event: any) => {
  const host = getHeader(event, 'x-forwarded-host') || getHeader(event, 'host') || 'localhost:3000'
  const isLocalHost = host.includes('localhost') || host.startsWith('127.') || host.startsWith('[::1]')
  const protocol = isLocalHost
    ? 'http'
    : getHeader(event, 'x-forwarded-proto') || 'https'

  return `${protocol}://${host}`
}

const getCmsOrigin = (event: any, publicHost: unknown) => {
  const configured = typeof publicHost === 'string' ? publicHost : ''

  if (configured && !configured.includes('localhost')) {
    return trimTrailingSlash(configured)
  }

  return trimTrailingSlash(getRequestOrigin(event))
}

export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event)
  const publicConfig = config.public
  const backendName = String(publicConfig.cmsBackendName || 'github')
  const cmsOrigin = getCmsOrigin(event, publicConfig.host)
  const lines: string[] = []

  event.node.res.setHeader('content-type', 'text/yaml; charset=utf-8')

  lines.push('backend:')
  lines.push(`  name: ${yamlString(backendName)}`)

  if (publicConfig.cmsContentRepo) {
    lines.push(`  repo: ${yamlString(publicConfig.cmsContentRepo)}`)
  }
  if (publicConfig.cmsContentBranch) {
    lines.push(`  branch: ${yamlString(publicConfig.cmsContentBranch)}`)
  }
  if (backendName === 'github') {
    lines.push(`  base_url: ${yamlString(publicConfig.cmsBaseUrl || cmsOrigin)}`)
    lines.push(`  auth_endpoint: ${yamlString(publicConfig.cmsAuthEndpoint || 'admin/auth')}`)
    lines.push(`  api_root: ${yamlString(publicConfig.cmsApiRoot || `${cmsOrigin}/admin/github-api`)}`)
  } else if (publicConfig.cmsBaseUrl) {
    lines.push(`  base_url: ${yamlString(publicConfig.cmsBaseUrl)}`)
  }
  if (backendName !== 'github' && publicConfig.cmsAuthEndpoint) {
    lines.push(`  auth_endpoint: ${yamlString(publicConfig.cmsAuthEndpoint)}`)
  }

  if (yamlBoolean(publicConfig.cmsLocalBackend)) {
    lines.push('local_backend: true')
  }

  lines.push('media_folder: "_decap-unused-media"')
  lines.push('public_folder: "/_decap-unused-media"')
  lines.push('collections:')
  lines.push('  - name: "categories"')
  lines.push('    label: "Categories"')
  lines.push('    label_singular: "Category"')
  lines.push('    folder: "categories"')
  lines.push('    create: true')
  lines.push('    identifier_field: "slug"')
  lines.push('    slug: "{{slug}}"')
  lines.push('    summary: "{{title}} ({{slug}})"')
  lines.push('    fields:')
  lines.push('      - { label: "Title", name: "title", widget: "string" }')
  lines.push('      - { label: "Slug", name: "slug", widget: "string", hint: "Folder and URL segment used by posts, e.g. Technology or personal-notes.", pattern: ["^[^/]+$", "Category slug cannot contain slashes."] }')
  lines.push('      - { label: "Description", name: "description", widget: "text", required: false }')
  lines.push('  - name: "posts"')
  lines.push('    label: "Posts"')
  lines.push('    folder: "posts"')
  lines.push('    path: "{{category}}/{{year}}-{{month}}-{{day}}-{{slug}}"')
  lines.push('    create: true')
  lines.push('    slug: "{{year}}-{{month}}-{{day}}-{{slug}}"')
  lines.push('    summary: "{{title}} - {{date}}"')
  lines.push('    fields:')
  lines.push('      - { label: "Title", name: "title", widget: "string" }')
  lines.push('      - { label: "Description", name: "description", widget: "text", required: false }')
  lines.push('      - { label: "Category", name: "category", widget: "relation", collection: "categories", search_fields: ["title", "slug"], display_fields: ["title"], value_field: "slug", default: "Thoughts", options_length: 100 }')
  lines.push('      - { label: "Date", name: "date", widget: "datetime", format: "YYYY-MM-DD HH:mm", date_format: "YYYY-MM-DD", time_format: "HH:mm" }')
  lines.push('      - { label: "Status", name: "status", widget: "select", options: ["public", "private"], default: "public" }')
  lines.push('      - { label: "Legacy path", name: "legacyPath", widget: "hidden", required: false }')
  lines.push('      - { label: "Cover image", name: "cover", widget: "s3-image", required: false }')
  lines.push('      - { label: "Featured video", name: "video", widget: "s3-video", required: false }')
  lines.push('      - { label: "Body", name: "body", widget: "markdown" }')

  return lines.join('\n')
})
