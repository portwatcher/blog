const isShelfType = (type: string): type is ShelfType => {
  return ['wishlist', 'progress', 'complete'].includes(type)
}

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

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${config.neodbKey}`
    }
  })

  return await res.json()
})