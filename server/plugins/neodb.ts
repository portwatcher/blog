const CACHE_DURATION = 1000 * 60 * 60 * 24 // 24 hours

interface CacheEntry {
  data: Shelf
  timestamp: number
}

export class NeoDBService {
  private cache: Map<string, CacheEntry> = new Map()

  private async fetchShelf(type: ShelfType, page: number): Promise<Shelf> {
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

  private getCacheKey(type: ShelfType, page: number): string {
    return `${type}-${page}`
  }

  private isCacheValid(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp < CACHE_DURATION
  }

  async getShelf(type: ShelfType, page: number): Promise<Shelf> {
    const cacheKey = this.getCacheKey(type, page)
    const cachedEntry = this.cache.get(cacheKey)

    if (cachedEntry && this.isCacheValid(cachedEntry)) {
      return cachedEntry.data
    }

    const freshData = await this.fetchShelf(type, page)
    this.cache.set(cacheKey, { data: freshData, timestamp: Date.now() })
    return freshData
  }

  async getAllShelves(): Promise<ShelfData[]> {
    const types: ShelfType[] = ['wishlist', 'progress', 'complete']
    const allData: ShelfData[] = []

    for (const type of types) {
      let page = 1
      let hasMorePages = true

      while (hasMorePages) {
        const shelf = await this.getShelf(type, page)
        allData.push(...shelf.data)
        hasMorePages = page < shelf.pages
        page++
      }
    }

    return allData
  }
}

const neodb = new NeoDBService()

while (true) {
  try {
    await neodb.getAllShelves()
    await new Promise((resolve) => setTimeout(resolve, 60 * 60 * 1000))
  } catch (err) {
    console.error(err)
  }
}

export default defineNitroPlugin(async (nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    event.context.neodb = neodb
  })
})
