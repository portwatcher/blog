import {
  BufferGeometry,
  CanvasTexture,
  DynamicDrawUsage,
  Float32BufferAttribute,
  LinearFilter,
  Matrix4,
  SRGBColorSpace,
  Vector3,
} from 'three'
import {
  clamp,
  labelLogicalHeight,
  labelLogicalWidth,
  labelTextureScale,
  spineAtlasCellHeight,
  spineAtlasCellWidth,
  spineAtlasTextureScale,
  spineLabelHeight,
  spineLabelWidth,
  spineTitleMaxFontSize,
  spineTitleMinFontSize,
} from './archive-scene-constants'
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

const wrapTitle = (
  context: CanvasRenderingContext2D,
  title: string,
  maxWidth: number,
  maxLines: number,
) => {
  const segments = /\s/.test(title)
    ? title.trim().split(/\s+/)
    : Array.from(title.trim())
  const separator = /\s/.test(title) ? ' ' : ''
  const lines: string[] = []
  let line = ''

  for (const segment of segments) {
    const candidate = line ? `${line}${separator}${segment}` : segment
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line)
      line = segment
    } else {
      line = candidate
    }

    if (lines.length === maxLines) {
      break
    }
  }

  if (line && lines.length < maxLines) {
    lines.push(line)
  }
  if (
    lines.length === maxLines
    && segments.join(separator) !== lines.join(separator)
  ) {
    let last = lines[maxLines - 1]
    while (
      last.length > 1
      && context.measureText(`${last}…`).width > maxWidth
    ) {
      last = last.slice(0, -1)
    }
    lines[maxLines - 1] = `${last}…`
  }

  return lines
}

export const createArchiveLabel = () => {
  const canvas = document.createElement('canvas')
  canvas.width = labelLogicalWidth * labelTextureScale
  canvas.height = labelLogicalHeight * labelTextureScale
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) {
    throw new Error('Canvas 2D is unavailable')
  }
  context.scale(labelTextureScale, labelTextureScale)

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.generateMipmaps = false
  texture.minFilter = LinearFilter
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

export const createSpineAtlas = (articleCount: number) => {
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
  const canvas = document.createElement('canvas')
  canvas.width = logicalWidth * spineAtlasTextureScale
  canvas.height = logicalHeight * spineAtlasTextureScale
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) {
    throw new Error('Canvas 2D is unavailable')
  }
  context.scale(spineAtlasTextureScale, spineAtlasTextureScale)

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.generateMipmaps = false
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter

  const gutter = 2
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

const truncateSpineTitle = (
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
) => {
  if (atlas.paintKey === titleFontFamily) {
    return
  }
  atlas.paintKey = titleFontFamily

  const { context } = atlas
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, atlas.logicalWidth, atlas.logicalHeight)
  context.fillStyle = '#20252a'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.letterSpacing = '0px'
  const maxTitleWidth = spineAtlasCellHeight - 34

  for (let index = 0; index < articles.length; index++) {
    const rect = atlas.rects[index]
    if (!rect) {
      continue
    }
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
    const title = truncateSpineTitle(
      context,
      normalizedTitle,
      maxTitleWidth,
    )
    context.save()
    context.translate(
      rect.x + spineAtlasCellWidth / 2,
      rect.y + spineAtlasCellHeight / 2,
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
  count: number,
  locale: string,
  archiveLabel: string,
  titleFontFamily: string,
  initialTitleFontSize: number,
  titleAlignment: 'left' | 'center',
) => {
  const paintKey = `${index}:${initialTitleFontSize.toFixed(2)}:${titleAlignment}:${titleFontFamily}`
  if (label.paintKey === paintKey) {
    return
  }
  label.paintKey = paintKey
  label.articleIndex = index

  const { context } = label
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, label.logicalWidth, label.logicalHeight)

  context.strokeStyle = '#dadee3'
  context.lineWidth = 2
  context.strokeRect(
    18,
    18,
    label.logicalWidth - 36,
    label.logicalHeight - 36,
  )

  context.fillStyle = '#5e646b'
  context.font = '600 18px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  context.textBaseline = 'top'
  context.letterSpacing = '2px'
  context.fillText(archiveLabel.toLocaleUpperCase(locale), 36, 39)
  context.textAlign = 'right'
  context.fillText(
    `${String(index + 1).padStart(2, '0')} / ${String(count).padStart(2, '0')}`,
    348,
    39,
  )

  context.textAlign = 'left'
  context.letterSpacing = '0px'
  let fontSize = initialTitleFontSize
  let lines: string[] = []
  do {
    context.font = `700 ${fontSize}px ${titleFontFamily}`
    lines = wrapTitle(context, article.title, 306, 5)
    fontSize -= 2
  } while (lines.length > 4 && fontSize > 30)

  const lineHeight = (fontSize + 2) * 1.14
  const blockHeight = lines.length * lineHeight
  const titleTop = (label.logicalHeight - blockHeight) * 0.48
  let titleWidth = 1
  for (const line of lines) {
    titleWidth = Math.max(titleWidth, context.measureText(line).width)
  }
  const titleX = titleAlignment === 'center' ? label.logicalWidth / 2 : 36
  let y = titleTop
  label.titleBounds = {
    left: titleAlignment === 'center' ? titleX - titleWidth / 2 : titleX,
    top: titleTop - lineHeight / 2,
    width: titleWidth,
    height: blockHeight,
  }
  context.fillStyle = '#0e1217'
  context.textAlign = titleAlignment
  context.textBaseline = 'middle'
  for (const line of lines) {
    context.fillText(line, titleX, y)
    y += lineHeight
  }

  context.fillStyle = '#5e646b'
  context.font = '500 18px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  context.textAlign = 'left'
  context.textBaseline = 'bottom'
  context.fillText(formatDate(article.date, locale), 36, 532)
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
  texture.generateMipmaps = false
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.needsUpdate = true
  return texture
}
