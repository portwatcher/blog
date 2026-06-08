import { queryCollection } from '@nuxt/content/server'
import {
  getClientIP,
  isBlocked,
  noteUnlockRequest,
  noteFailedAttempt,
  noteSuccessfulUnlock,
} from '../../utils/ratelimit'

const limit = 10

type ArticleDocument = Record<string, any>

const excerptLength = 180

const getArticleCategory = (article: ArticleDocument) => {
  if (article.category) return String(article.category)
  const path = String(article.path || article._path || '')
  return path.split('/').filter(Boolean)[0] || ''
}

const parseCsv = (value: unknown) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

const normalizeLanguage = (lang: unknown) => String(lang || '').trim().toLowerCase()
const languageBase = (lang: unknown) => normalizeLanguage(lang).split('-')[0]
const languagesAlign = (left: unknown, right: unknown) => {
  const normalizedLeft = normalizeLanguage(left)
  const normalizedRight = normalizeLanguage(right)

  return normalizedLeft === normalizedRight || languageBase(normalizedLeft) === languageBase(normalizedRight)
}

const getArticleSourceLang = (article: ArticleDocument, config: ReturnType<typeof useRuntimeConfig>) =>
  String(article.lang || config.public.originalLanguage || 'zh')

const getRequestedTranslationLang = (
  queryLang: unknown,
  config: ReturnType<typeof useRuntimeConfig>,
  sourceLang: string,
) => {
  const lang = String(queryLang || '').trim()
  if (!lang) return ''

  if (lang === 'original' || languagesAlign(lang, sourceLang)) return ''

  const configured = parseCsv(config.public.translationLanguages || 'zh,en,ja')
  const matched = configured.find((configuredLang) => languagesAlign(configuredLang, lang))
  return matched || ''
}

const withCompatibilityFields = (article: ArticleDocument) => ({
  ...article,
  _path: article._path || article.path,
  _dir: article._dir || getArticleCategory(article),
})

const normalizeDescription = (value: unknown) =>
  String(value || '').replace(/\s+/g, ' ').trim()

const getTextFromContentNode = (node: any): string => {
  if (!node) return ''
  if (typeof node === 'string') return node
  if (node.type === 'text') return String(node.value || '')
  if (!Array.isArray(node.children)) return ''

  return node.children.map(getTextFromContentNode).filter(Boolean).join(' ')
}

const getArticleDescription = (article: ArticleDocument) => {
  const description = normalizeDescription(article.description)
  if (description) return description

  const excerpt = normalizeDescription(getTextFromContentNode(article.body))
  if (excerpt.length <= excerptLength) return excerpt

  return `${excerpt.slice(0, excerptLength).trim()}...`
}

const getArticleTranslations = async (event: any, article: ArticleDocument) => {
  const originalTitle = String(article.title || '')
  if (!originalTitle) return []

  const translations = await queryCollection(event, 'translations')
    .where('originalTitle', '=', originalTitle)
    .all() as ArticleDocument[]

  return translations.map(withCompatibilityFields)
}

const getAvailableTranslationLangs = (translations: ArticleDocument[], sourceLang: string) =>
  Array.from(
    new Set(
      translations
        .map((translation) => String(translation.lang || '').trim())
        .filter((lang) => lang && !languagesAlign(lang, sourceLang)),
    ),
  ).sort()

const getArticleWithTranslation = async (
  article: ArticleDocument,
  lang: string,
  translations: ArticleDocument[],
  sourceLang: string,
) => {
  const availableTranslations = getAvailableTranslationLangs(translations, sourceLang)

  if (!lang) {
    return {
      ...article,
      requestedLang: '',
      sourceLang,
      availableTranslations,
    }
  }

  const translation = translations.find((candidate) => languagesAlign(candidate.lang, lang))
  if (!translation) {
    return {
      ...article,
      requestedLang: lang,
      sourceLang,
      availableTranslations,
    }
  }

  return {
    ...translation,
    _path: article._path || article.path,
    _dir: article._dir || getArticleCategory(article),
    category: article.category || translation.category,
    date: article.date || translation.date,
    status: article.status || translation.status,
    legacyPath: article.legacyPath,
    authenticated: article.authenticated,
    requestedLang: lang,
    sourceLang,
    availableTranslations,
  }
}

const parseOnlyFields = (only: unknown) => {
  const fields = Array.isArray(only)
    ? only.map(String)
    : String(only).split(',')

  const normalized = new Set<string>()

  for (const rawField of fields) {
    const field = rawField.trim()
    if (!field) continue
    if (field === '_path') {
      normalized.add('path')
      continue
    }
    if (field === '_dir') {
      normalized.add('path')
      normalized.add('category')
      continue
    }
    normalized.add(field)
  }

  if (normalized.has('description')) {
    normalized.add('body')
  }

  normalized.add('status')
  normalized.add('path')
  normalized.add('lang')
  normalized.add('legacyPath')

  return Array.from(normalized)
}

const getArticleListingDocument = async (
  event: any,
  article: ArticleDocument,
  queryLang: unknown,
  config: ReturnType<typeof useRuntimeConfig>,
) => {
  const sourceLang = getArticleSourceLang(article, config)
  const requestedLang = getRequestedTranslationLang(queryLang, config, sourceLang)

  if (!requestedLang) return article

  const translations = await getArticleTranslations(event, article)
  return getArticleWithTranslation(article, requestedLang, translations, sourceLang)
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const queryBuilder = queryCollection(event, 'articles').order('date', 'DESC')
  const config = useRuntimeConfig()
  const ip = getClientIP(event)
  const requestedPath = query.path ? String(query.path) : ''

  if (query.title) {
    queryBuilder.where('title', '=', String(query.title))
  }
  if (query.category && !requestedPath) {
    const category = String(query.category)
    queryBuilder.andWhere((group) =>
      group
        .where('category', '=', category)
        .orWhere((pathGroup) => pathGroup.where('path', 'LIKE', `/${category}/%`))
    )
  }
  if (query.page) {
    queryBuilder.limit(limit).skip((Number(query.page) - 1) * limit)
  }
  if (query.status) {
    queryBuilder.where('status', '=', String(query.status))
  }
  if (query.only) {
    // Avoid sending body in listings by default; consumers can explicitly request it.
    queryBuilder.select(...(parseOnlyFields(query.only) as any[]))
  }

  let docs = ((await queryBuilder.all()) as ArticleDocument[]).map(withCompatibilityFields) as ArticleDocument[]
  if (requestedPath) {
    const normalizedPath = requestedPath.toLowerCase()
    docs = docs.filter((doc) =>
      [doc.path, doc._path, doc.legacyPath].some((value) => {
        const candidate = String(value || '')
        return candidate === requestedPath || candidate.toLowerCase() === normalizedPath
      })
    )
  }

  if (query.title) {
    const doc = docs[0]
    if (!doc) {
      return []
    }
    const translations = await getArticleTranslations(event, doc)
    const sourceLang = getArticleSourceLang(doc, config)
    const requestedLang = getRequestedTranslationLang(query.lang, config, sourceLang)
    const availableTranslations = getAvailableTranslationLangs(translations, sourceLang)

    if (doc.status === 'public') {
      // Return as-is for public articles
      return [await getArticleWithTranslation(doc, requestedLang, translations, sourceLang)]
    } else if (doc.status === 'private') {
      // Rate limit unlock attempts and block abusive IPs
      const blockState = isBlocked(ip)
      if (blockState.blocked) {
        // Too many failed attempts previously; mask content and communicate back-off
        event.node.res.statusCode = 429
        event.node.res.setHeader('Retry-After', Math.ceil(blockState.retryAfterMs / 1000))
        const lockedBody = {
          type: 'root',
          children: [
            {
              type: 'element',
              tag: 'p',
              children: [
                { type: 'text', value: 'Too many attempts. Try again later.' },
              ],
            },
          ],
        }
        return [
          {
            ...doc,
            body: lockedBody,
            description: 'Too many attempts. Try again later.',
            authenticated: false,
            requestedLang,
            sourceLang,
            availableTranslations,
          },
        ]
      }

      // Never mutate the original cached doc object; return a modified copy
      if (query.password !== undefined) {
        // This is an unlock attempt; apply per-minute rate limiting
        const rate = noteUnlockRequest(ip)
        if (rate.limited) {
          event.node.res.statusCode = 429
          event.node.res.setHeader('Retry-After', Math.ceil(rate.resetInMs / 1000))
          const limitedBody = {
            type: 'root',
            children: [
              {
                type: 'element',
                tag: 'p',
                children: [
                  { type: 'text', value: 'Rate limit exceeded. Try again later.' },
                ],
              },
            ],
          }
          return [
            {
              ...doc,
              body: limitedBody,
              description: 'Rate limit exceeded. Try again later.',
              authenticated: false,
              requestedLang,
              sourceLang,
              availableTranslations,
            },
          ]
        }
      }

      if (query.password !== config.password) {
        const lockedBody = {
          type: 'root',
          children: [
            {
              type: 'element',
              tag: 'p',
              children: [{ type: 'text', value: 'This article is private' }],
            },
          ],
        }
        // Count failed attempts and possibly block the IP
        const failed = noteFailedAttempt(ip)
        if (failed.blocked) {
          event.node.res.statusCode = 429
          event.node.res.setHeader('Retry-After', Math.ceil((failed.blockedUntil - Date.now()) / 1000))
        }
        return [
          {
            ...doc,
            body: lockedBody,
            description: 'This article is private',
            authenticated: false,
            requestedLang,
            sourceLang,
            availableTranslations,
          },
        ]
      } else {
        // Successful unlock resets failure counters
        noteSuccessfulUnlock(ip)
        const unlockedDoc = {
          ...doc,
          authenticated: true,
        }
        return [
          await getArticleWithTranslation(unlockedDoc, requestedLang, translations, sourceLang),
        ]
      }
    }
  }

  const localizedDocs = await Promise.all(
    docs.map((doc) => getArticleListingDocument(event, doc, query.lang, config)),
  )

  // Listing queries: never include body; mask private descriptions
  const safeDocs = localizedDocs.map((d: any) => {
    const { body, ...rest } = d || {}
    if (rest?.status === 'private') {
      return { ...rest, description: 'This article is private' }
    }
    return { ...rest, description: getArticleDescription(d) }
  })
  return safeDocs
})
