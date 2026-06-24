import { getHeader, type H3Event } from 'h3'
import { useRuntimeConfig } from '#imports'
import { getCmsAuthMode } from './cms-github'

const yamlBoolean = (value: unknown) => value === true || value === 'true' || value === '1'

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

export const getAdminCmsConfig = (event: H3Event) => {
  const config = useRuntimeConfig(event)
  const publicConfig = config.public
  const backendName = String(publicConfig.cmsBackendName || 'github')
  const cmsAuthMode = getCmsAuthMode(event)
  const cmsOrigin = getCmsOrigin(event, publicConfig.host)
  const backend: Record<string, unknown> = {
    name: backendName,
  }

  if (publicConfig.cmsContentRepo) {
    backend.repo = String(publicConfig.cmsContentRepo)
  }
  if (publicConfig.cmsContentBranch) {
    backend.branch = String(publicConfig.cmsContentBranch)
  }
  if (backendName === 'github') {
    backend.base_url = String(publicConfig.cmsBaseUrl || cmsOrigin)
    backend.auth_endpoint = String(publicConfig.cmsAuthEndpoint || 'admin/auth')
    if (publicConfig.cmsApiRoot || cmsAuthMode !== 'github-oauth') {
      backend.api_root = String(publicConfig.cmsApiRoot || `${cmsOrigin}/admin/github-api`)
    }
  } else if (publicConfig.cmsBaseUrl) {
    backend.base_url = String(publicConfig.cmsBaseUrl)
  }
  if (backendName !== 'github' && publicConfig.cmsAuthEndpoint) {
    backend.auth_endpoint = String(publicConfig.cmsAuthEndpoint)
  }

  const cmsConfig: Record<string, unknown> = {
    load_config_file: false,
    backend,
    media_folder: '_decap-unused-media',
    public_folder: '/_decap-unused-media',
    media_library: {
      name: 'blog-media-assets',
    },
    collections: [
      {
        name: 'categories',
        label: 'Categories',
        label_singular: 'Category',
        folder: 'categories',
        create: true,
        identifier_field: 'slug',
        slug: '{{slug}}',
        summary: '{{title}} ({{slug}})',
        fields: [
          { label: 'Title', name: 'title', widget: 'string' },
          {
            label: 'Slug',
            name: 'slug',
            widget: 'string',
            hint: 'Folder and URL segment used by posts, e.g. Technology or personal-notes.',
            pattern: ['^[^/]+$', 'Category slug cannot contain slashes.'],
          },
          { label: 'Description', name: 'description', widget: 'text', required: false },
        ],
      },
      {
        name: 'posts',
        label: 'Posts',
        folder: 'posts',
        path: '{{category}}/{{year}}-{{month}}-{{day}}-{{slug}}',
        create: true,
        slug: '{{year}}-{{month}}-{{day}}-{{slug}}',
        summary: '{{title}} - {{date}}',
        fields: [
          { label: 'Title', name: 'title', widget: 'string' },
          { label: 'Description', name: 'description', widget: 'text', required: false },
          {
            label: 'Category',
            name: 'category',
            widget: 'relation',
            collection: 'categories',
            search_fields: ['title', 'slug'],
            display_fields: ['title'],
            value_field: 'slug',
            default: 'Thoughts',
            options_length: 100,
          },
          {
            label: 'Date',
            name: 'date',
            widget: 'datetime',
            format: 'YYYY-MM-DD HH:mm',
            date_format: 'YYYY-MM-DD',
            time_format: 'HH:mm',
          },
          {
            label: 'Status',
            name: 'status',
            widget: 'select',
            default: 'draft',
            hint: 'Drafts stay hidden from the public site. Use Private for password-protected posts, and Public when ready to publish.',
            options: [
              { label: 'Draft', value: 'draft' },
              { label: 'Public', value: 'public' },
              { label: 'Private', value: 'private' },
            ],
          },
          { label: 'Legacy path', name: 'legacyPath', widget: 'hidden', required: false },
          {
            label: 'Cover image',
            name: 'cover',
            widget: 's3-image',
            required: false,
            hint: 'Upload an image here to store it in S3 and save a structured media reference in frontmatter.',
          },
          {
            label: 'Featured video',
            name: 'video',
            widget: 's3-video',
            required: false,
            hint: 'Upload a video here to store it in S3 and save a structured media reference in frontmatter.',
          },
          {
            label: 'Body',
            name: 'body',
            widget: 'markdown',
            hint: 'Rich text: Add Component -> S3 Image or S3 Video. Markdown mode: paste or drop an image/video to upload and insert it.',
          },
        ],
      },
    ],
  }

  if (yamlBoolean(publicConfig.cmsLocalBackend)) {
    cmsConfig.local_backend = true
  }

  return cmsConfig
}
