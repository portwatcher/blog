import { archiveInstanceFloats, createInkTexture } from './archive-gl'
import type { ArchiveBoxGeometry, ArchiveInkTexture } from './archive-gl'
import { archiveDistance, archivePullAt } from './archive-presentation'
import {
  createArchiveLabel,
  createSpineSheet,
  paintArchiveLabel,
  paintSpineSheet,
} from './archive-scene-assets'
import type { ArchiveLabel, ArchiveSpineSheet } from './archive-scene-assets'
import type { ArchiveBookStyle } from './archive-scene-books'
import type { ArchiveSceneMotion } from './archive-scene-motion'
import type { ArchiveShelves } from './archive-scene-shelves'
import type { ArchiveSceneArticle, ArchiveSceneFrame } from './archive-scene-types'

interface ArchiveActiveBooksOptions {
  gl: WebGL2RenderingContext
  box: ArchiveBoxGeometry
  shelves: ArchiveShelves
  motion: ArchiveSceneMotion
  articles: ArchiveSceneArticle[]
  styles: ArchiveBookStyle[]
  lowPower: boolean
  maxTextureSize: number
  anisotropy: number
  locale: string
  titleFontFamily: () => string
}

// A cover is the largest texture in the scene. Three hold the book in front
// and the two it most recently replaced, so flipping back repaints nothing.
const coverLimit = 3
const closeUpLimit = 2
// Past this speed a book is in front of the reader for a few frames only, so
// its cover is not worth painting unless it is where browsing will stop.
const paintBelowSpeed = 9

export const createArchiveActiveBooks = (options: ArchiveActiveBooksOptions) => {
  const {
    gl, box, shelves, motion, articles, styles, lowPower, maxTextureSize, anisotropy,
    locale, titleFontFamily,
  } = options
  const data = new Float32Array(archiveInstanceFloats)
  const buffer = gl.createBuffer()
  if (!buffer) {
    throw new Error('Buffer could not be created')
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW)
  const vertexArray = box.createVertexArray(buffer)
  const blank = createInkTexture(gl, 1)
  // Textures are made the first time they are needed, never up front.
  const covers: Array<{ label: ArchiveLabel; texture: ArchiveInkTexture; articleIndex: number }> = []
  const closeUps: Array<{
    sheet: ArchiveSpineSheet; texture: ArchiveInkTexture; articleIndex: number; painted: number
  }> = []
  const indices: number[] = []
  let titleFontSize = 27
  let titleAlignment: 'left' | 'center' = 'center'

  const nearestFirst = (frame: ArchiveSceneFrame) =>
    [...indices].sort((a, b) => Math.abs(frame.position - a) - Math.abs(frame.position - b))

  // Gives each book worth it a painted cover. Returns true while one is still
  // waiting, having painted at most one this frame.
  const assignCovers = (frame: ArchiveSceneFrame) => {
    const wanted = nearestFirst(frame)
      .filter((index) => index === frame.selectedIndex || frame.speed < paintBelowSpeed)
    for (const cover of covers) {
      if (!wanted.includes(cover.articleIndex)) {
        cover.articleIndex = -1
      }
    }
    let painted = false
    let pending = false
    for (const index of wanted) {
      if (covers.some((cover) => cover.articleIndex === index)) {
        continue
      }
      // A cover that still holds this book's artwork comes back for free.
      let cover = covers.find((item) => item.articleIndex < 0
        && item.label.articleIndex === index && item.label.paintKey)
      if (!cover && painted) {
        pending = true
        continue
      }
      cover ??= covers.find((item) => item.articleIndex < 0)
      if (!cover && covers.length < coverLimit) {
        cover = {
          label: createArchiveLabel(lowPower, maxTextureSize),
          texture: createInkTexture(gl, anisotropy),
          articleIndex: -1,
        }
        covers.push(cover)
      }
      if (!cover) {
        continue
      }
      cover.articleIndex = index
      if (paintArchiveLabel(
        cover.label, articles[index], index, locale, titleFontFamily(),
        titleFontSize, titleAlignment, styles[index],
      )) {
        cover.texture.upload(cover.label.canvas)
        painted = true
      }
    }
    return { painted, pending }
  }

  // The book in front gets a sharper spine than the shelf sheet can give it.
  const assignCloseUp = (frame: ArchiveSceneFrame, busy: boolean) => {
    const index = nearestFirst(frame)[0]
    if (index === undefined || !covers.some((cover) => cover.articleIndex === index)
      || closeUps.some((closeUp) => closeUp.articleIndex === index)) {
      return false
    }
    if (busy) {
      return true
    }
    let closeUp = closeUps.length < closeUpLimit ? undefined
      : closeUps.reduce((oldest, item) => item.painted < oldest.painted ? item : oldest)
    if (!closeUp) {
      closeUp = {
        sheet: createSpineSheet(1, lowPower, maxTextureSize, lowPower ? 3 : 4.5),
        texture: createInkTexture(gl, anisotropy),
        articleIndex: -1,
        painted: 0,
      }
      closeUps.push(closeUp)
    }
    closeUp.articleIndex = index
    closeUp.painted = performance.now()
    paintSpineSheet(closeUp.sheet, [articles[index]], titleFontFamily(), [styles[index]])
    closeUp.texture.upload(closeUp.sheet.canvas)
    return false
  }

  return {
    get indices(): readonly number[] {
      return indices
    },
    setTypography(fontSize: number, alignment: 'left' | 'center') {
      titleFontSize = fontSize
      titleAlignment = alignment
    },
    labelFor(articleIndex: number): ArchiveLabel | null {
      return covers.find((cover) => cover.articleIndex === articleIndex)?.label ?? null
    },
    // Works out which books are out of their row this frame and gets their
    // artwork ready. Reports whether it painted and whether more is queued.
    sync(frame: ArchiveSceneFrame) {
      indices.length = 0
      const lower = Math.floor(frame.position)
      for (const index of [lower, lower + 1]) {
        if (index >= frame.firstIndex && index <= frame.lastIndex
          && archivePullAt(archiveDistance(frame.position, frame.presence, index)) > 0) {
          indices.push(index)
        }
      }
      const { painted, pending } = assignCovers(frame)
      const waiting = assignCloseUp(frame, painted)
      return { painted, pending: pending || waiting }
    },
    draw(frame: ArchiveSceneFrame, indexCount: number) {
      gl.bindVertexArray(vertexArray)
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      for (const index of indices) {
        const pose = motion.getPose(index, frame)
        data.set(pose.matrix)
        const closeUp = closeUps.find((item) => item.articleIndex === index)
        const spine = shelves.spineOf(index)
        const rect = closeUp ? closeUp.sheet.rects[0] : spine.rect
        data[16] = rect?.u0 ?? 0
        data[17] = rect?.v0 ?? 0
        data[18] = rect?.u1 ?? 0
        data[19] = rect?.v1 ?? 0
        const cover = covers.find((item) => item.articleIndex === index)
        data[20] = 0
        data[21] = 0
        data[22] = 1
        data[23] = 1
        data[24] = cover ? 1 : 0
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, data)
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, closeUp?.texture.texture ?? spine.texture ?? blank.texture)
        gl.activeTexture(gl.TEXTURE1)
        gl.bindTexture(gl.TEXTURE_2D, cover?.texture.texture ?? blank.texture)
        gl.drawElementsInstanced(gl.TRIANGLES, indexCount, gl.UNSIGNED_SHORT, 0, 1)
      }
    },
    refreshTypography() {
      for (const cover of covers) {
        cover.label.paintKey = ''
        cover.articleIndex = -1
      }
      for (const closeUp of closeUps) {
        closeUp.articleIndex = -1
      }
    },
    destroy() {
      gl.deleteBuffer(buffer)
      gl.deleteVertexArray(vertexArray)
      blank.destroy()
      for (const cover of covers) {
        cover.texture.destroy()
      }
      for (const closeUp of closeUps) {
        closeUp.texture.destroy()
      }
    },
  }
}

export type ArchiveActiveBooks = ReturnType<typeof createArchiveActiveBooks>
