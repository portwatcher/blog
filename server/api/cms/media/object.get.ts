import { GetObjectCommand } from '@aws-sdk/client-s3'
import { createError, getHeader, getQuery, sendStream } from 'h3'
import {
  assertManagedMediaKey,
  assertS3MediaConfigured,
  createS3Client,
  getS3MediaConfig,
} from '../../../utils/s3-media'

const validRangeHeader = (value: string) =>
  /^bytes=(?:\d+-\d*|\d*-\d+)$/.test(value)

export default defineEventHandler(async (event) => {
  const key = String(getQuery(event).key || '').trim()
  const config = getS3MediaConfig(event)
  const range = String(getHeader(event, 'range') || '').trim()

  if (!key) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Media object key is required',
    })
  }

  assertS3MediaConfigured(config)
  assertManagedMediaKey(key, config)

  try {
    const requestRange = validRangeHeader(range) ? range : undefined
    const response = await createS3Client(config).send(new GetObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Range: requestRange,
    }))

    if (!response.Body) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Media object not found',
      })
    }

    event.node.res.setHeader('content-type', response.ContentType || 'application/octet-stream')
    event.node.res.setHeader('cache-control', 'public, max-age=31536000, immutable')
    event.node.res.setHeader('accept-ranges', 'bytes')

    if (typeof response.ContentLength === 'number') {
      event.node.res.setHeader('content-length', String(response.ContentLength))
    }
    if (response.ContentRange) {
      event.node.res.statusCode = 206
      event.node.res.setHeader('content-range', response.ContentRange)
    }
    if (response.ETag) {
      event.node.res.setHeader('etag', response.ETag)
    }
    if (response.LastModified) {
      event.node.res.setHeader('last-modified', response.LastModified.toUTCString())
    }

    return sendStream(event, response.Body as NodeJS.ReadableStream)
  } catch (error: any) {
    if (error?.statusCode) throw error

    throw createError({
      statusCode: error?.$metadata?.httpStatusCode === 404 || error?.name === 'NoSuchKey' ? 404 : 502,
      statusMessage: error?.$metadata?.httpStatusCode === 404 || error?.name === 'NoSuchKey'
        ? 'Media object not found'
        : 'Could not read media object',
    })
  }
})
