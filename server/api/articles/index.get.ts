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

const getArticleCategory = (article: ArticleDocument) => {
  if (article.category) return String(article.category)
  const path = String(article.path || article._path || '')
  return path.split('/').filter(Boolean)[0] || ''
}

const withCompatibilityFields = (article: ArticleDocument) => ({
  ...article,
  _path: article._path || article.path,
  _dir: article._dir || getArticleCategory(article),
})

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

  normalized.add('status')
  normalized.add('path')
  normalized.add('legacyPath')

  return Array.from(normalized)
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

    if (doc.status === 'public') {
      // Return as-is for public articles
      return [doc]
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
          },
        ]
      } else {
        // Successful unlock resets failure counters
        noteSuccessfulUnlock(ip)
        return [
          {
            ...doc,
            authenticated: true,
          },
        ]
      }
    }
  }

  // Listing queries: never include body; mask private descriptions
  const safeDocs = docs.map((d: any) => {
    const { body, ...rest } = d || {}
    if (rest?.status === 'private') {
      return { ...rest, description: 'This article is private' }
    }
    return rest
  })
  return safeDocs
})
