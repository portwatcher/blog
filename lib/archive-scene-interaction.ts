import {
  Raycaster,
  Vector2,
  Vector3,
} from 'three'
import type {
  InstancedMesh,
  Matrix4,
  Mesh,
  PerspectiveCamera,
} from 'three'
import type { ArchiveLabel } from './archive-scene-assets'
import {
  caseDepth,
  caseHeight,
  caseWidth,
  labelHeight,
  labelWidth,
} from './archive-scene-constants'
import type { ArchiveSceneMotion } from './archive-scene-motion'
import type {
  ArchiveSceneFrame,
  ArchiveSceneRects,
} from './archive-scene-types'

interface ArchiveSceneInteractionOptions {
  activeCases: Mesh[]
  camera: PerspectiveCamera
  cases: InstancedMesh
  getFrame: () => ArchiveSceneFrame
  getSize: () => { width: number, height: number }
  host: HTMLElement
  labels: ArchiveLabel[]
  motion: ArchiveSceneMotion
}

export const createArchiveSceneInteraction = (
  options: ArchiveSceneInteractionOptions,
) => {
  const {
    activeCases,
    camera,
    cases,
    getFrame,
    getSize,
    host,
    labels,
    motion,
  } = options
  const pickPoint = new Vector2()
  const raycaster = new Raycaster()
  const projectedPoint = new Vector3()

  const projectBounds = (
    matrix: Matrix4,
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

    for (let xStep = 0; xStep < 2; xStep++) {
      const localX = xStep === 0 ? minLocalX : maxLocalX
      for (let yStep = 0; yStep < 2; yStep++) {
        const localY = yStep === 0 ? minLocalY : maxLocalY
        for (let zStep = 0; zStep < zSteps; zStep++) {
          const localZ = zStep === 0 ? minLocalZ : maxLocalZ
          projectedPoint
            .set(localX, localY, localZ)
            .applyMatrix4(matrix)
            .project(camera)
          const screenX = (projectedPoint.x * 0.5 + 0.5) * width
          const screenY = (-projectedPoint.y * 0.5 + 0.5) * height
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
    const pose = motion.getPose(frame.selectedIndex, frame)
    const surfaceRect = projectBounds(
      pose.matrix,
      -caseWidth / 2,
      caseWidth / 2,
      -caseHeight / 2,
      caseHeight / 2,
      -caseDepth / 2,
      caseDepth / 2,
    )
    const activeLabel = labels[1].articleIndex === frame.selectedIndex
      ? labels[1]
      : labels[0]
    const bounds = activeLabel.titleBounds
    const titleLeft = (
      bounds.left / activeLabel.logicalWidth - 0.5
    ) * labelWidth
    const titleRight = (
      (bounds.left + bounds.width) / activeLabel.logicalWidth - 0.5
    ) * labelWidth
    const titleTop = (
      0.5 - bounds.top / activeLabel.logicalHeight
    ) * labelHeight
    const titleBottom = (
      0.5 - (bounds.top + bounds.height) / activeLabel.logicalHeight
    ) * labelHeight
    const titleRect = projectBounds(
      pose.matrix,
      titleLeft,
      titleRight,
      titleBottom,
      titleTop,
      caseDepth / 2 + 0.008,
      caseDepth / 2 + 0.008,
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

    pickPoint.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    )
    raycaster.setFromCamera(pickPoint, camera)
    const intersections = raycaster.intersectObjects(
      [cases, ...activeCases],
      false,
    )
    for (const intersection of intersections) {
      if (intersection.object === cases) {
        return intersection.instanceId ?? null
      }
      const articleIndex: unknown = intersection.object.userData.articleIndex
      if (
        typeof articleIndex === 'number'
        && Number.isInteger(articleIndex)
        && articleIndex >= 0
      ) {
        return articleIndex
      }
    }
    return null
  }

  return {
    getActiveRects,
    pickArticleAt,
  }
}
