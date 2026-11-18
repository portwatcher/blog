import { mat4Perspective } from './archive-math'
import { archiveRenderPixelRatio } from './archive-render-quality'
import {
  alignedCameraOffset,
  caseDepth,
  caseHeight,
  caseWidth,
  clamp,
  labelLogicalWidth,
} from './archive-scene-constants'
import type { ArchiveCamera } from './archive-scene-types'

interface ResizeArchiveSceneViewportOptions {
  camera: ArchiveCamera
  canvas: HTMLCanvasElement
  height: number
  lowPower: boolean
  // Lowered by the engine when a device cannot keep up at full resolution.
  quality: number
  width: number
}

export const resizeArchiveSceneViewport = (
  options: ResizeArchiveSceneViewportOptions,
) => {
  const {
    camera,
    canvas,
    height,
    lowPower,
    quality,
    width,
  } = options
  const pixelRatio = Math.max(
    0.75,
    archiveRenderPixelRatio(width, height, window.devicePixelRatio || 1, lowPower) * quality,
  )
  canvas.width = Math.max(1, Math.floor(width * pixelRatio))
  canvas.height = Math.max(1, Math.floor(height * pixelRatio))

  camera.aspect = width / height
  const articleTitleWidth = Math.max(1, Math.min(width - 32, 704))
  const articleTitleFontSize = width <= 640
    ? 30.4
    : clamp(27.52 + width * 0.0115, 32, 44)
  // The cover title is set at the size it will have on the article page, so
  // opening an article can hand the title over without a change of scale.
  const cardTitleFontSize = clamp(
    (labelLogicalWidth - 80) * articleTitleFontSize / articleTitleWidth,
    21,
    30,
  )
  const cardTitleAlignment: 'left' | 'center' = width <= 640
    ? 'left'
    : 'center'
  const compactLandscape = height < 500 && camera.aspect > 1.5
  const visibleHeight = compactLandscape
    ? 7.9
    : camera.aspect < 0.62
      ? 9.6
      : camera.aspect < 0.9
        ? 8.9
        : camera.aspect > 1.75
          ? 7.5
          : 8.1
  const halfFovTangent = Math.tan(camera.fieldOfView / 2)
  const verticalDistance = (visibleHeight / 2) / halfFovTangent
  const safeGutter = Math.min(32, Math.max(16, width * 0.06))
  const usableWidth = Math.max(0.5, 1 - safeGutter * 2 / width)
  const presentedWidth = caseWidth * Math.abs(Math.cos(0.42))
    + caseHeight * Math.abs(Math.sin(0.13))
    + caseDepth * Math.abs(Math.sin(0.42))
  const requiredVisibleWidth = presentedWidth / usableWidth
  const horizontalDistance = requiredVisibleWidth
    / Math.max(0.001, 2 * halfFovTangent * camera.aspect)
    + alignedCameraOffset

  mat4Perspective(camera.projection, camera.fieldOfView, camera.aspect, 0.1, 64)
  return {
    cameraDistance: Math.max(verticalDistance, horizontalDistance),
    cardTitleAlignment,
    cardTitleFontSize,
    pixelRatio,
  }
}
