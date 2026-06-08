const CACHE_DURATION = 1000 * 60 * 60 * 1 // 1 hour
const CACHE_REFRESH_RETRY_DELAY = 1000 * 60 * 5
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
  neodbKey: string,
  type: ShelfType,
  page: number
): Promise<ShelfResponse> => {
  const url = new URL(`https://neodb.social/api/me/shelf/${type}`)
  url.searchParams.append('page', String(page))

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${neodbKey}`,
    },
  })

  if (!res.ok) {
    throw new Error(`Failed to fetch shelf: ${res.statusText}`)
  }

  return await res.json()
}

const getAllShelves = async (neodbKey: string): Promise<ShelfData[]> => {
  const types: ShelfType[] = ['complete', 'progress', 'wishlist']
  const allData: ShelfData[] = []

  for (const type of types) {
    let currentPage = 1
    let response = await fetchShelf(neodbKey, type, currentPage)
    allData.push(...response.data)

    if (process.env.NODE_ENV === 'production') {
      while (currentPage < response.pages) {
        currentPage++
        response = await fetchShelf(neodbKey, type, currentPage)
        allData.push(...response.data)
      }
    }
  }

  return allData
}

const refreshCache = async (neodbKey: string) => {
  const datas = await getAllShelves(neodbKey)
  cache.clear()
  for (const data of datas) {
    cache.set(data.item.uuid, data)
  }
  cachedAt = Date.now()
}

export class NeoDBService {
  private readonly neodbKey: string
  private refreshPromise: Promise<void> | null = null
  private refreshTimer: ReturnType<typeof setTimeout> | null = null
  private started = false

  constructor(neodbKey = '') {
    this.neodbKey = neodbKey.trim()
  }

  async start() {
    if (this.started || !this.neodbKey) {
      return
    }

    this.started = true

    try {
      await this.refresh()
      this.schedule(CACHE_DURATION)
    } catch {
      this.schedule(CACHE_REFRESH_RETRY_DELAY)
    }
  }

  stop() {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = null
    }
    this.started = false
  }

  private refresh(): Promise<void> {
    if (!this.neodbKey) {
      return Promise.resolve()
    }

    if (!this.refreshPromise) {
      this.refreshPromise = refreshCache(this.neodbKey)
        .catch((err) => {
          console.error('Failed to refresh NeoDB cache', err)
          throw err
        })
        .finally(() => {
          this.refreshPromise = null
        })
    }

    return this.refreshPromise
  }

  private schedule(delay: number) {
    if (!this.neodbKey) {
      return
    }

    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
    }

    const timer = setTimeout(() => {
      this.refreshTimer = null
      void this.refresh().then(
        () => this.schedule(CACHE_DURATION),
        () => this.schedule(CACHE_REFRESH_RETRY_DELAY)
      )
    }, delay)

    if (typeof timer === 'object' && 'unref' in timer) {
      timer.unref()
    }

    this.refreshTimer = timer
  }

  private async waitForStartupRefresh() {
    if (cachedAt !== 0 || !this.refreshPromise) {
      return
    }

    try {
      await this.refreshPromise
    } catch {
      // start() schedules a retry; requests should not trigger the first cache fill.
    }
  }

  private refreshStaleCache() {
    if (
      !this.neodbKey ||
      this.refreshPromise ||
      cachedAt === 0 ||
      cachedAt + CACHE_DURATION >= Date.now()
    ) {
      return
    }

    void this.refresh().then(
      () => this.schedule(CACHE_DURATION),
      () => this.schedule(CACHE_REFRESH_RETRY_DELAY)
    )
  }

  async getOne(uuid: ShelfItemUUID): Promise<ShelfData | null> {
    await this.waitForStartupRefresh()
    this.refreshStaleCache()
    return cache.get(uuid) || null
  }

  async query(query: Query): Promise<{ data: ShelfData[]; total: number }> {
    await this.waitForStartupRefresh()
    this.refreshStaleCache()

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

export default defineNitroPlugin(async (nitroApp) => {
  const config = useRuntimeConfig()
  const neodb = new NeoDBService(config.neodbKey)
  await neodb.start()

  nitroApp.hooks.hook('request', (event) => {
    event.context.neodb = neodb
  })
  nitroApp.hooks.hook('close', () => {
    neodb.stop()
  })
})
