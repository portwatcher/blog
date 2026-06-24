import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  S3Client,
  UploadPartCommand,
  type CompletedPart,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createError, getHeader, type H3Event } from 'h3'
import { randomUUID, timingSafeEqual } from 'node:crypto'
import { useRuntimeConfig } from '#imports'
import { assertCmsGitHubTokenCanWriteContentRepo, getCmsAuthMode } from './cms-github'

const mb = 1024 * 1024
const minMultipartPartSize = 5 * mb

export interface S3MediaConfig {
  bucket: string
  region: string
  endpoint?: string
  accessKeyId?: string
  secretAccessKey?: string
  forcePathStyle: boolean
  keyPrefix: string
  partSize: number
  maxUploadBytes: number
  allowedContentTypes: string[]
  mediaBaseUrl: string
  uploadToken?: string
}

const readString = (runtimeValue: unknown, envNames: string[], fallback = '') => {
  for (const envName of envNames) {
    const value = process.env[envName]
    if (value) return value
  }
  return typeof runtimeValue === 'string' && runtimeValue ? runtimeValue : fallback
}

const readBoolean = (runtimeValue: unknown, envNames: string[], fallback = false) => {
  const value = readString(runtimeValue, envNames)
  if (!value) return fallback
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

const readNumber = (runtimeValue: unknown, envNames: string[], fallback: number) => {
  const value = Number(readString(runtimeValue, envNames))
  return Number.isFinite(value) && value > 0 ? value : fallback
}

export const getS3MediaConfig = (event?: H3Event): S3MediaConfig => {
  const config = useRuntimeConfig(event)

  const partSizeMb = readNumber(
    config.s3MultipartPartSizeMb,
    ['NUXT_S3_MULTIPART_PART_SIZE_MB', 'S3_MULTIPART_PART_SIZE_MB'],
    10
  )
  const maxUploadMb = readNumber(
    config.s3MaxUploadMb,
    ['NUXT_S3_MAX_UPLOAD_MB', 'S3_MAX_UPLOAD_MB'],
    2048
  )
  const allowedContentTypes = readString(
    config.s3AllowedContentTypes,
    ['NUXT_S3_ALLOWED_CONTENT_TYPES', 'S3_ALLOWED_CONTENT_TYPES'],
    'image/,video/'
  )

  return {
    bucket: readString(config.s3Bucket, ['NUXT_S3_BUCKET', 'S3_BUCKET']),
    region: readString(config.s3Region, ['NUXT_S3_REGION', 'AWS_REGION', 'S3_REGION'], 'us-east-1'),
    endpoint: readString(config.s3Endpoint, ['NUXT_S3_ENDPOINT', 'S3_ENDPOINT']) || undefined,
    accessKeyId: readString(config.s3AccessKeyId, ['NUXT_S3_ACCESS_KEY_ID', 'AWS_ACCESS_KEY_ID', 'S3_ACCESS_KEY_ID']) || undefined,
    secretAccessKey: readString(config.s3SecretAccessKey, ['NUXT_S3_SECRET_ACCESS_KEY', 'AWS_SECRET_ACCESS_KEY', 'S3_SECRET_ACCESS_KEY']) || undefined,
    forcePathStyle: readBoolean(config.s3ForcePathStyle, ['NUXT_S3_FORCE_PATH_STYLE', 'S3_FORCE_PATH_STYLE']),
    keyPrefix: readString(config.s3KeyPrefix, ['NUXT_S3_KEY_PREFIX', 'S3_KEY_PREFIX'], 'blog-media'),
    partSize: Math.max(partSizeMb * mb, minMultipartPartSize),
    maxUploadBytes: maxUploadMb * mb,
    allowedContentTypes: allowedContentTypes.split(',').map((item: string) => item.trim()).filter(Boolean),
    mediaBaseUrl: readString(config.public.mediaBaseUrl, ['NUXT_PUBLIC_MEDIA_BASE_URL', 'MEDIA_BASE_URL']),
    uploadToken: readString(config.cmsUploadToken, ['NUXT_CMS_UPLOAD_TOKEN', 'CMS_UPLOAD_TOKEN']) || undefined,
  }
}

const getAuthorizationToken = (event: H3Event) => {
  const authorization = getHeader(event, 'authorization') || ''
  const match = authorization.match(/^(?:token|bearer)\s+(.+)$/i)

  return match?.[1] || ''
}

const assertCmsMediaAuthorized = async (event: H3Event, actionLabel: string) => {
  const config = getS3MediaConfig(event)
  const provided = getHeader(event, 'x-cms-upload-token') || ''
  const githubAuthEnabled = getCmsAuthMode(event) === 'github-oauth'

  if (config.uploadToken) {
    const providedBuffer = Buffer.from(provided)
    const expectedBuffer = Buffer.from(config.uploadToken)

    if (
      providedBuffer.length === expectedBuffer.length &&
      timingSafeEqual(providedBuffer, expectedBuffer)
    ) {
      return
    }
  }

  if (githubAuthEnabled) {
    const githubToken = getAuthorizationToken(event)
    if (githubToken) {
      await assertCmsGitHubTokenCanWriteContentRepo(event, githubToken)
      return
    }
  }

  if (!config.uploadToken && process.env.NODE_ENV !== 'production') {
    return
  }

  throw createError({
    statusCode: config.uploadToken || githubAuthEnabled ? 401 : 500,
    statusMessage: config.uploadToken || githubAuthEnabled
      ? `CMS authorization required for ${actionLabel}`
      : 'CMS_UPLOAD_TOKEN must be set before media uploads are enabled unless GitHub OAuth is enabled',
  })
}

export const assertCmsUploadAuthorized = async (event: H3Event) =>
  assertCmsMediaAuthorized(event, 'media uploads')

export const assertCmsMediaLibraryAuthorized = async (event: H3Event) =>
  assertCmsMediaAuthorized(event, 'the media library')

export const createS3Client = (config = getS3MediaConfig()) => {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: config.accessKeyId && config.secretAccessKey
      ? {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        }
      : undefined,
  })
}

export const assertS3MediaConfigured = (config = getS3MediaConfig()) => {
  if (!config.bucket) {
    throw createError({
      statusCode: 500,
      statusMessage: 'S3_BUCKET is required for CMS media uploads',
    })
  }
}

export const isAllowedContentType = (contentType: string, config = getS3MediaConfig()) => {
  return config.allowedContentTypes.some((allowed) => {
    if (allowed.endsWith('/')) return contentType.startsWith(allowed)
    if (allowed.endsWith('/*')) return contentType.startsWith(allowed.slice(0, -1))
    return contentType === allowed
  })
}

const sanitizeFilename = (filename: string) => {
  const sanitized = filename
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96)

  return sanitized || 'upload'
}

export const createMediaKey = (filename: string, config = getS3MediaConfig()) => {
  const datePath = new Date().toISOString().slice(0, 10).replace(/-/g, '/')
  const prefix = config.keyPrefix.replace(/^\/+|\/+$/g, '')

  return [prefix, datePath, `${randomUUID()}-${sanitizeFilename(filename)}`]
    .filter(Boolean)
    .join('/')
}

export const assertManagedMediaKey = (key: string, config = getS3MediaConfig()) => {
  const prefix = config.keyPrefix.replace(/^\/+|\/+$/g, '')
  const normalizedPrefix = prefix ? `${prefix}/` : ''

  if (!key || key.includes('..') || key.startsWith('/') || !key.startsWith(normalizedPrefix)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid media object key',
    })
  }
}

export const getPublicMediaUrl = (key: string, config = getS3MediaConfig()) => {
  if (!config.mediaBaseUrl) return ''
  return `${config.mediaBaseUrl.replace(/\/+$/, '')}/${key.split('/').map(encodeURIComponent).join('/')}`
}

export const getSignedMediaReadUrl = async (
  key: string,
  config = getS3MediaConfig(),
  expiresIn = 3600
) => {
  assertS3MediaConfigured(config)
  assertManagedMediaKey(key, config)

  return getSignedUrl(createS3Client(config), new GetObjectCommand({
    Bucket: config.bucket,
    Key: key,
  }), { expiresIn })
}

export const createMultipartUpload = async (input: {
  filename: string
  contentType: string
  size: number
}) => {
  const config = getS3MediaConfig()
  assertS3MediaConfigured(config)

  if (!input.filename || !input.contentType || !Number.isFinite(input.size)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'filename, contentType, and size are required',
    })
  }

  if (input.size > config.maxUploadBytes) {
    throw createError({
      statusCode: 413,
      statusMessage: 'File exceeds configured upload size limit',
    })
  }

  if (!isAllowedContentType(input.contentType, config)) {
    throw createError({
      statusCode: 415,
      statusMessage: 'Only configured image and video content types are allowed',
    })
  }

  const key = createMediaKey(input.filename, config)
  const client = createS3Client(config)
  const response = await client.send(new CreateMultipartUploadCommand({
    Bucket: config.bucket,
    Key: key,
    ContentType: input.contentType,
    Metadata: {
      originalFilename: input.filename,
    },
  }))

  if (!response.UploadId) {
    throw createError({
      statusCode: 502,
      statusMessage: 'S3 did not return a multipart upload id',
    })
  }

  return {
    uploadId: response.UploadId,
    key,
    partSize: config.partSize,
    publicUrl: getPublicMediaUrl(key, config),
  }
}

export const signMultipartPart = async (input: {
  key: string
  uploadId: string
  partNumber: number
}) => {
  const config = getS3MediaConfig()
  assertS3MediaConfigured(config)
  assertManagedMediaKey(input.key, config)

  if (!input.uploadId || !Number.isInteger(input.partNumber) || input.partNumber < 1 || input.partNumber > 10000) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Valid uploadId and partNumber are required',
    })
  }

  const command = new UploadPartCommand({
    Bucket: config.bucket,
    Key: input.key,
    UploadId: input.uploadId,
    PartNumber: input.partNumber,
  })

  return {
    url: await getSignedUrl(createS3Client(config), command, { expiresIn: 900 }),
  }
}

export const completeMultipartUpload = async (input: {
  key: string
  uploadId: string
  parts: CompletedPart[]
}) => {
  const config = getS3MediaConfig()
  assertS3MediaConfigured(config)
  assertManagedMediaKey(input.key, config)

  if (!input.uploadId || !Array.isArray(input.parts) || input.parts.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'uploadId and uploaded parts are required',
    })
  }

  const parts = input.parts
    .map((part) => ({
      ETag: part.ETag,
      PartNumber: part.PartNumber,
    }))
    .filter((part) => part.ETag && Number.isInteger(part.PartNumber))
    .sort((a, b) => Number(a.PartNumber) - Number(b.PartNumber))

  if (parts.length !== input.parts.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Each multipart upload part must include ETag and PartNumber',
    })
  }

  const response = await createS3Client(config).send(new CompleteMultipartUploadCommand({
    Bucket: config.bucket,
    Key: input.key,
    UploadId: input.uploadId,
    MultipartUpload: {
      Parts: parts,
    },
  }))

  return {
    key: input.key,
    bucket: config.bucket,
    location: response.Location,
    publicUrl: getPublicMediaUrl(input.key, config),
    previewUrl: await getSignedMediaReadUrl(input.key, config).catch(() => getPublicMediaUrl(input.key, config)),
  }
}

export const abortMultipartUpload = async (input: {
  key: string
  uploadId: string
}) => {
  const config = getS3MediaConfig()
  assertS3MediaConfigured(config)
  assertManagedMediaKey(input.key, config)

  if (!input.uploadId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'uploadId is required',
    })
  }

  await createS3Client(config).send(new AbortMultipartUploadCommand({
    Bucket: config.bucket,
    Key: input.key,
    UploadId: input.uploadId,
  }))

  return {
    key: input.key,
    aborted: true,
  }
}
