type YearGroupMap = Map<number, ParsedContent[]>

interface CategoryInfo {
  title: string
  count: number
}

type ShelfType = 'wishlist' | 'progress' | 'complete'

type ShelfItemType =
  | 'book'
  | 'movie'
  | 'album'
  | 'game'
  | 'tv'
  | 'podcast'
  | 'performance'

interface ShelfItem {
  title: string
  description: string
  localized_title: {
    lang: string
    text: string
  }[]
  localized_description: {
    lang: string
    text: string
  }[]
  cover_image_url: string
  rating: null | number
  rating_count: number
  brief: string
  id: string
  type: string
  uuid: string
  url: string
  api_url: string
  category: string
  parent_uuid: null
  display_title: string
  external_resources: { url: string }[]
  created_time: string
  comment_text: string | null
  rating_grade: number | null
  tags: string[]
}

interface ShelfData {
  visibility: number
  shelf_type: ShelfType
  item: ShelfItem
}

interface Shelf {
  data: ShelfData[]
  pages: number
  count: number
}
