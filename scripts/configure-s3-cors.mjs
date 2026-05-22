import { PutBucketCorsCommand, S3Client } from '@aws-sdk/client-s3'
import { readFileSync, existsSync } from 'node:fs'

const loadDotEnv = () => {
  if (!existsSync('.env')) return

  const lines = readFileSync('.env', 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue

    const [rawKey, ...rawValue] = trimmed.split('=')
    const key = rawKey.trim()
    const value = rawValue.join('=').trim().replace(/^['"]|['"]$/g, '')
    if (!process.env[key]) process.env[key] = value
  }
}

const readEnv = (...names) => {
  for (const name of names) {
    if (process.env[name]) return process.env[name]
  }
  return ''
}

loadDotEnv()

const bucket = readEnv('NUXT_S3_BUCKET', 'S3_BUCKET')
const region = readEnv('NUXT_S3_REGION', 'AWS_REGION', 'S3_REGION') || 'us-east-1'
const endpoint = readEnv('NUXT_S3_ENDPOINT', 'S3_ENDPOINT') || undefined
const accessKeyId = readEnv('NUXT_S3_ACCESS_KEY_ID', 'AWS_ACCESS_KEY_ID', 'S3_ACCESS_KEY_ID') || undefined
const secretAccessKey = readEnv('NUXT_S3_SECRET_ACCESS_KEY', 'AWS_SECRET_ACCESS_KEY', 'S3_SECRET_ACCESS_KEY') || undefined
const forcePathStyle = ['1', 'true', 'yes', 'on'].includes(readEnv('NUXT_S3_FORCE_PATH_STYLE', 'S3_FORCE_PATH_STYLE').toLowerCase())
const allowedOrigins = readEnv('S3_CORS_ALLOWED_ORIGINS', 'NUXT_PUBLIC_HOST', 'NUXT_PUBLIC_SITE_URL')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

if (!bucket) {
  throw new Error('Set S3_BUCKET or NUXT_S3_BUCKET before configuring CORS.')
}

if (allowedOrigins.length === 0) {
  throw new Error('Set S3_CORS_ALLOWED_ORIGINS, NUXT_PUBLIC_HOST, or NUXT_PUBLIC_SITE_URL.')
}

const client = new S3Client({
  region,
  endpoint,
  forcePathStyle,
  credentials: accessKeyId && secretAccessKey
    ? {
        accessKeyId,
        secretAccessKey,
      }
    : undefined,
})

await client.send(new PutBucketCorsCommand({
  Bucket: bucket,
  CORSConfiguration: {
    CORSRules: [
      {
        AllowedMethods: ['GET', 'HEAD', 'PUT', 'POST'],
        AllowedOrigins: allowedOrigins,
        AllowedHeaders: ['*'],
        ExposeHeaders: ['ETag'],
        MaxAgeSeconds: 3600,
      },
    ],
  },
}))

console.log(`Configured CORS for ${bucket}: ${allowedOrigins.join(', ')}`)
