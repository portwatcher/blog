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

interface MediaAsset {
  provider: 's3'
  key: string
  alt?: string
  filename?: string
  contentType?: string
  size?: number
  width?: number
  height?: number
  lfsPath?: string
  backupStatus?: 'disabled' | 'backed_up' | 'unchanged' | 'failed'
  backupError?: string
}

interface Article {
  title: string
  description?: string
  category?: string
  date: string
  status?: 'draft' | 'public' | 'private'
  lang?: string
  sourcePath?: string
  sourceHash?: string
  originalTitle?: string
  sourceLang?: string
  requestedLang?: string
  availableTranslations?: string[]
  path?: string
  _path?: string
  _dir?: string
  body?: any
  cover?: MediaAsset
  video?: MediaAsset
  authenticated?: boolean
  [key: string]: any
}

type YearGroupMap = Map<number, Article[]>

interface CategoryInfo {
  title: string
  count: number
}
