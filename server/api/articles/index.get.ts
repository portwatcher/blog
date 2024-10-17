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
      return [doc]
    } else if (doc.status === 'private') {
      if (query.password !== config.password) {
        if (doc.body) {
          doc.body.children = [
            {
              type: 'element',
              tag: 'p',
              children: [
                { type: 'text', value: 'This article is currently private' },
              ],
            },
          ]
        }
      } else {
        doc.authenticated = true
      }
      return [doc]
    }
  }

  return docs
})
