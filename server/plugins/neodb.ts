const CACHE_DURATION = 1000 * 60 * 60 * 1 // 1 hours
const cache: Map<ShelfItemUUID, ShelfData> = new Map()

interface Query {
  category?: ShelfCategory
  type?: ShelfType
  maxRating?: number
  minRating?: number
  page?: number
  limit?: number
}

let cachedAt = 0

const fetchShelf = async (
  type: ShelfType,
  page: number
): Promise<ShelfResponse> => {
  const config = useRuntimeConfig()
  const url = new URL(`https://neodb.social/api/me/shelf/${type}`)
  url.searchParams.append('page', String(page))

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${config.neodbKey}`,
    },
  })

  if (!res.ok) {
    throw new Error(`Failed to fetch shelf: ${res.statusText}`)
  }

  return await res.json()
}

const getAllShelves = async (): Promise<ShelfData[]> => {
  const types: ShelfType[] = ['complete', 'progress', 'wishlist']
  const allData: ShelfData[] = []

  for (const type of types) {
    let currentPage = 1
    let response = await fetchShelf(type, currentPage)
    allData.push(...response.data)

    if (process.env.NODE_ENV === 'production') {
      while (currentPage < response.pages) {
        currentPage++
        response = await fetchShelf(type, currentPage)
        allData.push(...response.data)
      }
    }
  }

  return allData
}

const scrap = async () => {
  const datas = await getAllShelves()
  for (const data of datas) {
    cache.set(data.item.uuid, data)
  }
  cachedAt = Date.now()
}

export class NeoDBService {
  async scrapIfNeeded() {
    try {
      if (cachedAt === 0) {
        await scrap()
      }
      if (cachedAt + CACHE_DURATION < Date.now()) {
        scrap()
      }
    } catch (err) {
      console.error(err)
    }
  }

  async getOne(uuid: ShelfItemUUID): Promise<ShelfData | null> {
    await this.scrapIfNeeded()
    return cache.get(uuid) || null
  }

  async query(query: Query): Promise<{ data: ShelfData[]; total: number }> {
    await this.scrapIfNeeded()

    const filteredItems = Array.from(cache.values()).filter((item) => {
      if (query.category && item.item.category !== query.category) {
        return false
      }

      if (query.type && item.shelf_type !== query.type) {
        return false
      }

      if (query.type === 'complete') {
        if (query.maxRating || query.minRating) {
          if (item.rating_grade === null) {
            return false
          }
        }

        if (
          query.maxRating &&
          item.rating_grade &&
          item.rating_grade > query.maxRating
        ) {
          return false
        }

        if (
          query.minRating &&
          item.rating_grade &&
          item.rating_grade < query.minRating
        ) {
          return false
        }
      }

      return true
    })

    if (query.type === 'complete') {
      filteredItems.sort((a, b) => {
        return (
          new Date(b.created_time).getTime() -
          new Date(a.created_time).getTime()
        )
      })
    }

    if (query.page && query.limit) {
      const start = (query.page - 1) * query.limit
      const end = start + query.limit
      return {
        data: filteredItems.slice(start, end),
        total: filteredItems.length,
      }
    }

    return {
      data: filteredItems,
      total: filteredItems.length,
    }
  }
}

export default defineNitroPlugin((nitroApp) => {
  const neodb = new NeoDBService()
  const schedule = () => {
    setTimeout(() => {
      neodb.scrapIfNeeded()
      schedule()
    }, CACHE_DURATION)
  }
  schedule()
  nitroApp.hooks.hook('request', (event) => {
    event.context.neodb = neodb
  })
})
