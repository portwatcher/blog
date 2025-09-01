import { serverQueryContent } from '#content/server'
import {
  getClientIP,
  isBlocked,
  noteUnlockRequest,
  noteFailedAttempt,
  noteSuccessfulUnlock,
} from '../../utils/ratelimit'

const limit = 10

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const queryBuilder = serverQueryContent(event).sort({ date: -1 })
  const config = useRuntimeConfig()
  const ip = getClientIP(event)

  if (query.title) {
    queryBuilder.where({ title: String(query.title) })
  }
  if (query.path) {
    queryBuilder.where({ _path: String(query.path) })
  }
  if (query.category) {
    queryBuilder.where({ _dir: String(query.category) })
  }
  if (query.page) {
    queryBuilder.limit(limit).skip((Number(query.page) - 1) * limit)
  }
  if (query.status) {
    queryBuilder.where({ status: String(query.status) })
  }
  if (query.only) {
    queryBuilder.only(query.only as string[])
  }

  const docs = await queryBuilder.find()
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

  return docs
})
