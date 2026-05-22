import { getS3MediaConfig } from '../../../utils/s3-media'
import { getGitLfsBackupConfig } from '../../../utils/git-lfs-backup'

export default defineEventHandler((event) => {
  const config = getS3MediaConfig(event)
  const backupConfig = getGitLfsBackupConfig(event)

  return {
    mediaBaseUrl: config.mediaBaseUrl,
    tokenRequired: Boolean(config.uploadToken),
    partSize: config.partSize,
    maxUploadBytes: config.maxUploadBytes,
    allowedContentTypes: config.allowedContentTypes,
    lfsBackupEnabled: backupConfig.enabled,
    lfsBackupMediaDir: backupConfig.mediaDir,
  }
})
