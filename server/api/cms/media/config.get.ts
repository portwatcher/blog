import { getS3MediaConfig } from '../../../utils/s3-media'

export default defineEventHandler((event) => {
  const config = getS3MediaConfig(event)

  return {
    mediaBaseUrl: config.mediaBaseUrl,
    tokenRequired: Boolean(config.uploadToken),
    partSize: config.partSize,
    maxUploadBytes: config.maxUploadBytes,
    allowedContentTypes: config.allowedContentTypes,
  }
})
