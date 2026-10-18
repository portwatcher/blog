export const archiveRenderPixelRatio = (
  width: number,
  height: number,
  devicePixelRatio: number,
  lowMemory: boolean,
) => Math.min(
  devicePixelRatio,
  // Preserve native phone pixels; cap total work instead of imposing a
  // desktop-oriented DPR ceiling that blurs text on Retina screens.
  Math.sqrt((lowMemory ? 2_000_000 : 4_000_000) / (width * height)),
)
