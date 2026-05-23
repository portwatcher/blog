import { defineCollection, defineContentConfig, z } from '@nuxt/content'

const mediaAssetSchema = z.object({
  provider: z.literal('s3').default('s3'),
  key: z.string(),
  alt: z.string().optional(),
  filename: z.string().optional(),
  contentType: z.string().optional(),
  size: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  lfsPath: z.string().optional(),
  backupStatus: z.enum(['disabled', 'backed_up', 'unchanged', 'failed']).optional(),
  backupError: z.string().optional(),
})

const cmsContentRepo = process.env.NUXT_PUBLIC_CMS_CONTENT_REPO
const contentRepository = process.env.BLOG_CONTENT_REPOSITORY ||
  (cmsContentRepo
    ? cmsContentRepo.includes('://')
      ? cmsContentRepo
      : `https://github.com/${cmsContentRepo}.git`
    : undefined)
const contentBranch = process.env.BLOG_CONTENT_BRANCH || process.env.NUXT_PUBLIC_CMS_CONTENT_BRANCH || 'main'
const contentToken = process.env.BLOG_CONTENT_AUTH_TOKEN
const contentUsername = process.env.BLOG_CONTENT_AUTH_USERNAME || 'x-access-token'

const remoteRepository = contentRepository
  ? {
      url: contentRepository,
      branch: contentBranch,
      auth: contentToken
        ? {
            username: contentUsername,
            token: contentToken,
          }
        : undefined,
    }
  : undefined

const makeSource = (include: string, localInclude = include) =>
  remoteRepository
    ? {
        include,
        prefix: '/',
        repository: remoteRepository,
      }
    : {
        include: localInclude,
        prefix: '/',
      }

const articleSource = makeSource(process.env.BLOG_CONTENT_INCLUDE || 'posts/**/*.md', '**/*.md')
const translationSource = makeSource(process.env.BLOG_TRANSLATION_INCLUDE || 'translations/**/*.md')

export default defineContentConfig({
  collections: {
    articles: defineCollection({
      type: 'page',
      source: articleSource,
      schema: z.object({
        title: z.string(),
        description: z.string().default(''),
        category: z.string().optional(),
        date: z.string(),
        status: z.enum(['public', 'private']).default('public'),
        legacyPath: z.string().optional(),
        cover: mediaAssetSchema.optional(),
        video: mediaAssetSchema.optional(),
      }),
      indexes: [
        { columns: ['date'] },
        { columns: ['title'] },
        { columns: ['status'] },
        { columns: ['category'] },
        { columns: ['path'] },
        { columns: ['legacyPath'] },
      ],
    }),
    translations: defineCollection({
      type: 'page',
      source: translationSource,
      schema: z.object({
        title: z.string(),
        description: z.string().default(''),
        category: z.string().optional(),
        date: z.string(),
        status: z.enum(['public', 'private']).default('public'),
        lang: z.string(),
        sourcePath: z.string(),
        sourceHash: z.string(),
        originalTitle: z.string(),
        legacyPath: z.string().optional(),
        cover: mediaAssetSchema.optional(),
        video: mediaAssetSchema.optional(),
      }),
      indexes: [
        { columns: ['lang'] },
        { columns: ['originalTitle'] },
        { columns: ['sourcePath'] },
        { columns: ['sourceHash'] },
        { columns: ['status'] },
      ],
    }),
  },
})
