import {
  assertCmsUploadAuthorized,
  signMultipartPart,
} from '../../../../utils/s3-media'

export default defineEventHandler(async (event) => {
  assertCmsUploadAuthorized(event)

  const body = await readBody<{
    key?: string
    uploadId?: string
    partNumber?: number
  }>(event)

  return signMultipartPart({
    key: String(body.key || ''),
    uploadId: String(body.uploadId || ''),
    partNumber: Number(body.partNumber),
  })
})
