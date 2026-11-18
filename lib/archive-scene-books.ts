import type { ArchiveSceneArticle } from './archive-scene-types'

export const archiveInk = '#14171a'
export const archivePaper = '#ffffff'

export const archiveBookSeed = (article: ArchiveSceneArticle) => {
  let seed = 2166136261
  for (const character of `${article.title}:${article.date}`) {
    seed = Math.imul(seed ^ character.charCodeAt(0), 16777619)
  }
  return seed >>> 0
}

export const archiveCategoryKey = (article: ArchiveSceneArticle) =>
  (article._dir || article.category || article.categoryTitle || '').trim().toLowerCase()

// The sheets of screentone a category can be marked with. With no colour to
// spend, a category is told apart by the texture of its tone.
export const archiveTones = [
  'dots', 'lines', 'hatch', 'coarse', 'cross', 'pinstripe', 'check', 'solid',
] as const

export type ArchiveTone = typeof archiveTones[number]

export const createArchiveBookStyles = (articles: ArchiveSceneArticle[]) => {
  // Sorted keys keep a category's tone stable across locales and reloads.
  const categories = Array.from(new Set(articles.map(archiveCategoryKey))).sort()
  return articles.map((article, index) => ({
    tone: archiveTones[categories.indexOf(archiveCategoryKey(article)) % archiveTones.length],
    number: String(index + 1).padStart(2, '0'),
  }))
}

export type ArchiveBookStyle = ReturnType<typeof createArchiveBookStyles>[number]

const ruled = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  pitch: number,
  weight: number,
  slope: number,
) => {
  // Lines are drawn long enough to cross the clipped area at any slope.
  context.lineWidth = weight
  context.beginPath()
  const reach = Math.abs(slope) * height
  for (let offset = -reach; offset < width + reach; offset += pitch) {
    context.moveTo(x + offset, y + height)
    context.lineTo(x + offset + slope * height, y)
  }
  context.stroke()
}

const dotted = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  pitch: number,
  radius: number,
) => {
  context.beginPath()
  let row = 0
  for (let dy = pitch / 2; dy < height + pitch; dy += pitch / 2, row++) {
    for (let dx = (row % 2) * pitch / 2; dx < width + pitch; dx += pitch) {
      context.moveTo(x + dx + radius, y + dy)
      context.arc(x + dx, y + dy, radius, 0, Math.PI * 2)
    }
  }
  context.fill()
}

// Fills a rectangle with a sheet of tone, drawn as real ink marks so it prints
// crisply close up and settles to an even grey from the shelf.
export const paintArchiveTone = (
  context: CanvasRenderingContext2D,
  tone: ArchiveTone,
  x: number,
  y: number,
  width: number,
  height: number,
) => {
  context.save()
  context.beginPath()
  context.rect(x, y, width, height)
  context.clip()
  context.fillStyle = archiveInk
  context.strokeStyle = archiveInk
  if (tone === 'dots') {
    dotted(context, x, y, width, height, 5, 1.15)
  } else if (tone === 'coarse') {
    dotted(context, x, y, width, height, 9, 2.5)
  } else if (tone === 'lines') {
    context.lineWidth = 1.3
    context.beginPath()
    for (let dy = 2; dy < height; dy += 4.5) {
      context.moveTo(x, y + dy)
      context.lineTo(x + width, y + dy)
    }
    context.stroke()
  } else if (tone === 'hatch') {
    ruled(context, x, y, width, height, 5, 1.2, 1)
  } else if (tone === 'cross') {
    ruled(context, x, y, width, height, 6.5, 1, 1)
    ruled(context, x, y, width, height, 6.5, 1, -1)
  } else if (tone === 'pinstripe') {
    ruled(context, x, y, width, height, 4.5, 1.3, 0)
  } else if (tone === 'check') {
    for (let dy = 0, row = 0; dy < height; dy += 5, row++) {
      for (let dx = (row % 2) * 5; dx < width; dx += 10) {
        context.fillRect(x + dx, y + dy, 5, 5)
      }
    }
  } else {
    context.fillRect(x, y, width, height)
  }
  context.restore()
}
