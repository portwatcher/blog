import {
  archiveInk,
  archivePaper,
  paintArchiveTone,
} from './archive-scene-books'
import type { ArchiveBookStyle } from './archive-scene-books'
import {
  clamp,
  labelLogicalHeight,
  labelLogicalWidth,
  spineCellHeight,
  spineCellWidth,
  spineTitleMaxFontSize,
  spineTitleMinFontSize,
} from './archive-scene-constants'
import type {
  ArchiveSceneArticle,
  ArchiveTitleBounds,
} from './archive-scene-types'

// One layout for every cover, drawn as a manga panel: a framed page with a
// caption box, the title alone in the middle and a strip of tone at the foot.
// Nothing is drawn that does not tell the reader something.
const panelInset = 14
const coverMargin = 40
export const coverTitleWidth = labelLogicalWidth - coverMargin * 2
const coverTitleCenter = 262
const footHeight = 46
const sans = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'

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

// A canvas addressed in logical units, whatever resolution it is backed by.
const createInkCanvas = (logicalWidth: number, logicalHeight: number, scale: number) => {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(logicalWidth * scale))
  canvas.height = Math.max(1, Math.round(logicalHeight * scale))
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) {
    throw new Error('Canvas 2D is unavailable')
  }
  context.scale(canvas.width / logicalWidth, canvas.height / logicalHeight)
  return { canvas, context, logicalWidth, logicalHeight }
}

export const createArchiveLabel = (lowPower: boolean, maxTextureSize: number) => ({
  ...createInkCanvas(
    labelLogicalWidth,
    labelLogicalHeight,
    Math.min(lowPower ? 2 : 3, maxTextureSize / labelLogicalHeight),
  ),
  articleIndex: -1,
  paintKey: '',
  titleBounds: {
    left: coverMargin,
    top: 190,
    width: coverTitleWidth,
    height: 120,
  } satisfies ArchiveTitleBounds,
})

export type ArchiveLabel = ReturnType<typeof createArchiveLabel>

// Where one spine sits in its sheet, as texture coordinates.
export interface ArchiveSheetRect {
  u0: number
  v0: number
  u1: number
  v1: number
  x: number
  y: number
}

// A sheet holds the spines of one row, so a row costs one texture and one
// draw however many books it has, and is only painted once it comes into view.
export const createSpineSheet = (
  count: number,
  lowPower: boolean,
  maxTextureSize: number,
  requestedScale = lowPower ? 1.75 : 2.25,
) => {
  const fit = Math.max(1, Math.floor(maxTextureSize / (spineCellWidth * requestedScale)))
  const columns = Math.max(1, Math.min(count, fit))
  const rows = Math.max(1, Math.ceil(count / columns))
  const logicalWidth = columns * spineCellWidth
  const logicalHeight = rows * spineCellHeight
  const scale = Math.min(
    requestedScale,
    maxTextureSize / Math.max(logicalWidth, logicalHeight),
    Math.sqrt((lowPower ? 3_000_000 : 6_000_000) / (logicalWidth * logicalHeight)),
  )
  // Sampling stops half a logical pixel inside each cell, short of its
  // neighbour in the sheet.
  const inset = 0.5
  const rects: ArchiveSheetRect[] = Array.from({ length: count }, (_, index) => {
    const x = (index % columns) * spineCellWidth
    const y = Math.floor(index / columns) * spineCellHeight
    return {
      x,
      y,
      u0: (x + inset) / logicalWidth,
      u1: (x + spineCellWidth - inset) / logicalWidth,
      v0: 1 - (y + spineCellHeight - inset) / logicalHeight,
      v1: 1 - (y + inset) / logicalHeight,
    }
  })
  return { ...createInkCanvas(logicalWidth, logicalHeight, scale), rects }
}

export type ArchiveSpineSheet = ReturnType<typeof createSpineSheet>

const toneTop = spineCellHeight - 72
const toneHeight = 30

export const paintSpineSheet = (
  sheet: ArchiveSpineSheet,
  articles: ArchiveSceneArticle[],
  titleFontFamily: string,
  styles: ArchiveBookStyle[],
) => {
  const { context } = sheet
  context.fillStyle = archivePaper
  context.fillRect(0, 0, sheet.logicalWidth, sheet.logicalHeight)
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.letterSpacing = '0px'
  const titleTop = 46
  const titleBottom = toneTop - 12
  const maxTitleWidth = titleBottom - titleTop
  for (let index = 0; index < articles.length; index++) {
    const rect = sheet.rects[index]
    if (!rect) {
      continue
    }
    const style = styles[index]
    const center = rect.x + spineCellWidth / 2
    context.fillStyle = archiveInk
    context.strokeStyle = archiveInk
    context.font = `700 12px ${titleFontFamily}`
    context.fillText(style.number, center, rect.y + 21)
    context.lineWidth = 1.4
    context.beginPath()
    context.moveTo(rect.x + 10, rect.y + 35)
    context.lineTo(rect.x + spineCellWidth - 10, rect.y + 35)
    // The category's sheet of tone, ruled off above and below.
    context.moveTo(rect.x, rect.y + toneTop - 1.5)
    context.lineTo(rect.x + spineCellWidth, rect.y + toneTop - 1.5)
    context.moveTo(rect.x, rect.y + toneTop + toneHeight + 1.5)
    context.lineTo(rect.x + spineCellWidth, rect.y + toneTop + toneHeight + 1.5)
    context.stroke()
    paintArchiveTone(context, style.tone, rect.x, rect.y + toneTop, spineCellWidth, toneHeight)
    context.fillStyle = archiveInk
    context.font = `700 10px ${titleFontFamily}`
    const year = new Date(articles[index].date).getFullYear()
    if (Number.isFinite(year)) {
      context.fillText(String(year), center, rect.y + spineCellHeight - 21)
    }
    const normalizedTitle = articles[index].title.trim().replace(/\s+/g, ' ')
    context.font = `700 ${spineTitleMaxFontSize}px ${titleFontFamily}`
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
    context.font = `700 ${fontSize}px ${titleFontFamily}`
    const title = truncateLabelText(context, normalizedTitle, maxTitleWidth)
    context.save()
    context.translate(center, rect.y + (titleTop + titleBottom) / 2)
    // The glyphs stay in normal horizontal typesetting; the complete line is
    // rotated onto the case so its baseline follows the spine's long axis.
    context.rotate(Math.PI / 2)
    context.fillText(title, 0, 0)
    context.restore()
  }
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
    return false
  }
  label.paintKey = paintKey
  label.articleIndex = index

  const { context } = label
  const width = label.logicalWidth
  const height = label.logicalHeight
  const panelRight = width - panelInset
  const footTop = height - panelInset - footHeight
  context.fillStyle = archivePaper
  context.fillRect(0, 0, width, height)

  context.letterSpacing = '0px'
  let fontSize = Math.max(26, initialTitleFontSize * 1.1)
  const titleSegments = segmentTitle(article.title)
  context.font = `700 ${fontSize}px ${titleFontFamily}`
  const widestSegment = Math.max(1, ...titleSegments.map((segment) => context.measureText(segment).width))
  fontSize *= Math.min(1, coverTitleWidth / widestSegment)
  let lines: string[] = []
  while (true) {
    context.font = `700 ${fontSize}px ${titleFontFamily}`
    lines = wrapTitle(context, titleSegments, coverTitleWidth, 6)
    if (lines.length <= 5 || fontSize <= 23) {
      break
    }
    fontSize -= 1
  }
  const lineHeight = fontSize * 1.23
  const blockHeight = lines.length * lineHeight
  const titleTop = coverTitleCenter - blockHeight / 2 + lineHeight / 2
  let titleWidth = 1
  for (const line of lines) {
    titleWidth = Math.max(titleWidth, context.measureText(line).width)
  }
  const titleX = titleAlignment === 'center' ? width / 2 : coverMargin
  label.titleBounds = {
    left: titleAlignment === 'center' ? titleX - titleWidth / 2 : titleX,
    top: titleTop - lineHeight / 2,
    width: titleWidth,
    height: blockHeight,
  }

  context.fillStyle = archiveInk
  context.textAlign = titleAlignment
  context.textBaseline = 'middle'
  let y = titleTop
  for (const line of lines) {
    context.fillText(line, titleX, y)
    y += lineHeight
  }

  // The caption box: the category, reversed out of solid ink.
  context.font = `700 13px ${sans}`
  context.letterSpacing = '1.6px'
  context.textAlign = 'left'
  context.textBaseline = 'top'
  const caption = truncateLabelText(context, categoryTitle.toLocaleUpperCase(locale), coverTitleWidth - 40)
  const captionWidth = context.measureText(caption).width + 26
  context.fillRect(panelInset, panelInset, captionWidth, 30)
  context.fillStyle = archivePaper
  context.fillText(caption, panelInset + 13, panelInset + 9)

  // The foot of the panel: the date, then the category's sheet of tone.
  context.letterSpacing = '0px'
  context.fillStyle = archivePaper
  context.fillRect(panelInset, footTop, width - panelInset * 2, footHeight)
  context.fillStyle = archiveInk
  context.font = `700 14px ${sans}`
  context.textBaseline = 'bottom'
  const date = formatDate(article.date, locale)
  context.fillText(date, panelInset + 14, footTop + footHeight / 2 + 9)
  const toneLeft = Math.min(panelRight - 60, panelInset + 28 + context.measureText(date).width)
  paintArchiveTone(context, style.tone, toneLeft, footTop, panelRight - toneLeft, footHeight)

  context.strokeStyle = archiveInk
  context.lineWidth = 2.2
  context.beginPath()
  context.moveTo(panelInset, footTop)
  context.lineTo(panelRight, footTop)
  context.moveTo(toneLeft, footTop)
  context.lineTo(toneLeft, footTop + footHeight)
  context.stroke()
  context.strokeRect(panelInset, panelInset, width - panelInset * 2, height - panelInset * 2)
  return true
}

const yearCellWidth = 250
const yearCellHeight = 80

// Every year marker on one small sheet.
export const createYearSheet = (years: string[], titleFontFamily: string) => {
  const sheet = createInkCanvas(yearCellWidth, yearCellHeight * Math.max(1, years.length), 2)
  const { context } = sheet
  const paint = (fontFamily: string) => {
    context.fillStyle = archivePaper
    context.fillRect(0, 0, sheet.logicalWidth, sheet.logicalHeight)
    context.fillStyle = archiveInk
    context.font = `700 44px ${fontFamily}`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    years.forEach((year, index) => {
      context.fillText(year, yearCellWidth / 2, yearCellHeight * (index + 0.5) + 2)
    })
  }
  paint(titleFontFamily)
  const rects = years.map((_, index) => ({
    u0: 0,
    u1: 1,
    v0: 1 - (index + 1) / years.length,
    v1: 1 - index / years.length,
  }))
  return { ...sheet, rects, paint }
}
