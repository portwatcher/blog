import {
  assertCmsUploadAuthorized,
  createMultipartUpload,
} from '../../../../utils/s3-media'

export default defineEventHandler(async (event) => {
  await assertCmsUploadAuthorized(event)

  const body = await readBody<{
    filename?: string
    contentType?: string
    size?: number
  }>(event)

  return createMultipartUpload({
    filename: String(body.filename || ''),
    contentType: String(body.contentType || ''),
    size: Number(body.size),
  })
})
