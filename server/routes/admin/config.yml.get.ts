const yamlString = (value: unknown) => JSON.stringify(String(value ?? ''))

const yamlBoolean = (value: unknown) => value === true || value === 'true' || value === '1'

export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event)
  const publicConfig = config.public
  const lines: string[] = []

  event.node.res.setHeader('content-type', 'text/yaml; charset=utf-8')

  lines.push('backend:')
  lines.push(`  name: ${yamlString(publicConfig.cmsBackendName || 'github')}`)

  if (publicConfig.cmsContentRepo) {
    lines.push(`  repo: ${yamlString(publicConfig.cmsContentRepo)}`)
  }
  if (publicConfig.cmsContentBranch) {
    lines.push(`  branch: ${yamlString(publicConfig.cmsContentBranch)}`)
  }
  if (publicConfig.cmsBaseUrl) {
    lines.push(`  base_url: ${yamlString(publicConfig.cmsBaseUrl)}`)
  }
  if (publicConfig.cmsAuthEndpoint) {
    lines.push(`  auth_endpoint: ${yamlString(publicConfig.cmsAuthEndpoint)}`)
  }

  if (yamlBoolean(publicConfig.cmsLocalBackend)) {
    lines.push('local_backend: true')
  }

  lines.push('media_folder: "_decap-unused-media"')
  lines.push('public_folder: "/_decap-unused-media"')
  lines.push('collections:')
  lines.push('  - name: "posts"')
  lines.push('    label: "Posts"')
  lines.push('    folder: "posts"')
  lines.push('    create: true')
  lines.push('    slug: "{{year}}-{{month}}-{{day}}-{{slug}}"')
  lines.push('    summary: "{{title}} - {{date}}"')
  lines.push('    fields:')
  lines.push('      - { label: "Title", name: "title", widget: "string" }')
  lines.push('      - { label: "Description", name: "description", widget: "text", required: false }')
  lines.push('      - { label: "Category", name: "category", widget: "string", required: false }')
  lines.push('      - { label: "Date", name: "date", widget: "datetime", format: "YYYY-MM-DD HH:mm", date_format: "YYYY-MM-DD", time_format: "HH:mm" }')
  lines.push('      - { label: "Status", name: "status", widget: "select", options: ["public", "private"], default: "public" }')
  lines.push('      - { label: "Cover image", name: "cover", widget: "s3-image", required: false }')
  lines.push('      - { label: "Featured video", name: "video", widget: "s3-video", required: false }')
  lines.push('      - { label: "Body", name: "body", widget: "markdown" }')

  return lines.join('\n')
})
