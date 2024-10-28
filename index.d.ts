type ShelfType = 'wishlist' | 'progress' | 'complete'

type ShelfCategory = string

type ShelfItemUUID = string

interface ExternalResource {
  url: string
}

interface ShelfItem {
  title: string
  description: string
  localized_title: any[]
  localized_description: any[]
  cover_image_url: string
  rating: number
  rating_count: number
  id: string
  type: string
  uuid: ShelfItemUUID
  url: string
  api_url: string
  category: ShelfCategory
  parent_uuid: ShelfItemUUID | null
  display_title: string
  external_resources: ExternalResource[]
}

interface ShelfData {
  shelf_type: ShelfType
  visibility: number
  item: ShelfItem
  created_time: string
  comment_text: string | null
  rating_grade: number | null
  tags: string[]
}

interface ShelfResponse {
  data: ShelfData[]
  pages: number
  count: number
}

interface GroupedShelfData {
  [category: string]: {
    [shelfType in ShelfType]?: ShelfData[]
  }
}
