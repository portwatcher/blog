import RSS from 'rss'
import { getRuntimeContent } from '../utils/runtime-content'

const getArticleCategory = (article: { category?: string, path: string }) => {
  return article.category || article.path.split('/').filter(Boolean)[0] || ''
}

export default defineEventHandler(async (event) => {
  try {
    const config = useRuntimeConfig(event)
    const { articles } = await getRuntimeContent(event)
    const publicArticles = articles.filter((article) => article.status === 'public')

    const feed = new RSS({
      title: 'Rafael Magalhaes',
      site_url: config.public.host,
      feed_url: `${config.public.host}/feed`,
    })

    for (const article of publicArticles.values()) {
      feed.item({
        title: String(article.title),
        url: `${config.public.host}/articles/${encodeURIComponent(
          String(article.title)
        )}`,
        description: article.description || '',
        date: String(article.date),
        categories: [getArticleCategory(article)],
      })
    }

    const feedString = feed.xml({ indent: true })
    event.node.res.setHeader('content-type', 'text/xml')
    event.node.res.end(feedString)
  } catch (err) {
    console.error(err)
    throw err
  }
})
