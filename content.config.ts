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

const articleSource = {
  include: process.env.BLOG_CONTENT_LOCAL_INCLUDE || '**/*.md',
  prefix: '/',
}
const translationSource = {
  include: process.env.BLOG_TRANSLATION_LOCAL_INCLUDE || 'translations/**/*.md',
  prefix: '/',
}

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
        status: z.enum(['draft', 'public', 'private']).default('public'),
        lang: z.string().optional(),
        legacyPath: z.string().optional(),
        cover: mediaAssetSchema.optional(),
        video: mediaAssetSchema.optional(),
      }),
      indexes: [
        { columns: ['date'] },
        { columns: ['title'] },
        { columns: ['status'] },
        { columns: ['category'] },
        { columns: ['lang'] },
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
        status: z.enum(['draft', 'public', 'private']).default('public'),
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
