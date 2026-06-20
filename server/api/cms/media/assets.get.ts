import { readdir, stat } from 'node:fs/promises'
import { basename, extname, join, relative, sep } from 'node:path'
import { getRuntimeContent } from '../../../utils/runtime-content'
import {
  assertCmsMediaLibraryAuthorized,
  getPublicMediaUrl,
  getS3MediaConfig,
} from '../../../utils/s3-media'

type MediaKind = 'image' | 'video' | 'file'

interface CmsMediaAsset {
  id: string
  name: string
  path: string
  url: string
  key?: string
  kind: MediaKind
  contentType?: string
  size?: number
  source: string
  postTitle?: string
  postPath?: string
}

const imageExtensions = new Set([
  '.avif',
  '.bmp',
  '.gif',
  '.jpg',
  '.jpeg',
  '.png',
  '.svg',
  '.tif',
  '.tiff',
  '.webp',
])

const videoExtensions = new Set([
  '.m4v',
  '.mov',
  '.mp4',
  '.mpeg',
  '.mpg',
  '.ogg',
  '.ogv',
  '.webm',
])

const contentTypes: Record<string, string> = {
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.mov': 'video/quicktime',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
}

const isRecord = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const normalizePath = (value: string) => value.split(sep).join('/')

const getKindFromName = (value: unknown): MediaKind => {
  const extension = extname(String(value || '').split(/[?#]/)[0]).toLowerCase()
  if (imageExtensions.has(extension)) return 'image'
  if (videoExtensions.has(extension)) return 'video'
  return 'file'
}

const getKindFromAsset = (value: Record<string, any>, fallback: MediaKind = 'file'): MediaKind => {
  const contentType = String(value.contentType || value.type || '')
  if (contentType.startsWith('image/')) return 'image'
  if (contentType.startsWith('video/')) return 'video'

  const fromName = getKindFromName(value.filename || value.name || value.key || value.path || value.url)
  return fromName === 'file' ? fallback : fromName
}

const getContentTypeFromName = (value: string) =>
  contentTypes[extname(value.split(/[?#]/)[0]).toLowerCase()] || undefined

const basenameFromPath = (value: string) => {
  const clean = value.split(/[?#]/)[0]
  const name = basename(clean)

  try {
    return decodeURIComponent(name)
  } catch (_error) {
    return name
  }
}

const isSkippableUrl = (value: string) =>
  !value ||
  value.startsWith('#') ||
  value.startsWith('data:') ||
  value.startsWith('mailto:') ||
  value.startsWith('tel:')

const normalizeMediaUrl = (value: string) => {
  if (value.startsWith('~/')) return `/content_imgs/${value.slice(2)}`
  return value
}

const addAsset = (assets: Map<string, CmsMediaAsset>, asset: Omit<CmsMediaAsset, 'id'> & { id?: string }) => {
  const id = asset.id || (asset.key ? `s3:${asset.key}` : `url:${asset.url || asset.path}`)
  const existing = assets.get(id)

  if (!existing) {
    assets.set(id, { ...asset, id })
    return
  }

  if (!existing.postTitle && asset.postTitle) {
    assets.set(id, { ...existing, source: asset.source, postTitle: asset.postTitle, postPath: asset.postPath })
  }
}

const addUrlAsset = (
  assets: Map<string, CmsMediaAsset>,
  rawUrl: unknown,
  context: { source: string, postTitle?: string, postPath?: string },
) => {
  const url = normalizeMediaUrl(String(rawUrl || '').trim())
  if (isSkippableUrl(url)) return

  const kind = getKindFromName(url)
  if (kind === 'file') return

  addAsset(assets, {
    name: basenameFromPath(url),
    path: url,
    url,
    kind,
    contentType: getContentTypeFromName(url),
    source: context.source,
    postTitle: context.postTitle,
    postPath: context.postPath,
  })
}

const addS3Asset = (
  assets: Map<string, CmsMediaAsset>,
  rawAsset: unknown,
  context: { source: string, postTitle?: string, postPath?: string },
  mediaConfig: ReturnType<typeof getS3MediaConfig>,
  fallbackKind: MediaKind,
) => {
  if (!isRecord(rawAsset)) return

  const key = String(rawAsset.key || rawAsset.objectKey || '').trim()
  if (!key) return

  const url = getPublicMediaUrl(key, mediaConfig) || String(rawAsset.url || rawAsset.publicUrl || key)
  const kind = getKindFromAsset(rawAsset, fallbackKind)

  addAsset(assets, {
    id: `s3:${key}`,
    name: String(rawAsset.filename || rawAsset.name || basenameFromPath(key)),
    path: url,
    url,
    key,
    kind,
    contentType: String(rawAsset.contentType || '') || getContentTypeFromName(key),
    size: typeof rawAsset.size === 'number' ? rawAsset.size : undefined,
    source: context.source,
    postTitle: context.postTitle,
    postPath: context.postPath,
  })
}

const collectNodeAssets = (
  assets: Map<string, CmsMediaAsset>,
  node: unknown,
  context: { source: string, postTitle?: string, postPath?: string },
  mediaConfig: ReturnType<typeof getS3MediaConfig>,
) => {
  if (!node) return

  if (Array.isArray(node)) {
    const tag = typeof node[0] === 'string' ? node[0].toLowerCase() : ''
    const props = isRecord(node[1]) ? node[1] : {}
    collectTaggedAsset(assets, tag, props, context, mediaConfig)

    for (const child of node.slice(isRecord(node[1]) ? 2 : 1)) {
      collectNodeAssets(assets, child, context, mediaConfig)
    }
    return
  }

  if (!isRecord(node)) return

  const tag = String(node.tag || node.name || node.component || '').toLowerCase()
  const props = isRecord(node.props)
    ? node.props
    : isRecord(node.attributes)
      ? node.attributes
      : isRecord(node.properties)
        ? node.properties
        : {}

  collectTaggedAsset(assets, tag, props, context, mediaConfig)

  if (Array.isArray(node.children)) {
    for (const child of node.children) collectNodeAssets(assets, child, context, mediaConfig)
  }
  if (Array.isArray(node.value)) {
    for (const child of node.value) collectNodeAssets(assets, child, context, mediaConfig)
  }
}

const collectTaggedAsset = (
  assets: Map<string, CmsMediaAsset>,
  tag: string,
  props: Record<string, any>,
  context: { source: string, postTitle?: string, postPath?: string },
  mediaConfig: ReturnType<typeof getS3MediaConfig>,
) => {
  const normalizedTag = tag.replace(/[^a-z0-9]/g, '')

  if (normalizedTag === 's3image') {
    addS3Asset(assets, { ...props, key: props.objectKey || props.key }, context, mediaConfig, 'image')
    return
  }

  if (normalizedTag === 's3video') {
    addS3Asset(assets, { ...props, key: props.objectKey || props.key }, context, mediaConfig, 'video')
    if (props.posterKey) addS3Asset(assets, { key: props.posterKey }, context, mediaConfig, 'image')
    return
  }

  if (normalizedTag === 'img' || normalizedTag === 'image') {
    addUrlAsset(assets, props.src || props.url, context)
  }

  if (normalizedTag === 'video' || normalizedTag === 'source') {
    addUrlAsset(assets, props.src || props.url, context)
    addUrlAsset(assets, props.poster, context)
  }
}

const getPublicRoots = () => {
  const cwd = process.cwd()
  return [
    join(cwd, 'public'),
    join(cwd, '.output', 'public'),
    join(cwd, '..', 'public'),
  ]
}

const addStaticPublicAssets = async (assets: Map<string, CmsMediaAsset>) => {
  const visited = new Set<string>()

  for (const publicRoot of getPublicRoots()) {
    const mediaRoot = join(publicRoot, 'content_imgs')

    try {
      const rootStat = await stat(mediaRoot)
      if (!rootStat.isDirectory()) continue
    } catch (_error) {
      continue
    }

    const realMediaRoot = mediaRoot
    if (visited.has(realMediaRoot)) continue
    visited.add(realMediaRoot)

    const walk = async (directory: string) => {
      const entries = await readdir(directory, { withFileTypes: true })

      for (const entry of entries) {
        const absolutePath = join(directory, entry.name)
        if (entry.isDirectory()) {
          await walk(absolutePath)
          continue
        }
        if (!entry.isFile()) continue

        const kind = getKindFromName(entry.name)
        if (kind === 'file') continue

        const fileStat = await stat(absolutePath)
        const publicPath = `/${normalizePath(relative(publicRoot, absolutePath))}`

        addAsset(assets, {
          id: `static:${publicPath}`,
          name: entry.name,
          path: publicPath,
          url: publicPath,
          kind,
          contentType: getContentTypeFromName(entry.name),
          size: fileStat.size,
          source: 'Static media',
        })
      }
    }

    await walk(mediaRoot)
  }
}

export default defineEventHandler(async (event) => {
  await assertCmsMediaLibraryAuthorized(event)

  const query = getQuery(event)
  const kind = String(query.kind || '').trim().toLowerCase()
  const search = String(query.search || '').trim().toLowerCase()
  const mediaConfig = getS3MediaConfig(event)
  const assets = new Map<string, CmsMediaAsset>()
  const { articles, translations } = await getRuntimeContent(event)

  for (const doc of [...articles, ...translations]) {
    const context = {
      source: 'Post',
      postTitle: String(doc.title || ''),
      postPath: String(doc.path || doc._path || ''),
    }

    addS3Asset(assets, (doc as any).cover, context, mediaConfig, 'image')
    addS3Asset(assets, (doc as any).video, context, mediaConfig, 'video')
    collectNodeAssets(assets, (doc as any).body, context, mediaConfig)
  }

  await addStaticPublicAssets(assets)

  const filteredAssets = Array.from(assets.values())
    .filter((asset) => !kind || asset.kind === kind)
    .filter((asset) => {
      if (!search) return true

      return [
        asset.name,
        asset.path,
        asset.url,
        asset.key,
        asset.source,
        asset.postTitle,
      ].some((value) => String(value || '').toLowerCase().includes(search))
    })
    .sort((left, right) =>
      String(left.postTitle || left.source || '').localeCompare(String(right.postTitle || right.source || '')) ||
      left.name.localeCompare(right.name)
    )

  return {
    assets: filteredAssets,
  }
})
