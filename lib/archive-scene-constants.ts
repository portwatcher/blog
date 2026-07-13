export const caseWidth = 3.15
export const caseHeight = 4.6
export const caseDepth = 0.64
export const spinePitch = 0.88
export const shelfY = -0.28
export const shelfZ = -1.3
export const shelfVerticalPitch = 7.8
export const pullDistance = 3.3
export const browsingPullRatio = 0.15
export const turnStart = 0.58
export const cameraDepthOffset = pullDistance * 0.42
export const alignedCameraOffset = pullDistance - cameraDepthOffset
export const cameraY = 0.72
export const labelWidth = caseWidth * 0.94
export const labelHeight = caseHeight * 0.955
export const spineLabelWidth = caseDepth * 0.86
export const spineLabelHeight = caseHeight * 0.9
export const labelLogicalWidth = 384
export const labelLogicalHeight = 576
export const labelTextureScale = 1.5
export const spineAtlasCellWidth = 56
export const spineAtlasCellHeight = 384
export const spineAtlasTextureScale = 1.25
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
