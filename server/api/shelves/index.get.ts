const isShelfType = (type: string): type is ShelfType => {
  return ['wishlist', 'progress', 'complete'].includes(type)
}

const caches = new Map<
  string,
  {
    shelf: Shelf
    updatedAt: number
  }
>()

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const page = Number(query.page) || 1
  const config = useRuntimeConfig()

  if (!!!config.neodbKey) {
    return {
      type: query.type,
      data: [],
      pages: 1,
    }
  }

  if (!isShelfType(String(query.type))) {
    return new Response('Invalid shelf type', { status: 400 })
  }

  const url = new URL(`https://neodb.social/api/me/shelf/${query.type}`)
  url.searchParams.append('page', String(page))

  const cache = caches.get(url.toString())
  if (cache && cache.updatedAt > Date.now() - 1000 * 60 * 60 * 24) {
    return cache.shelf
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${config.neodbKey}`,
    },
  })

  const data = await res.json()

  caches.set(url.toString(), {
    shelf: data,
    updatedAt: Date.now(),
  })

  return data
})
