export const caseWidth = 3.15
export const caseHeight = 4.6
export const caseDepth = 0.64
export const spinePitch = 0.88
export const shelfY = -0.28
export const shelfZ = -1.3
export const shelfVerticalPitch = 7.8
export const pullDistance = 3.3
// The presented cover swings open from its spine, so its centre ends up to
// the right of the slot it came from. The camera is offset by the same amount.
export const presentedOffsetX = 1.12
export const presentedLift = 0.56
export const pulledLift = 0.14
export const cameraDepthOffset = pullDistance * 0.42
export const alignedCameraOffset = pullDistance - cameraDepthOffset
export const cameraY = 0.72
// Artwork is laid out in these logical units and fills its whole face, so the
// proportions match the cover (width x height) and the spine (depth x height).
export const labelLogicalWidth = 394
export const labelLogicalHeight = 576
export const spineCellWidth = 56
export const spineCellHeight = 402
export const spineTitleMaxFontSize = 26
export const spineTitleMinFontSize = 18
export const yearLabelWidth = 2
export const yearLabelHeight = 0.64
export const yearLabelX = -3.55
export const yearLabelYOffset = 1.95

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export const mix = (from: number, to: number, progress: number) =>
  from + (to - from) * progress

export const smootherstep = (edge0: number, edge1: number, value: number) => {
  const progress = clamp((value - edge0) / (edge1 - edge0), 0, 1)
  return progress * progress * progress * (progress * (progress * 6 - 15) + 10)
}

export const indexVariance = (index: number) => {
  const value = Math.sin((index + 1) * 91.173) * 43758.5453
  return (value - Math.floor(value)) * 2 - 1
}
