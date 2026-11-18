import { archiveInstanceFloats, createInkTexture } from './archive-gl'
import type { ArchiveBoxGeometry, ArchiveInkTexture } from './archive-gl'
import { transformPoint } from './archive-math'
import type { Mat4, Vec3 } from './archive-math'
import { createSpineSheet, paintSpineSheet } from './archive-scene-assets'
import type { ArchiveSheetRect, ArchiveSpineSheet } from './archive-scene-assets'
import type { ArchiveBookStyle } from './archive-scene-books'
import { caseDepth, caseHeight, caseWidth } from './archive-scene-constants'
import type { ArchiveSceneLayout } from './archive-scene-layout'
import type { ArchiveSceneArticle } from './archive-scene-types'

interface ArchiveShelfOptions {
  gl: WebGL2RenderingContext
  box: ArchiveBoxGeometry
  layout: ArchiveSceneLayout
  articles: ArchiveSceneArticle[]
  styles: ArchiveBookStyle[]
  lowPower: boolean
  maxTextureSize: number
  anisotropy: number
  titleFontFamily: () => string
}

// True unless every corner of the box is beyond the same side of the view.
export const boxInView = (viewProjection: Mat4, min: Vec3, max: Vec3) => {
  const m = viewProjection
  let outside = 63
  for (let corner = 0; corner < 8 && outside; corner++) {
    const x = corner & 1 ? max[0] : min[0]
    const y = corner & 2 ? max[1] : min[1]
    const z = corner & 4 ? max[2] : min[2]
    const cx = m[0] * x + m[4] * y + m[8] * z + m[12]
    const cy = m[1] * x + m[5] * y + m[9] * z + m[13]
    const cz = m[2] * x + m[6] * y + m[10] * z + m[14]
    const cw = m[3] * x + m[7] * y + m[11] * z + m[15]
    outside &= (cx < -cw ? 1 : 0) | (cx > cw ? 2 : 0) | (cy < -cw ? 4 : 0)
      | (cy > cw ? 8 : 0) | (cz < -cw ? 16 : 0) | (cz > cw ? 32 : 0)
  }
  return outside === 0
}

const floats = archiveInstanceFloats
const hidden = new Float32Array(16)

export const createArchiveShelves = (options: ArchiveShelfOptions) => {
  const {
    gl, box, layout, articles, styles, lowPower, maxTextureSize, anisotropy, titleFontFamily,
  } = options
  const articleSlots = new Map<number, { shelfIndex: number; slot: number }>()
  const corner: Vec3 = [0, 0, 0]
  const shelves = layout.shelfGroups.map(({ articleIndices }, shelfIndex) => {
    const data = new Float32Array(articleIndices.length * floats)
    const min: Vec3 = [Infinity, Infinity, Infinity]
    const max: Vec3 = [-Infinity, -Infinity, -Infinity]
    articleIndices.forEach((articleIndex, slot) => {
      const matrix = layout.restMatrices[articleIndex]
      data.set(matrix, slot * floats)
      articleSlots.set(articleIndex, { shelfIndex, slot })
      for (let index = 0; index < 8; index++) {
        corner[0] = (index & 1 ? 0.5 : -0.5) * caseWidth
        corner[1] = (index & 2 ? 0.5 : -0.5) * caseHeight
        corner[2] = (index & 4 ? 0.5 : -0.5) * caseDepth
        transformPoint(corner, matrix, corner)
        for (let axis = 0; axis < 3; axis++) {
          min[axis] = Math.min(min[axis], corner[axis])
          max[axis] = Math.max(max[axis], corner[axis])
        }
      }
    })
    const buffer = gl.createBuffer()
    if (!buffer) {
      throw new Error('Buffer could not be created')
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW)
    return {
      articleIndices,
      data,
      buffer,
      vertexArray: box.createVertexArray(buffer),
      // The row's bounds at rest. A book taken out of the row must not shrink
      // them, or the rest of the row could be culled around it.
      min,
      max,
      visible: false,
      sheet: null as ArchiveSpineSheet | null,
      texture: null as ArchiveInkTexture | null,
      painted: false,
    }
  })
  let activeArticles: number[] = []

  // A row's spines are painted the first time it is about to be seen, so
  // opening the archive only pays for the shelf in front of the reader.
  const prepare = (shelfIndex: number) => {
    const shelf = shelves[shelfIndex]
    if (shelf.painted) {
      return false
    }
    if (!shelf.sheet || !shelf.texture) {
      shelf.sheet = createSpineSheet(shelf.articleIndices.length, lowPower, maxTextureSize)
      shelf.texture = createInkTexture(gl, anisotropy)
      shelf.sheet.rects.forEach((rect, slot) => {
        shelf.data.set([rect.u0, rect.v0, rect.u1, rect.v1], slot * floats + 16)
      })
      gl.bindBuffer(gl.ARRAY_BUFFER, shelf.buffer)
      gl.bufferData(gl.ARRAY_BUFFER, shelf.data, gl.DYNAMIC_DRAW)
    }
    paintSpineSheet(
      shelf.sheet,
      shelf.articleIndices.map((index) => articles[index]),
      titleFontFamily(),
      shelf.articleIndices.map((index) => styles[index]),
    )
    shelf.texture.upload(shelf.sheet.canvas)
    shelf.painted = true
    return true
  }

  const setArticleVisible = (articleIndex: number, visible: boolean) => {
    const place = articleSlots.get(articleIndex)
    if (!place) {
      return
    }
    const shelf = shelves[place.shelfIndex]
    const matrix = visible ? layout.restMatrices[articleIndex] : hidden
    shelf.data.set(matrix, place.slot * floats)
    gl.bindBuffer(gl.ARRAY_BUFFER, shelf.buffer)
    gl.bufferSubData(gl.ARRAY_BUFFER, place.slot * floats * 4, matrix)
  }

  return {
    shelves,
    // Books being animated leave their static slot and are drawn separately.
    syncActiveArticles(indices: readonly number[]) {
      const next = indices.filter(
        (index, slot) => articleSlots.has(index) && indices.indexOf(index) === slot,
      )
      for (const index of activeArticles) {
        if (!next.includes(index)) {
          setArticleVisible(index, true)
        }
      }
      for (const index of next) {
        if (!activeArticles.includes(index)) {
          setArticleVisible(index, false)
        }
      }
      activeArticles = next
    },
    isActive: (articleIndex: number) => activeArticles.includes(articleIndex),
    updateVisibility(viewProjection: Mat4) {
      for (const shelf of shelves) {
        shelf.visible = boxInView(viewProjection, shelf.min, shelf.max)
      }
    },
    // Draws every row in view. Returns true when a row had to be painted, so
    // the caller can tell a paint hitch from a slow frame.
    draw(indexCount: number) {
      let painted = false
      shelves.forEach((shelf, shelfIndex) => {
        if (!shelf.visible) {
          return
        }
        painted = prepare(shelfIndex) || painted
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, shelf.texture?.texture ?? null)
        gl.bindVertexArray(shelf.vertexArray)
        gl.drawElementsInstanced(
          gl.TRIANGLES, indexCount, gl.UNSIGNED_SHORT, 0, shelf.articleIndices.length,
        )
      })
      return painted
    },
    // Paints one row that has not been seen yet, nearest the rows in view
    // first. Called when the browser is idle; returns whether more remain.
    warm() {
      const waiting = shelves
        .map((shelf, shelfIndex) => ({ shelf, shelfIndex }))
        .filter(({ shelf }) => !shelf.painted)
      if (!waiting.length) {
        return false
      }
      const inView = shelves.findIndex((shelf) => shelf.visible)
      waiting.sort((a, b) =>
        Math.abs(a.shelfIndex - inView) - Math.abs(b.shelfIndex - inView))
      prepare(waiting[0].shelfIndex)
      return waiting.length > 1
    },
    // The shelf texture and rectangle a book's spine can be drawn from.
    spineOf(articleIndex: number): { texture: WebGLTexture | null; rect: ArchiveSheetRect | null } {
      const place = articleSlots.get(articleIndex)
      const shelf = place ? shelves[place.shelfIndex] : null
      return {
        texture: shelf?.painted ? shelf.texture?.texture ?? null : null,
        rect: place && shelf?.sheet ? shelf.sheet.rects[place.slot] : null,
      }
    },
    refreshTypography() {
      for (const shelf of shelves) {
        shelf.painted = false
      }
    },
    destroy() {
      for (const shelf of shelves) {
        gl.deleteBuffer(shelf.buffer)
        gl.deleteVertexArray(shelf.vertexArray)
        shelf.texture?.destroy()
      }
    },
  }
}

export type ArchiveShelves = ReturnType<typeof createArchiveShelves>
