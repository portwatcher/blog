import { GetObjectCommand } from '@aws-sdk/client-s3'
import { createWriteStream } from 'node:fs'
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, posix } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { useRuntimeConfig } from '#imports'
import {
  assertManagedMediaKey,
  createS3Client,
  getS3MediaConfig,
} from './s3-media'
import type { H3Event } from 'h3'

const execFileAsync = promisify(execFile)

export interface GitLfsBackupConfig {
  enabled: boolean
  repository: string
  branch: string
  mediaDir: string
  authUsername: string
  authToken?: string
  authorName: string
  authorEmail: string
  commitMessagePrefix: string
}

export interface GitLfsBackupResult {
  enabled: boolean
  status: 'disabled' | 'backed_up' | 'unchanged' | 'failed'
  lfsPath?: string
  commit?: string
  error?: string
}

const readString = (runtimeValue: unknown, envNames: string[], fallback = '') => {
  for (const envName of envNames) {
    const value = process.env[envName]
    if (value) return value
  }
  return typeof runtimeValue === 'string' && runtimeValue ? runtimeValue : fallback
}

const readBoolean = (runtimeValue: unknown, envNames: string[], fallback = false) => {
  for (const envName of envNames) {
    const value = process.env[envName]
    if (value) return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
  }
  if (typeof runtimeValue === 'boolean') return runtimeValue
  if (typeof runtimeValue === 'string' && runtimeValue) {
    return ['1', 'true', 'yes', 'on'].includes(runtimeValue.toLowerCase())
  }
  return fallback
}

const githubRepoUrl = (repo: string) => {
  if (!repo) return ''
  if (repo.includes('://') || repo.startsWith('git@')) return repo
  return `https://github.com/${repo}.git`
}

const normalizeRelativePath = (value: string) => {
  const normalized = posix
    .normalize(value.replace(/\\/g, '/'))
    .replace(/^\/+/, '')

  if (
    !normalized ||
    normalized === '.' ||
    normalized.startsWith('../') ||
    normalized.includes('/../')
  ) {
    throw new Error('Git LFS backup path must stay inside the content repository')
  }

  return normalized
}

const sanitizeMediaDir = (value: string) => {
  const mediaDir = normalizeRelativePath(value || 'media')

  if (!/^[\w./-]+$/.test(mediaDir)) {
    throw new Error('Git LFS media directory can only contain letters, numbers, dots, dashes, underscores, and slashes')
  }

  return mediaDir.replace(/\/+$/, '')
}

const stripS3Prefix = (key: string) => {
  const s3Config = getS3MediaConfig()
  const prefix = s3Config.keyPrefix.replace(/^\/+|\/+$/g, '')

  if (prefix && key.startsWith(`${prefix}/`)) {
    return key.slice(prefix.length + 1)
  }

  return key
}

export const getGitLfsBackupConfig = (event?: H3Event): GitLfsBackupConfig => {
  const config = useRuntimeConfig(event)
  const publicRepo = readString(config.public.cmsContentRepo, ['NUXT_PUBLIC_CMS_CONTENT_REPO'])
  const repository = readString(
    config.cmsLfsRepository,
    [
      'NUXT_CMS_LFS_REPOSITORY',
      'CMS_LFS_REPOSITORY',
      'BLOG_CONTENT_WRITE_REPOSITORY',
    ],
    readString(
      undefined,
      ['BLOG_CONTENT_REPOSITORY'],
      githubRepoUrl(publicRepo)
    )
  )

  return {
    enabled: readBoolean(
      config.cmsLfsBackupEnabled,
      ['NUXT_CMS_LFS_BACKUP_ENABLED', 'CMS_LFS_BACKUP_ENABLED']
    ),
    repository,
    branch: readString(
      config.cmsLfsBranch,
      [
        'NUXT_CMS_LFS_BRANCH',
        'CMS_LFS_BRANCH',
        'BLOG_CONTENT_WRITE_BRANCH',
        'BLOG_CONTENT_BRANCH',
        'NUXT_PUBLIC_CMS_CONTENT_BRANCH',
      ],
      'main'
    ),
    mediaDir: sanitizeMediaDir(readString(
      config.cmsLfsMediaDir,
      ['NUXT_CMS_LFS_MEDIA_DIR', 'CMS_LFS_MEDIA_DIR'],
      'media'
    )),
    authUsername: readString(
      config.cmsLfsAuthUsername,
      ['NUXT_CMS_LFS_AUTH_USERNAME', 'CMS_LFS_AUTH_USERNAME', 'BLOG_CONTENT_WRITE_AUTH_USERNAME'],
      'x-access-token'
    ),
    authToken: readString(
      config.cmsLfsAuthToken,
      ['NUXT_CMS_LFS_AUTH_TOKEN', 'CMS_LFS_AUTH_TOKEN', 'BLOG_CONTENT_WRITE_AUTH_TOKEN']
    ) || undefined,
    authorName: readString(
      config.cmsLfsAuthorName,
      ['NUXT_CMS_LFS_AUTHOR_NAME', 'CMS_LFS_AUTHOR_NAME'],
      'Blog CMS'
    ),
    authorEmail: readString(
      config.cmsLfsAuthorEmail,
      ['NUXT_CMS_LFS_AUTHOR_EMAIL', 'CMS_LFS_AUTHOR_EMAIL'],
      'blog-cms@example.invalid'
    ),
    commitMessagePrefix: readString(
      config.cmsLfsCommitMessagePrefix,
      ['NUXT_CMS_LFS_COMMIT_MESSAGE_PREFIX', 'CMS_LFS_COMMIT_MESSAGE_PREFIX'],
      'Backup media'
    ),
  }
}

export const getGitLfsBackupPath = (key: string, config = getGitLfsBackupConfig()) => {
  const relativeKey = normalizeRelativePath(stripS3Prefix(key))
  return normalizeRelativePath(`${config.mediaDir}/${relativeKey}`)
}

const redact = (message: string, config: GitLfsBackupConfig) => {
  return config.authToken
    ? message.split(config.authToken).join('[redacted]')
    : message
}

const gitEnv = (config: GitLfsBackupConfig, askPassPath?: string) => ({
  ...process.env,
  GIT_TERMINAL_PROMPT: '0',
  GIT_ASKPASS: askPassPath || process.env.GIT_ASKPASS,
  GIT_AUTH_USERNAME: config.authUsername,
  GIT_AUTH_TOKEN: config.authToken || '',
})

const run = async (
  command: string,
  args: string[],
  cwd: string,
  config: GitLfsBackupConfig,
  askPassPath?: string
) => {
  try {
    const output = await execFileAsync(command, args, {
      cwd,
      env: gitEnv(config, askPassPath),
      maxBuffer: 10 * 1024 * 1024,
    })

    return String(output.stdout || '').trim()
  } catch (error: any) {
    const stderr = String(error.stderr || '')
    const stdout = String(error.stdout || '')
    const message = stderr || stdout || error.message || `${command} failed`
    throw new Error(redact(message.trim(), config))
  }
}

const writeAskPassScript = async (directory: string, config: GitLfsBackupConfig) => {
  if (!config.authToken) return undefined

  const scriptPath = join(directory, 'git-askpass.sh')
  await writeFile(scriptPath, [
    '#!/bin/sh',
    'case "$1" in',
    '  *Username*) printf "%s\\n" "$GIT_AUTH_USERNAME" ;;',
    '  *) printf "%s\\n" "$GIT_AUTH_TOKEN" ;;',
    'esac',
    '',
  ].join('\n'))
  await chmod(scriptPath, 0o700)
  return scriptPath
}

const ensureLfsAttributes = async (checkoutPath: string, config: GitLfsBackupConfig) => {
  const attributesPath = join(checkoutPath, '.gitattributes')
  const line = `${config.mediaDir}/** filter=lfs diff=lfs merge=lfs -text`
  let current = ''

  try {
    current = await readFile(attributesPath, 'utf8')
  } catch (error: any) {
    if (error.code !== 'ENOENT') throw error
  }

  const lines = current.split(/\r?\n/).filter(Boolean)
  if (lines.includes(line)) return

  lines.push(line)
  await writeFile(attributesPath, `${lines.join('\n')}\n`)
}

const downloadS3Object = async (key: string, destinationPath: string) => {
  const s3Config = getS3MediaConfig()
  const response = await createS3Client(s3Config).send(new GetObjectCommand({
    Bucket: s3Config.bucket,
    Key: key,
  }))

  if (!response.Body) {
    throw new Error('S3 returned an empty media object body')
  }

  await pipeline(
    response.Body as NodeJS.ReadableStream,
    createWriteStream(destinationPath)
  )
}

const commitMessage = (input: {
  key: string
  filename?: string
}, config: GitLfsBackupConfig) => {
  const filename = input.filename || posix.basename(input.key)
  return `${config.commitMessagePrefix}: ${filename}`
}

const backupOnce = async (input: {
  key: string
  filename?: string
}, config: GitLfsBackupConfig, lfsPath: string): Promise<GitLfsBackupResult> => {
  const tempRoot = await mkdtemp(join(tmpdir(), 'blog-cms-lfs-'))
  const checkoutPath = join(tempRoot, 'content')

  try {
    const askPassPath = await writeAskPassScript(tempRoot, config)

    await run('git', ['lfs', 'version'], tempRoot, config, askPassPath)
    await run('git', ['clone', '--depth', '1', '--branch', config.branch, config.repository, checkoutPath], tempRoot, config, askPassPath)
    await run('git', ['lfs', 'install', '--local'], checkoutPath, config, askPassPath)
    await run('git', ['config', 'user.name', config.authorName], checkoutPath, config, askPassPath)
    await run('git', ['config', 'user.email', config.authorEmail], checkoutPath, config, askPassPath)

    await ensureLfsAttributes(checkoutPath, config)

    const destinationPath = join(checkoutPath, lfsPath)
    await mkdir(dirname(destinationPath), { recursive: true })
    await downloadS3Object(input.key, destinationPath)

    await run('git', ['add', '--', '.gitattributes', lfsPath], checkoutPath, config, askPassPath)

    try {
      await run('git', ['diff', '--cached', '--quiet'], checkoutPath, config, askPassPath)
      return {
        enabled: true,
        status: 'unchanged',
        lfsPath,
      }
    } catch {
      // Non-zero means there is a staged change to commit.
    }

    await run('git', ['commit', '-m', commitMessage(input, config)], checkoutPath, config, askPassPath)
    const commit = await run('git', ['rev-parse', 'HEAD'], checkoutPath, config, askPassPath)
    await run('git', ['push', 'origin', `HEAD:${config.branch}`], checkoutPath, config, askPassPath)

    return {
      enabled: true,
      status: 'backed_up',
      lfsPath,
      commit,
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
}

export const backupManagedMediaToGitLfs = async (input: {
  key: string
  filename?: string
}, event?: H3Event): Promise<GitLfsBackupResult> => {
  const config = getGitLfsBackupConfig(event)

  if (!config.enabled) {
    return {
      enabled: false,
      status: 'disabled',
    }
  }

  assertManagedMediaKey(input.key)
  const lfsPath = getGitLfsBackupPath(input.key, config)

  if (!config.repository) {
    return {
      enabled: true,
      status: 'failed',
      lfsPath,
      error: 'Git LFS backup is enabled, but no writable content repository is configured',
    }
  }

  try {
    return await backupOnce(input, config, lfsPath)
  } catch (error: any) {
    const message = redact(error?.message || String(error), config)

    if (/non-fast-forward|fetch first|rejected|stale info/i.test(message)) {
      try {
        return await backupOnce(input, config, lfsPath)
      } catch (retryError: any) {
        return {
          enabled: true,
          status: 'failed',
          lfsPath,
          error: redact(retryError?.message || String(retryError), config),
        }
      }
    }

    return {
      enabled: true,
      status: 'failed',
      lfsPath,
      error: message,
    }
  }
}
