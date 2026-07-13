import type {
  PerspectiveCamera,
  WebGLRenderer,
} from 'three'
import {
  alignedCameraOffset,
  caseDepth,
  caseHeight,
  caseWidth,
  clamp,
} from './archive-scene-constants'

interface ResizeArchiveSceneViewportOptions {
  camera: PerspectiveCamera
  height: number
  lowPower: boolean
  renderer: WebGLRenderer
  width: number
}

export const resizeArchiveSceneViewport = (
  options: ResizeArchiveSceneViewportOptions,
) => {
  const {
    camera,
    height,
    lowPower,
    renderer,
    width,
  } = options
  // Mid-tier phones can afford a modest supersample and benefit much more
  // from it than desktop-sized viewports. Truly constrained devices retain a
  // smaller cap, while the pixel budget prevents tablets from scaling this
  // cost without bound.
  const maxRatio = lowPower ? 1.25 : 1.75
  const pixelBudgetRatio = Math.sqrt(1_500_000 / (width * height))
  const ratio = Math.min(
    window.devicePixelRatio || 1,
    maxRatio,
    pixelBudgetRatio,
  )
  renderer.setPixelRatio(ratio)
  renderer.setSize(width, height, false)

  camera.aspect = width / height
  const articleTitleWidth = Math.max(1, Math.min(width - 32, 704))
  const articleTitleFontSize = width <= 640
    ? 30.4
    : clamp(27.52 + width * 0.0115, 32, 44)
  const cardTitleFontSize = clamp(
    306 * articleTitleFontSize / articleTitleWidth,
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
  const halfFovTangent = Math.tan((camera.fov * Math.PI) / 360)
  const verticalDistance = (visibleHeight / 2) / halfFovTangent
  const safeGutter = Math.min(32, Math.max(16, width * 0.06))
  const usableWidth = Math.max(0.5, 1 - safeGutter * 2 / width)
  const presentedWidth = caseWidth * Math.abs(Math.cos(0.4))
    + caseHeight * Math.abs(Math.sin(-0.1))
    + caseDepth * Math.abs(Math.sin(0.4))
  const requiredVisibleWidth = presentedWidth / usableWidth
  const horizontalDistance = requiredVisibleWidth
    / Math.max(0.001, 2 * halfFovTangent * camera.aspect)
    + alignedCameraOffset

  camera.updateProjectionMatrix()
  return {
    cameraDistance: Math.max(verticalDistance, horizontalDistance),
    cardTitleAlignment,
    cardTitleFontSize,
  }
}
