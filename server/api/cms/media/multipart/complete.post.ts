import {
  assertCmsUploadAuthorized,
  completeMultipartUpload,
} from '../../../../utils/s3-media'

export default defineEventHandler(async (event) => {
  assertCmsUploadAuthorized(event)

  const body = await readBody<{
    key?: string
    uploadId?: string
    parts?: Array<{
      ETag?: string
      PartNumber?: number
    }>
  }>(event)

  return completeMultipartUpload({
    key: String(body.key || ''),
    uploadId: String(body.uploadId || ''),
    parts: body.parts || [],
  })
})
