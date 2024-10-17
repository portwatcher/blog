import RSS from 'rss'
import { serverQueryContent } from '#content/server'

export default defineEventHandler(async (event) => {
  try {
    const config = useRuntimeConfig(event)
    const articles = await serverQueryContent(event)
      .where({ status: { $eq: 'public' } })
      .sort({ date: -1 })
      .find()

    const feed = new RSS({
      title: 'Rafael Magalhaes',
      site_url: config.public.host,
      feed_url: `${config.public.host}/feed`,
    })

    for (const article of articles.values()) {
      feed.item({
        title: String(article.title),
        url: `${config.public.host}/articles/${encodeURIComponent(
          String(article.title)
        )}`,
        description: article.description,
        date: article.date,
        categories: [article._dir],
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
