import type { Mat4, Vec3 } from './archive-math'

export interface ArchiveSceneArticle {
  title: string
  date: string
  categoryTitle?: string
  category?: string
  _dir?: string
}

export interface ArchiveSceneFrame {
  // Browsing position in book units. The camera and every pose follow from it.
  position: number
  // 1 with books coming out as usual, 0 with every book back in its row.
  presence: number
  // Books per second, for work that is not worth doing for a book in passing.
  speed: number
  selectedIndex: number | null
  firstIndex: number
  lastIndex: number
  deltaSeconds: number
  selectionProgress: number
  hovered: boolean
}

export interface ArchiveSceneRects {
  surfaceRect: DOMRect
  titleRect: DOMRect
}

export interface ArchiveSceneEngine {
  draw: (frame: ArchiveSceneFrame) => boolean
  getActiveRects: () => ArchiveSceneRects
  pickArticleAt: (clientX: number, clientY: number) => number | null
  // Starts the next frame on its shelf instead of gliding there. Used on
  // entry, where nothing should animate into place.
  place: () => void
  // Repaints the artwork, optionally in a font that has just become available.
  refreshTypography: (titleFontFamily?: string) => void
  resize: () => void
  destroy: () => void
}

export interface ArchiveSceneOptions {
  canvas: HTMLCanvasElement
  context: WebGL2RenderingContext
  host: HTMLElement
  articles: ArchiveSceneArticle[]
  lowPower: boolean
  locale: string
  titleFontFamily?: string
  backgroundColor?: number
  theme?: ArchiveSceneTheme
}

export interface ArchiveSceneTheme {
  surface: number
  subtle: number
  heading: number
  muted: number
  border: number
}

export interface ArchiveCamera {
  // Vertical field of view, in radians.
  fieldOfView: number
  aspect: number
  position: Vec3
  view: Mat4
  projection: Mat4
  viewProjection: Mat4
}

export interface ArchiveCasePose {
  matrix: Mat4
  // How far the cover has swung open towards the camera, 0 to 1.
  swing: number
  center: Vec3
}

export interface ArchiveTitleBounds {
  left: number
  top: number
  width: number
  height: number
}
