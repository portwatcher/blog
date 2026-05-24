import { assertCmsUploadAuthorized } from '../../../utils/s3-media'
import { backupManagedMediaToGitLfs } from '../../../utils/git-lfs-backup'

export default defineEventHandler(async (event) => {
  await assertCmsUploadAuthorized(event)

  const body = await readBody<{
    key?: string
    filename?: string
  }>(event)

  return backupManagedMediaToGitLfs({
    key: String(body.key || ''),
    filename: body.filename,
  }, event)
})
