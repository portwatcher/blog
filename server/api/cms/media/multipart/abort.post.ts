import {
  abortMultipartUpload,
  assertCmsUploadAuthorized,
} from '../../../../utils/s3-media'

export default defineEventHandler(async (event) => {
  assertCmsUploadAuthorized(event)

  const body = await readBody<{
    key?: string
    uploadId?: string
  }>(event)

  return abortMultipartUpload({
    key: String(body.key || ''),
    uploadId: String(body.uploadId || ''),
  })
})
