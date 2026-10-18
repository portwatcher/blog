import {
  BoxGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  MeshStandardMaterial,
  NoColorSpace,
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
  const heading = new Color(theme?.heading ?? 0x20242b)
  const border = new Color(theme?.border ?? 0xdfe1e5)
  // Distinct bookcloth and paper stocks, with the site's ink and porcelain
  // tying the collection together. The difference survives a phone viewport.
  const stocks = [
    new Color(0xe8dfcc).lerp(surface, 0.12),
    new Color(0xb9c7d0).lerp(surface, 0.08),
    new Color(0xc9c3b6).lerp(surface, 0.08),
    heading.clone().lerp(new Color(0x697781), 0.36),
    surface.clone().lerp(new Color(0xd1d6d3), 0.28),
  ]
  const availableStocks: number[] = []
  return articles.map((article, index) => {
    const seed = archiveBookSeed(article)
    // Mix the hash's high and low bits so related dates don't cluster stocks.
    let choice = Math.imul(seed ^ (seed >>> 16), 0x85ebca6b)
    choice = Math.imul(choice ^ (choice >>> 13), 0xc2b2ae35)
    choice = (choice ^ (choice >>> 16)) >>> 0
    // Distribute each stock through a small run before repeating it. This
    // prevents similar titles/dates from producing an indistinguishable shelf.
    if (!availableStocks.length) {
      availableStocks.push(...stocks.map((_, stockIndex) => stockIndex))
    }
    const [variant] = availableStocks.splice(choice % availableStocks.length, 1)
    const color = stocks[variant].clone()
    const dark = variant === 3
    const ink = dark ? surface.clone() : heading.clone()
    const muted = ink.clone().lerp(color, dark ? 0.22 : 0.3)
    const rule = ink.clone().lerp(color, dark ? 0.57 : 0.72)
    return {
      seed, variant, dark, color, paper: color.getStyle(),
      ink: ink.getStyle(), muted: muted.getStyle(), rule: rule.getStyle(),
      label: surface.clone().lerp(new Color(0xf0eadc), 0.3).getStyle(),
      labelInk: heading.getStyle(), labelRule: border.getStyle(),
      number: String(index + 1).padStart(2, '0'),
      cloth: variant === 1 || variant === 2 || dark,
    }
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
  context.fillStyle = style.dark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(30, 34, 38, 0.045)'
  let seed = style.seed
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  for (let grain = 0; grain < width * height / 42; grain++) {
    context.fillRect(x + random() * width, y + random() * height, 0.7, 0.7)
  }
  if (style.cloth) {
    context.fillStyle = style.dark ? 'rgba(255, 255, 255, 0.026)' : 'rgba(30, 34, 38, 0.025)'
    for (let thread = 0; thread < width; thread += 2.5) {
      context.fillRect(x + thread, y, 0.45, height)
    }
    for (let thread = 0; thread < height; thread += 3) {
      context.fillRect(x, y + thread, width, 0.4)
    }
  }
}

export const paintArchiveCover = (
  context: CanvasRenderingContext2D,
  style: ArchiveBookStyle,
  width: number,
  height: number,
) => {
  paintArchivePaper(context, style, 0, 0, width, height)
  // A shallow pressed hinge, rather than a flat rectangle pasted on the case.
  const crease = context.createLinearGradient(8, 0, 19, 0)
  crease.addColorStop(0, 'rgba(20, 24, 28, 0)')
  crease.addColorStop(0.45, 'rgba(20, 24, 28, 0.12)')
  crease.addColorStop(0.6, 'rgba(255, 255, 255, 0.18)')
  crease.addColorStop(1, 'rgba(255, 255, 255, 0)')
  context.fillStyle = crease
  context.fillRect(8, 0, 11, height)
  context.strokeStyle = style.rule
  context.lineWidth = 0.8
  if (style.variant === 0 || style.variant === 3) {
    context.strokeRect(27, 24, width - 51, height - 48)
  } else if (style.variant === 1) {
    // A mounted paper title label over blue-grey woven bookcloth.
    context.fillStyle = 'rgba(20, 24, 28, 0.09)'
    context.fillRect(36, 151, width - 68, 256)
    context.fillStyle = style.label
    context.fillRect(34, 149, width - 68, 256)
    context.strokeStyle = style.labelRule
    context.strokeRect(42, 157, width - 84, 240)
  } else if (style.variant === 2) {
    context.beginPath()
    context.moveTo(38, 132)
    context.lineTo(width - 34, 132)
    context.moveTo(38, 137)
    context.lineTo(96, 137)
    context.stroke()
  } else {
    context.beginPath()
    context.moveTo(38, 93)
    context.lineTo(width - 34, 93)
    context.moveTo(38, height - 98)
    context.lineTo(width - 34, height - 98)
    context.stroke()
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
      const grain = (seed / 4294967296) * 7
      const cut = x >= 128 ? (x % 3 === 0 ? 22 : 0) : (x % 3 === 0 || y % 4 === 0 ? 5 : 0)
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
  const paperMask = new Float32Array(normal.count).fill(paper ? 1 : 0)
  const color = new Color(0xffffff)
  for (let index = 0; index < uv.count; index++) {
    const u = uv.getX(index)
    const v = uv.getY(index)
    const top = paper && Math.abs(normal.getY(index)) > 0.5
    uv.setXY(index, (paper ? 0.51 : 0.01) + (top ? v : u) * 0.48,
      0.02 + (top ? u : v) * 0.96)
    color.toArray(colors, index * 3)
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.setAttribute('paperMask', new Float32BufferAttribute(paperMask, 1))
  return geometry
}

export const createArchiveBookModel = () => {
  const boardDepth = 0.075
  const board = () => new RoundedBoxGeometry(caseWidth, caseHeight, boardDepth, 2, 0.028)
  const pageBox = new BoxGeometry(caseWidth - 0.17, caseHeight - 0.19, caseDepth - boardDepth * 2 - 0.025)
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
  const clothTexture = texture.clone()
  clothTexture.colorSpace = NoColorSpace
  clothTexture.repeat.set(0.48, 0.96)
  clothTexture.offset.set(0.01, 0.02)
  clothTexture.needsUpdate = true
  const material = new MeshStandardMaterial({
    color: 0xffffff,
    map: texture,
    vertexColors: true,
    bumpMap: clothTexture,
    bumpScale: 0.012,
    roughness: 0.88,
    metalness: 0,
  })
  // Page edges stay ivory even on a dark cover, for both shelf instances and
  // active books. Keep this in the shared material to preserve one shelf draw.
  material.onBeforeCompile = (shader) => {
    shader.uniforms.archivePageColor = { value: new Color(0xf6f1e7) }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float paperMask;\nvarying float vPaperMask;')
      .replace('#include <color_vertex>', '#include <color_vertex>\nvPaperMask = paperMask;\nvColor.rgb = mix(vColor.rgb, vec3(1.0), paperMask);')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vPaperMask;\nuniform vec3 archivePageColor;')
      .replace('#include <map_fragment>', 'diffuseColor.rgb = mix(diffuseColor.rgb, archivePageColor, vPaperMask);\n#include <map_fragment>')
  }
  material.customProgramCacheKey = () => 'archive-paper-edges-v1'
  return { geometry, material, texture, clothTexture }
}
