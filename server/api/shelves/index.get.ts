import { NeoDBService } from '~/server/plugins/neodb'
import { ITEMS_PER_PAGE } from '~/utils'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const type = query.type as ShelfType | undefined
  const category = query.category as ShelfCategory | undefined
  const minRating = Number(query.minRating) || 0
  const maxRating = Number(query.maxRating) || 10
  const page = Number(query.page) || 1

  const neodb: NeoDBService = event.context.neodb
  const { data: allData, total } = await neodb.query({
    category,
    type,
    minRating,
    maxRating,
    page,
    limit: ITEMS_PER_PAGE,
  })

  // Group by Category, then by ShelfType
  const groupedData = allData.reduce((acc, item) => {
    const category = item.item.category
    const shelfType = item.shelf_type

    if (!acc[category]) {
      acc[category] = {} as Record<ShelfType, ShelfData[]>
    }
    if (!acc[category][shelfType]) {
      acc[category][shelfType] = []
    }
    acc[category][shelfType].push(item)
    return acc
  }, {} as Record<ShelfCategory, Record<ShelfType, ShelfData[]>>)

  return {
    groupedData,
    total,
  }
})
