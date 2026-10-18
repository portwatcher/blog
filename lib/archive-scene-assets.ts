import {
  BufferGeometry,
  CanvasTexture,
  DynamicDrawUsage,
  Float32BufferAttribute,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  SRGBColorSpace,
  Vector3,
} from 'three'
import {
  clamp,
  labelLogicalHeight,
  labelLogicalWidth,
  spineAtlasCellHeight,
  spineAtlasCellWidth,
  spineLabelHeight,
  spineLabelWidth,
  spineTitleMaxFontSize,
  spineTitleMinFontSize,
} from './archive-scene-constants'
import { paintArchiveCover, paintArchivePaper } from './archive-scene-books'
import type { ArchiveBookStyle } from './archive-scene-books'
import type {
  ArchiveSceneArticle,
  ArchiveTitleBounds,
} from './archive-scene-types'

const dateFormatters = new Map<string, Intl.DateTimeFormat>()

const formatDate = (value: string, locale: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  let formatter = dateFormatters.get(locale)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    })
    dateFormatters.set(locale, formatter)
  }
  return formatter.format(date)
}

const segmentTitle = (title: string) =>
  title.trim().replace(/\s+/g, ' ').match(
    /[\p{Script=Latin}\p{M}\p{N}_]+(?:['’.\-][\p{Script=Latin}\p{M}\p{N}_]+)*|\s+|[^\s]/gu,
  ) || []

const wrapTitle = (
  context: CanvasRenderingContext2D,
  segments: string[],
  maxWidth: number,
  maxLines: number,
) => {
  const lines: string[] = []
  let line = ''

  for (const segment of segments) {
    const candidate = `${line}${segment}`
    if (line.trim() && context.measureText(candidate).width > maxWidth) {
      lines.push(line.trimEnd())
      line = segment.trimStart()
    } else {
      line = candidate
    }
  }

  if (line.trim()) {
    lines.push(line.trimEnd())
  }
  if (lines.length > maxLines) {
    const last = segmentTitle(lines[maxLines - 1])
    while (
      last.length > 1
      && context.measureText(`${last.join('').trimEnd()}…`).width > maxWidth
    ) {
      last.pop()
    }
    if (context.measureText(`${last.join('').trimEnd()}…`).width > maxWidth) {
      last.pop()
    }
    lines[maxLines - 1] = `${last.join('').trimEnd()}…`
  }

  return lines.slice(0, maxLines)
}

export const createArchiveLabel = (lowPower: boolean, maxTextureSize: number) => {
  const scale = Math.min(lowPower ? 2 : 3, maxTextureSize / labelLogicalHeight)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(labelLogicalWidth * scale)
  canvas.height = Math.round(labelLogicalHeight * scale)
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) {
    throw new Error('Canvas 2D is unavailable')
  }
  context.scale(canvas.width / labelLogicalWidth, canvas.height / labelLogicalHeight)

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearMipmapLinearFilter
  texture.magFilter = LinearFilter

  return {
    canvas,
    context,
    texture,
    logicalWidth: labelLogicalWidth,
    logicalHeight: labelLogicalHeight,
    articleIndex: -1,
    paintKey: '',
    titleBounds: {
      left: 36,
      top: 190,
      width: 306,
      height: 120,
    } satisfies ArchiveTitleBounds,
  }
}

export type ArchiveLabel = ReturnType<typeof createArchiveLabel>

export interface ArchiveSpineAtlasRect {
  u0: number
  u1: number
  v0: number
  v1: number
  x: number
  y: number
}

export const createSpineAtlas = (
  articleCount: number,
  lowPower: boolean,
  maxTextureSize: number,
  requestedScale = lowPower ? 1.75 : 2.25,
) => {
  const columns = Math.max(
    1,
    Math.min(
      articleCount,
      Math.ceil(
        Math.sqrt(articleCount * spineAtlasCellHeight / spineAtlasCellWidth),
      ),
    ),
  )
  const rows = Math.max(1, Math.ceil(articleCount / columns))
  const logicalWidth = columns * spineAtlasCellWidth
  const logicalHeight = rows * spineAtlasCellHeight
  // Bound the shared atlas independently of article count and GPU limits.
  const scale = Math.min(
    requestedScale,
    maxTextureSize / Math.max(logicalWidth, logicalHeight),
    Math.sqrt((lowPower ? 3_000_000 : 6_000_000) / (logicalWidth * logicalHeight)),
  )
  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(logicalWidth * scale)
  canvas.height = Math.floor(logicalHeight * scale)
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) {
    throw new Error('Canvas 2D is unavailable')
  }
  context.scale(canvas.width / logicalWidth, canvas.height / logicalHeight)

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearMipmapLinearFilter
  texture.magFilter = LinearFilter

  const gutter = 4
  const rects: ArchiveSpineAtlasRect[] = Array.from(
    { length: articleCount },
    (_, index) => {
      const x = (index % columns) * spineAtlasCellWidth
      const y = Math.floor(index / columns) * spineAtlasCellHeight
      return {
        x,
        y,
        u0: (x + gutter) / logicalWidth,
        u1: (x + spineAtlasCellWidth - gutter) / logicalWidth,
        v0: 1 - (y + spineAtlasCellHeight - gutter) / logicalHeight,
        v1: 1 - (y + gutter) / logicalHeight,
      }
    },
  )

  return {
    canvas,
    context,
    texture,
    rects,
    logicalWidth,
    logicalHeight,
    paintKey: '',
  }
}

export type ArchiveSpineAtlas = ReturnType<typeof createSpineAtlas>

const truncateLabelText = (
  context: CanvasRenderingContext2D,
  title: string,
  maxWidth: number,
) => {
  const normalized = title.trim().replace(/\s+/g, ' ')
  if (context.measureText(normalized).width <= maxWidth) {
    return normalized
  }

  const characters = Array.from(normalized)
  let lower = 0
  let upper = characters.length
  while (lower < upper) {
    const middle = Math.ceil((lower + upper) / 2)
    const candidate = `${characters.slice(0, middle).join('').trimEnd()}…`
    if (context.measureText(candidate).width <= maxWidth) {
      lower = middle
    } else {
      upper = middle - 1
    }
  }
  return `${characters.slice(0, lower).join('').trimEnd()}…`
}

export const paintSpineAtlas = (
  atlas: ArchiveSpineAtlas,
  articles: ArchiveSceneArticle[],
  titleFontFamily: string,
  styles: ArchiveBookStyle[],
) => {
  if (atlas.paintKey === titleFontFamily) {
    return
  }
  atlas.paintKey = titleFontFamily

  const { context } = atlas
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, atlas.logicalWidth, atlas.logicalHeight)
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.letterSpacing = '0px'
  for (let index = 0; index < articles.length; index++) {
    const rect = atlas.rects[index]
    if (!rect) {
      continue
    }
    const style = styles[index]
    paintArchivePaper(context, style, rect.x, rect.y, spineAtlasCellWidth, spineAtlasCellHeight)
    const paperLabel = style.variant === 1
    const titleTop = paperLabel ? 45 : 38
    const titleBottom = paperLabel ? 329 : 338
    const maxTitleWidth = titleBottom - titleTop - 14
    context.strokeStyle = style.rule
    context.lineWidth = 0.8
    if (paperLabel) {
      context.fillStyle = style.label
      context.fillRect(rect.x + 8, rect.y + 38, spineAtlasCellWidth - 16, 298)
      context.strokeStyle = style.labelRule
      context.strokeRect(rect.x + 10, rect.y + 40, spineAtlasCellWidth - 20, 294)
    } else {
      context.beginPath()
      context.moveTo(rect.x + 12, rect.y + 31)
      context.lineTo(rect.x + spineAtlasCellWidth - 12, rect.y + 31)
      context.moveTo(rect.x + 12, rect.y + 345)
      context.lineTo(rect.x + spineAtlasCellWidth - 12, rect.y + 345)
      context.stroke()
    }
    context.fillStyle = style.muted
    context.font = `600 12px ${titleFontFamily}`
    context.fillText(style.number, rect.x + spineAtlasCellWidth / 2, rect.y + 19)
    context.font = `500 10px ${titleFontFamily}`
    const year = new Date(articles[index].date).getFullYear()
    if (Number.isFinite(year)) {
      context.fillText(String(year), rect.x + spineAtlasCellWidth / 2, rect.y + 362)
    }
    context.fillStyle = paperLabel ? style.labelInk : style.ink
    const normalizedTitle = articles[index].title.trim().replace(/\s+/g, ' ')
    context.font = `600 ${spineTitleMaxFontSize}px ${titleFontFamily}`
    const naturalWidth = context.measureText(normalizedTitle).width
    const proportionalSize = naturalWidth > 0
      ? spineTitleMaxFontSize * Math.min(1, maxTitleWidth / naturalWidth)
      : spineTitleMaxFontSize
    // Preserve the full title whenever a modest reduction is enough. Only
    // after reaching the legibility floor do we fall back to an ellipsis.
    const fontSize = clamp(
      Math.floor(proportionalSize * 10) / 10,
      spineTitleMinFontSize,
      spineTitleMaxFontSize,
    )
    context.font = `600 ${fontSize}px ${titleFontFamily}`
    const title = truncateLabelText(
      context,
      normalizedTitle,
      maxTitleWidth,
    )
    context.save()
    context.translate(
      rect.x + spineAtlasCellWidth / 2,
      rect.y + (titleTop + titleBottom) / 2,
    )
    // The glyphs stay in normal horizontal typesetting; the complete line is
    // rotated onto the case so its baseline follows the spine's long axis.
    context.rotate(Math.PI / 2)
    context.fillText(title, 0, 0)
    context.restore()
  }
  atlas.texture.needsUpdate = true
}

export const createShelfSpineGeometry = (
  restMatrices: Matrix4[],
  spineLabelOffset: Matrix4,
  rects: ArchiveSpineAtlasRect[],
) => {
  const positions = new Float32Array(restMatrices.length * 4 * 3)
  const uvs = new Float32Array(restMatrices.length * 4 * 2)
  const indices: number[] = []
  const worldMatrix = new Matrix4()
  const point = new Vector3()
  const localPoints = [
    [-spineLabelWidth / 2, spineLabelHeight / 2, 0],
    [spineLabelWidth / 2, spineLabelHeight / 2, 0],
    [-spineLabelWidth / 2, -spineLabelHeight / 2, 0],
    [spineLabelWidth / 2, -spineLabelHeight / 2, 0],
  ] as const

  restMatrices.forEach((restMatrix, articleIndex) => {
    worldMatrix.multiplyMatrices(restMatrix, spineLabelOffset)
    const positionOffset = articleIndex * 12
    for (let vertexIndex = 0; vertexIndex < 4; vertexIndex++) {
      const local = localPoints[vertexIndex]
      point.set(local[0], local[1], local[2]).applyMatrix4(worldMatrix)
      point.toArray(positions, positionOffset + vertexIndex * 3)
    }

    const rect = rects[articleIndex]
    const uvOffset = articleIndex * 8
    uvs.set([
      rect.u0, rect.v1,
      rect.u1, rect.v1,
      rect.u0, rect.v0,
      rect.u1, rect.v0,
    ], uvOffset)

    const vertexOffset = articleIndex * 4
    indices.push(
      vertexOffset,
      vertexOffset + 2,
      vertexOffset + 1,
      vertexOffset + 2,
      vertexOffset + 3,
      vertexOffset + 1,
    )
  })

  const geometry = new BufferGeometry()
  const positionAttribute = new Float32BufferAttribute(positions, 3)
  positionAttribute.setUsage(DynamicDrawUsage)
  geometry.setAttribute('position', positionAttribute)
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()

  return { geometry, restPositions: positions.slice() }
}

export const paintArchiveLabel = (
  label: ArchiveLabel,
  article: ArchiveSceneArticle,
  index: number,
  locale: string,
  titleFontFamily: string,
  initialTitleFontSize: number,
  titleAlignment: 'left' | 'center',
  style: ArchiveBookStyle,
) => {
  const categoryTitle = article.categoryTitle?.trim()
    || article.category?.trim() || article._dir?.trim() || 'Uncategorized'
  const paintKey = `${index}:${categoryTitle}:${initialTitleFontSize.toFixed(2)}:${titleAlignment}:${titleFontFamily}`
  if (label.paintKey === paintKey) {
    return
  }
  label.paintKey = paintKey
  label.articleIndex = index

  const { context } = label
  paintArchiveCover(context, style, label.logicalWidth, label.logicalHeight)

  context.fillStyle = style.muted
  context.font = '600 16px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  context.textBaseline = 'top'
  context.textAlign = 'left'
  context.letterSpacing = '1.6px'
  context.fillText(
    truncateLabelText(context, categoryTitle.toLocaleUpperCase(locale), 306),
    40, 48,
  )

  context.textAlign = 'left'
  context.letterSpacing = '0px'
  const paperLabel = style.variant === 1
  const titleLeft = paperLabel ? 55 : 40
  const maxTitleWidth = paperLabel ? 274 : 304
  const alignment = style.variant === 0 ? 'center' : titleAlignment
  let fontSize = Math.max(26, initialTitleFontSize * (paperLabel ? 1 : 1.1))
  const titleSegments = segmentTitle(article.title)
  context.font = `600 ${fontSize}px ${titleFontFamily}`
  const widestSegment = Math.max(1, ...titleSegments.map((segment) => context.measureText(segment).width))
  fontSize *= Math.min(1, maxTitleWidth / widestSegment)
  let lines: string[] = []
  while (true) {
    context.font = `600 ${fontSize}px ${titleFontFamily}`
    lines = wrapTitle(context, titleSegments, maxTitleWidth, 6)
    if (lines.length <= 5 || fontSize <= 23) {
      break
    }
    fontSize -= 1
  }

  const lineHeight = fontSize * 1.23
  const blockHeight = lines.length * lineHeight
  const titleCenter = paperLabel ? 277 : style.variant === 3 ? 255 : 285
  const titleTop = style.variant === 2
    ? 182 + lineHeight / 2
    : titleCenter - blockHeight / 2 + lineHeight / 2
  let titleWidth = 1
  for (const line of lines) {
    titleWidth = Math.max(titleWidth, context.measureText(line).width)
  }
  const titleX = alignment === 'center' ? label.logicalWidth / 2 : titleLeft
  let y = titleTop
  label.titleBounds = {
    left: alignment === 'center' ? titleX - titleWidth / 2 : titleX,
    top: titleTop - lineHeight / 2,
    width: titleWidth,
    height: blockHeight,
  }
  context.fillStyle = paperLabel ? style.labelInk : style.ink
  context.textAlign = alignment
  context.textBaseline = 'middle'
  for (const line of lines) {
    context.fillText(line, titleX, y)
    y += lineHeight
  }

  context.fillStyle = style.muted
  context.font = '500 16px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  context.textAlign = 'left'
  context.textBaseline = 'bottom'
  context.fillText(formatDate(article.date, locale), 40, 528)
  label.texture.needsUpdate = true
}

export const createYearLabelTexture = (
  year: string,
  titleFontFamily: string,
) => {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 160
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Canvas 2D is unavailable')
  }

  context.clearRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#666d74'
  context.font = `500 80px ${titleFontFamily}`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(year, canvas.width / 2, canvas.height / 2)

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearMipmapLinearFilter
  texture.magFilter = LinearFilter
  texture.needsUpdate = true
  return texture
}
