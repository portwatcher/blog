const CACHE_DURATION = 1000 * 60 * 60 // 1 hour

interface CacheEntry {
  data: ShelfResponse
  timestamp: number
}

const cache: Map<string, CacheEntry> = new Map()

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

export class NeoDBService {
  private getCacheKey(type: ShelfType, page: number): string {
    return `${type}-${page}`
  }

  private isCacheValid(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp < CACHE_DURATION
  }

  async getShelf(type: ShelfType, page: number = 1): Promise<ShelfResponse> {
    const cacheKey = this.getCacheKey(type, page)
    const cachedEntry = cache.get(cacheKey)

    if (cachedEntry && this.isCacheValid(cachedEntry)) {
      return cachedEntry.data
    }

    const freshData = await fetchShelf(type, page)
    cache.set(cacheKey, { data: freshData, timestamp: Date.now() })
    return freshData
  }

  async getAllShelves(): Promise<ShelfData[]> {
    const types: ShelfType[] = ['progress', 'complete']
    const allData: ShelfData[] = []

    for (const type of types) {
      let currentPage = 1
      let response = await this.getShelf(type, currentPage)
      console.log(response.data)
      allData.push(...response.data)

      if (process.env.NODE_ENV === 'production') {
        while (currentPage < response.pages) {
          currentPage++
          response = await this.getShelf(type, currentPage)
          allData.push(...response.data)
        }
      }
    }

    return allData
  }
}

export default defineNitroPlugin((nitroApp) => {
  const neodb = new NeoDBService()
  nitroApp.hooks.hook('request', (event) => {
    event.context.neodb = neodb
  })
})
