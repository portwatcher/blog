import {
  BoxGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  MeshStandardMaterial,
  SRGBColorSpace,
} from 'three'
import type { BufferGeometry } from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { caseDepth, caseHeight, caseWidth } from './archive-scene-constants'
import type { ArchiveSceneArticle, ArchiveSceneTheme } from './archive-scene-types'

export const archiveBookSeed = (article: ArchiveSceneArticle) => {
  let seed = 2166136261
  for (const character of `${article.title}:${article.date}`) {
    seed = Math.imul(seed ^ character.charCodeAt(0), 16777619)
  }
  return seed >>> 0
}

export const createArchiveBookStyles = (
  articles: ArchiveSceneArticle[],
  theme?: ArchiveSceneTheme,
) => {
  const surface = new Color(theme?.surface ?? 0xfcfcfd)
  const subtle = new Color(theme?.subtle ?? 0xf3f4f5)
  const ink = new Color(theme?.heading ?? 0x20242b).getStyle()
  const muted = new Color(theme?.muted ?? 0x656a72).getStyle()
  const rule = new Color(theme?.border ?? 0xdfe1e5).getStyle()
  // Closely related paper stocks, all anchored to the site's own neutrals.
  const stocks = [
    surface.clone(),
    surface.clone().lerp(subtle, 0.65),
    surface.clone().lerp(new Color(0xdad5c9), 0.16),
    surface.clone().lerp(new Color(0xcbd2dc), 0.14),
    surface.clone().lerp(subtle, 0.3),
  ]
  return articles.map((article) => {
    const seed = archiveBookSeed(article)
    const color = stocks[seed % stocks.length].clone()
    return { seed, color, paper: color.getStyle(), ink, muted, rule, variant: seed % 3 }
  })
}

export type ArchiveBookStyle = ReturnType<typeof createArchiveBookStyles>[number]

export const paintArchivePaper = (
  context: CanvasRenderingContext2D,
  style: ArchiveBookStyle,
  x: number,
  y: number,
  width: number,
  height: number,
) => {
  context.fillStyle = style.paper
  context.fillRect(x, y, width, height)
  context.fillStyle = 'rgba(40, 42, 46, 0.018)'
  let seed = style.seed
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  for (let grain = 0; grain < width * height / 60; grain++) {
    context.fillRect(x + random() * width, y + random() * height, 0.6, 0.6)
  }
}

const createStockTexture = () => {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Canvas 2D is unavailable')
  }
  const pixels = context.createImageData(256, 256)
  let seed = 17
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      const grain = (seed / 4294967296) * 3
      const cut = x >= 128 && x % 3 === 0 ? 10 : 0
      const value = 255 - grain - cut
      const offset = (y * 256 + x) * 4
      pixels.data.set([value, value, value, 255], offset)
    }
  }
  context.putImageData(pixels, 0, 0)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

const finishPart = (geometry: BufferGeometry, paper: boolean) => {
  const uv = geometry.getAttribute('uv')
  const normal = geometry.getAttribute('normal')
  const colors = new Float32Array(normal.count * 3)
  const color = new Color(paper ? 0xfffcf6 : 0xffffff)
  for (let index = 0; index < uv.count; index++) {
    const u = uv.getX(index)
    const v = uv.getY(index)
    const top = paper && Math.abs(normal.getY(index)) > 0.5
    uv.setXY(index, (paper ? 0.51 : 0.01) + (top ? v : u) * 0.48,
      0.02 + (top ? u : v) * 0.96)
    color.toArray(colors, index * 3)
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  return geometry
}

export const createArchiveBookModel = () => {
  const boardDepth = 0.065
  const board = () => new RoundedBoxGeometry(caseWidth, caseHeight, boardDepth, 2, 0.022)
  const pageBox = new BoxGeometry(caseWidth - 0.13, caseHeight - 0.16, caseDepth - boardDepth * 2 - 0.025)
  const pages = pageBox.toNonIndexed().translate(0.015, 0, 0)
  pageBox.dispose()
  const parts = [
    finishPart(board().translate(0, 0, (caseDepth - boardDepth) / 2), false),
    finishPart(board().translate(0, 0, -(caseDepth - boardDepth) / 2), false),
    finishPart(pages, true),
    finishPart(new RoundedBoxGeometry(0.13, caseHeight, caseDepth, 2, 0.025)
      .translate(-(caseWidth - 0.13) / 2, 0, 0), false),
  ]
  const geometry = mergeGeometries(parts, false)
  parts.forEach((part) => part.dispose())
  if (!geometry) {
    throw new Error('Book geometry could not be assembled')
  }
  const texture = createStockTexture()
  const material = new MeshStandardMaterial({
    color: 0xffffff,
    map: texture,
    vertexColors: true,
    roughness: 0.88,
    metalness: 0,
  })
  return { geometry, material, texture }
}
