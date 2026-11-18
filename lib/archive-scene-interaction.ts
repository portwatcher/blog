import { createMat4, mat4Invert, mat4Multiply, transformDirection, transformPoint } from './archive-math'
import type { Mat4, Vec3 } from './archive-math'
import type { ArchiveLabel } from './archive-scene-assets'
import {
  caseDepth,
  caseHeight,
  caseWidth,
} from './archive-scene-constants'
import type { ArchiveSceneLayout } from './archive-scene-layout'
import type { ArchiveSceneMotion } from './archive-scene-motion'
import type { ArchiveShelves } from './archive-scene-shelves'
import type {
  ArchiveCamera,
  ArchiveSceneFrame,
  ArchiveSceneRects,
} from './archive-scene-types'

interface ArchiveSceneInteractionOptions {
  camera: ArchiveCamera
  shelves: ArchiveShelves
  layout: ArchiveSceneLayout
  getActive: () => readonly number[]
  getFrame: () => ArchiveSceneFrame
  getSize: () => { width: number, height: number }
  host: HTMLElement
  labelFor: (articleIndex: number) => ArchiveLabel | null
  motion: ArchiveSceneMotion
}

const half: Vec3 = [caseWidth / 2, caseHeight / 2, caseDepth / 2]

// How far along a ray it enters a book, or Infinity if it misses. The ray is
// taken into the book's own space, where the book is an axis-aligned box.
export const rayHitsBook = (inverse: Mat4, model: Mat4, origin: Vec3, direction: Vec3) => {
  if (!mat4Invert(inverse, model)) {
    return Infinity
  }
  const [ox, oy, oz] = transformPoint(localOrigin, inverse, origin)
  const [dx, dy, dz] = transformDirection(localDirection, inverse, direction)
  let enter = 0
  let exit = Infinity
  for (const [start, step, extent] of [[ox, dx, half[0]], [oy, dy, half[1]], [oz, dz, half[2]]]) {
    if (Math.abs(step) < 1e-9) {
      if (Math.abs(start) > extent) {
        return Infinity
      }
      continue
    }
    const a = (-extent - start) / step
    const b = (extent - start) / step
    enter = Math.max(enter, Math.min(a, b))
    exit = Math.min(exit, Math.max(a, b))
  }
  return enter <= exit ? enter : Infinity
}

const localOrigin: Vec3 = [0, 0, 0]
const localDirection: Vec3 = [0, 0, 0]

export const createArchiveSceneInteraction = (
  options: ArchiveSceneInteractionOptions,
) => {
  const {
    camera,
    shelves,
    layout,
    getActive,
    getFrame,
    getSize,
    host,
    labelFor,
    motion,
  } = options
  const projected: Vec3 = [0, 0, 0]
  const far: Vec3 = [0, 0, 0]
  const direction: Vec3 = [0, 0, 0]
  const inverse = createMat4()
  const combined = createMat4()

  const projectBounds = (
    matrix: Mat4,
    minLocalX: number,
    maxLocalX: number,
    minLocalY: number,
    maxLocalY: number,
    minLocalZ: number,
    maxLocalZ: number,
  ) => {
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    const zSteps = minLocalZ === maxLocalZ ? 1 : 2
    const { width, height } = getSize()
    mat4Multiply(combined, camera.viewProjection, matrix)

    for (let xStep = 0; xStep < 2; xStep++) {
      for (let yStep = 0; yStep < 2; yStep++) {
        for (let zStep = 0; zStep < zSteps; zStep++) {
          projected[0] = xStep === 0 ? minLocalX : maxLocalX
          projected[1] = yStep === 0 ? minLocalY : maxLocalY
          projected[2] = zStep === 0 ? minLocalZ : maxLocalZ
          transformPoint(projected, combined, projected)
          const screenX = (projected[0] * 0.5 + 0.5) * width
          const screenY = (-projected[1] * 0.5 + 0.5) * height
          minX = Math.min(minX, screenX)
          minY = Math.min(minY, screenY)
          maxX = Math.max(maxX, screenX)
          maxY = Math.max(maxY, screenY)
        }
      }
    }

    const hostRect = host.getBoundingClientRect()
    return new DOMRect(
      hostRect.left + minX,
      hostRect.top + minY,
      Math.max(1, maxX - minX),
      Math.max(1, maxY - minY),
    )
  }

  const getActiveRects = (): ArchiveSceneRects => {
    const frame = getFrame()
    if (frame.selectedIndex === null) {
      return { surfaceRect: new DOMRect(), titleRect: new DOMRect() }
    }
    const pose = motion.getPose(frame.selectedIndex, frame)
    const surfaceRect = projectBounds(
      pose.matrix, -half[0], half[0], -half[1], half[1], -half[2], half[2],
    )
    const label = labelFor(frame.selectedIndex)
    if (!label) {
      return { surfaceRect, titleRect: surfaceRect }
    }
    // The cover artwork fills the whole front face.
    const bounds = label.titleBounds
    const titleRect = projectBounds(
      pose.matrix,
      (bounds.left / label.logicalWidth - 0.5) * caseWidth,
      ((bounds.left + bounds.width) / label.logicalWidth - 0.5) * caseWidth,
      (0.5 - (bounds.top + bounds.height) / label.logicalHeight) * caseHeight,
      (0.5 - bounds.top / label.logicalHeight) * caseHeight,
      half[2],
      half[2],
    )
    return { surfaceRect, titleRect }
  }

  const pickArticleAt = (clientX: number, clientY: number) => {
    const rect = host.getBoundingClientRect()
    if (
      rect.width <= 0
      || rect.height <= 0
      || clientX < rect.left
      || clientX > rect.right
      || clientY < rect.top
      || clientY > rect.bottom
    ) {
      return null
    }
    if (!mat4Invert(inverse, camera.viewProjection)) {
      return null
    }
    far[0] = ((clientX - rect.left) / rect.width) * 2 - 1
    far[1] = -((clientY - rect.top) / rect.height) * 2 + 1
    far[2] = 1
    transformPoint(far, inverse, far)
    direction[0] = far[0] - camera.position[0]
    direction[1] = far[1] - camera.position[1]
    direction[2] = far[2] - camera.position[2]

    let nearest = Infinity
    let picked: number | null = null
    const consider = (articleIndex: number, model: Mat4) => {
      const distance = rayHitsBook(inverse, model, camera.position, direction)
      if (distance < nearest) {
        nearest = distance
        picked = articleIndex
      }
    }
    const frame = getFrame()
    for (const articleIndex of getActive()) {
      consider(articleIndex, motion.getPose(articleIndex, frame).matrix)
    }
    for (const shelf of shelves.shelves) {
      if (!shelf.visible) {
        continue
      }
      for (const articleIndex of shelf.articleIndices) {
        if (!shelves.isActive(articleIndex)) {
          consider(articleIndex, layout.restMatrices[articleIndex])
        }
      }
    }
    return picked
  }

  return {
    getActiveRects,
    pickArticleAt,
  }
}
