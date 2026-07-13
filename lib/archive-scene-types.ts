import type { Matrix4 } from 'three'

export interface ArchiveSceneArticle {
  title: string
  date: string
}

export interface ArchiveSceneFrame {
  position: number
  selectedIndex: number
  cameraFromIndex: number
  cameraToIndex: number
  shelfTransitionProgress: number
  presentationProgress: number
  selectionProgress: number
  hovered: boolean
}

export interface ArchiveSceneRects {
  surfaceRect: DOMRect
  titleRect: DOMRect
}

export interface ArchiveSceneEngine {
  draw: (frame: ArchiveSceneFrame) => void
  getActiveRects: () => ArchiveSceneRects
  pickArticleAt: (clientX: number, clientY: number) => number | null
  refreshTypography: () => void
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
  archiveLabel: string
  titleFontFamily?: string
  backgroundColor?: number
}

export interface ArchiveCasePose {
  matrix: Matrix4
  faceVisibility: number
}

export interface ArchiveTitleBounds {
  left: number
  top: number
  width: number
  height: number
}
