import assert from 'node:assert/strict'
import test from 'node:test'
import { archiveRenderPixelRatio } from '../lib/archive-render-quality.ts'

test('3x phone screens retain native text resolution in portrait and landscape', () => {
  for (const [width, height] of [[393, 690], [430, 932], [932, 430]]) {
    const ratio = archiveRenderPixelRatio(width, height, 3, false)
    assert.equal(ratio, 3, `${width}×${height} must not upscale a low-resolution canvas`)
  }
})

test('large displays remain within the framebuffer budget without supersampling 1x screens', () => {
  for (const lowMemory of [false, true]) {
    const ratio = archiveRenderPixelRatio(3840, 2160, 2, lowMemory)
    const pixels = Math.floor(3840 * ratio) * Math.floor(2160 * ratio)
    assert.ok(pixels <= (lowMemory ? 2_000_000 : 4_000_000))
    assert.equal(archiveRenderPixelRatio(393, 690, 1, lowMemory), 1)
  }
})
