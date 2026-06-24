import { readdir, stat } from 'node:fs/promises'
import { basename, extname, join, relative, sep } from 'node:path'
import { HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { getRuntimeContent } from '../../../utils/runtime-content'
import {
  assertCmsMediaLibraryAuthorized,
  createS3Client,
  getPublicMediaUrl,
  getSignedMediaReadUrl,
  getS3MediaConfig,
} from '../../../utils/s3-media'

type MediaKind = 'image' | 'video' | 'file'

interface CmsMediaAsset {
  id: string
  name: string
  path: string
  url: string
  previewUrl?: string
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

const stripManagedUploadPrefix = (value: string) =>
  value.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-(.+)$/i, '$1')

const getMetadataValue = (metadata: Record<string, string> | undefined, names: string[]) => {
  if (!metadata) return ''

  for (const name of names) {
    const value = metadata[name] || metadata[name.toLowerCase()]
    if (value) return value
  }

  const lowerNames = new Set(names.map((name) => name.toLowerCase()))
  const entry = Object.entries(metadata).find(([key]) => lowerNames.has(key.toLowerCase()))
  return entry?.[1] || ''
}

const getOriginalFilename = (metadata: Record<string, string> | undefined) => {
  const filename = getMetadataValue(metadata, ['originalFilename', 'original-filename', 'filename']).trim()
  return filename ? basenameFromPath(filename) : ''
}

const getManagedAssetName = (key: string, metadata: Record<string, string> | undefined) =>
  getOriginalFilename(metadata) || stripManagedUploadPrefix(basenameFromPath(key))

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

  assets.set(id, {
    ...existing,
    url: existing.url || asset.url,
    path: existing.path || asset.path,
    previewUrl: existing.previewUrl || asset.previewUrl,
    contentType: existing.contentType || asset.contentType,
    size: existing.size ?? asset.size,
    source: !existing.postTitle && asset.postTitle ? asset.source : existing.source,
    postTitle: existing.postTitle || asset.postTitle,
    postPath: existing.postPath || asset.postPath,
  })
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

const getManagedS3Prefix = (mediaConfig: ReturnType<typeof getS3MediaConfig>) => {
  const prefix = mediaConfig.keyPrefix.replace(/^\/+|\/+$/g, '')

  return prefix ? `${prefix}/` : ''
}

const createS3PreviewUrl = async (
  key: string,
  mediaConfig: ReturnType<typeof getS3MediaConfig>,
  publicUrl: string,
) => {
  try {
    return await getSignedMediaReadUrl(key, mediaConfig)
  } catch (_error) {
    return publicUrl
  }
}

const mapWithConcurrency = async <Input, Output>(
  values: Input[],
  concurrency: number,
  mapper: (value: Input) => Promise<Output>,
) => {
  const results = new Array<Output>(values.length)
  let nextIndex = 0

  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await mapper(values[index])
    }
  })

  await Promise.all(workers)
  return results
}

const getS3ObjectHead = async (
  client: ReturnType<typeof createS3Client>,
  bucket: string,
  key: string,
) => {
  try {
    return await client.send(new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
    }))
  } catch (_error) {
    return null
  }
}

const addManagedS3Assets = async (
  assets: Map<string, CmsMediaAsset>,
  mediaConfig: ReturnType<typeof getS3MediaConfig>,
) => {
  if (!mediaConfig.bucket) return

  const client = createS3Client(mediaConfig)
  const prefix = getManagedS3Prefix(mediaConfig)
  let continuationToken: string | undefined

  do {
    const response = await client.send(new ListObjectsV2Command({
      Bucket: mediaConfig.bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken,
      MaxKeys: 1000,
    }))

    const pageAssets = await mapWithConcurrency(response.Contents || [], 12, async (object) => {
      const key = String(object.Key || '')
      if (!key || key.endsWith('/')) return null

      const head = await getS3ObjectHead(client, mediaConfig.bucket, key)
      const name = getManagedAssetName(key, head?.Metadata)
      const contentType = String(head?.ContentType || '') || getContentTypeFromName(key)
      const kind = getKindFromAsset({ contentType, name, key }, getKindFromName(key))
      if (kind === 'file') return null

      const publicUrl = getPublicMediaUrl(key, mediaConfig)
      const previewUrl = await createS3PreviewUrl(key, mediaConfig, publicUrl)

      return {
        id: `s3:${key}`,
        name,
        path: key,
        url: publicUrl,
        previewUrl,
        key,
        kind,
        contentType,
        size: typeof object.Size === 'number' ? object.Size : undefined,
        source: 'S3 bucket',
      } satisfies Omit<CmsMediaAsset, 'id'> & { id: string }
    })

    for (const asset of pageAssets) {
      if (asset) addAsset(assets, asset)
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined
  } while (continuationToken)
}

export default defineEventHandler(async (event) => {
  event.node.res.setHeader('cache-control', 'no-store')
  event.node.res.setHeader('pragma', 'no-cache')
  event.node.res.setHeader('expires', '0')

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

  await addManagedS3Assets(assets, mediaConfig)
  await addStaticPublicAssets(assets)

  const exactFilenameSearch = !!search && /^[^/\\]+\.[a-z0-9]{1,12}$/i.test(search)
  const assetSearchValues = (asset: CmsMediaAsset) => [
    asset.name,
    stripManagedUploadPrefix(basenameFromPath(asset.key || '')),
    asset.path,
    asset.url,
    asset.key,
    asset.source,
    asset.postTitle,
  ].map((value) => String(value || '').toLowerCase()).filter(Boolean)

  const matchesSearch = (asset: CmsMediaAsset) => {
    if (!search) return true

    const values = assetSearchValues(asset)
    if (!exactFilenameSearch) {
      return values.some((value) => value.includes(search))
    }

    return values.some((value) => {
      const basename = stripManagedUploadPrefix(basenameFromPath(value))
      return value === search || basename === search || value.endsWith(`/${search}`)
    })
  }

  const searchRank = (asset: CmsMediaAsset) => {
    if (!search) return 0

    const name = String(asset.name || '').toLowerCase()
    const values = assetSearchValues(asset)
    if (name === search) return 0
    if (stripManagedUploadPrefix(basenameFromPath(asset.key || '').toLowerCase()) === search) return 1
    if (name.startsWith(search)) return 2
    if (values.some((value) => value.includes(search))) return 3
    return 4
  }

  const filteredAssets = Array.from(assets.values())
    .filter((asset) => !kind || asset.kind === kind)
    .filter(matchesSearch)
    .sort((left, right) =>
      searchRank(left) - searchRank(right) ||
      String(left.postTitle || left.source || '').localeCompare(String(right.postTitle || right.source || '')) ||
      left.name.localeCompare(right.name)
    )

  return {
    assets: filteredAssets,
  }
})
