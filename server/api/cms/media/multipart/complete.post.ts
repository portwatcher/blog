import {
  assertCmsUploadAuthorized,
  completeMultipartUpload,
} from '../../../../utils/s3-media'
import { backupManagedMediaToGitLfs } from '../../../../utils/git-lfs-backup'

export default defineEventHandler(async (event) => {
  await assertCmsUploadAuthorized(event)

  const body = await readBody<{
    key?: string
    uploadId?: string
    filename?: string
    parts?: Array<{
      ETag?: string
      PartNumber?: number
    }>
  }>(event)

  const result = await completeMultipartUpload({
    key: String(body.key || ''),
    uploadId: String(body.uploadId || ''),
    parts: body.parts || [],
  })

  const backup = await backupManagedMediaToGitLfs({
    key: result.key,
    filename: body.filename,
  }, event)

  return {
    ...result,
    backup,
  }
})
