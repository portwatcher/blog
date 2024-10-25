import { NeoDBService } from '~/server/plugins/neodb'

const ITEMS_PER_PAGE = 20

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const type = query.type as ShelfType | undefined
  const itemType = query.itemType as ShelfItemType | undefined
  const minRating = Number(query.minRating) || 0
  const maxRating = Number(query.maxRating) || 5
  const page = Number(query.page) || 1

  const neodb: NeoDBService = event.context.neodb
  const allData = await neodb.getAllShelves()

  let filteredData = allData

  if (type) {
    filteredData = filteredData.filter((item) => item.shelf_type === type)
  }

  if (itemType) {
    filteredData = filteredData.filter((item) => item.item.type === itemType)
  }

  filteredData = filteredData.filter((item) => {
    const rating = item.item.rating || 0
    return rating >= minRating && rating <= maxRating
  })

  // Group by ShelfItemType, then by ShelfType
  const groupedData = filteredData.reduce((acc, item) => {
    const itemType = item.item.type as ShelfItemType
    const shelfType = item.shelf_type

    if (!acc[itemType]) {
      acc[itemType] = {} as Record<ShelfType, ShelfData[]>
    }
    if (!acc[itemType][shelfType]) {
      acc[itemType][shelfType] = []
    }
    acc[itemType][shelfType].push(item)
    return acc
  }, {} as Record<ShelfItemType, Record<ShelfType, ShelfData[]>>)

  // Sort each group by rating (descending)
  Object.values(groupedData).forEach((itemTypeGroup) => {
    Object.values(itemTypeGroup).forEach((shelfTypeGroup) => {
      shelfTypeGroup.sort((a, b) => (b.item.rating || 0) - (a.item.rating || 0))
    })
  })

  const totalItems = filteredData.length
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE)

  // Flatten the grouped data for pagination
  const flattenedData = Object.entries(groupedData).flatMap(
    ([itemType, shelfTypes]) =>
      Object.entries(shelfTypes).flatMap(([shelfType, items]) =>
        items.map((item) => ({ itemType, shelfType, ...item }))
      )
  )

  const paginatedData = flattenedData.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE
  )

  return {
    data: paginatedData,
    page,
    totalPages,
    totalItems,
    groupedData, // Include the full grouped data structure
  }
})
