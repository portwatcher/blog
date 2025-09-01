import { serverQueryContent } from '#content/server'

const limit = 10

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const queryBuilder = serverQueryContent(event).sort({ date: -1 })
  const config = useRuntimeConfig()

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
      // Never mutate the original cached doc object; return a modified copy
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
        return [
          {
            ...doc,
            body: lockedBody,
            description: 'This article is private',
            authenticated: false,
          },
        ]
      } else {
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
