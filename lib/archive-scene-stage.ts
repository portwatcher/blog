import { archiveInstanceFloats, createInkTexture } from './archive-gl'
import type { ArchiveBoxGeometry, ArchiveProgram } from './archive-gl'
import { createMat4, mat4Compose } from './archive-math'
import { createYearSheet } from './archive-scene-assets'
import {
  caseHeight,
  caseWidth,
  mix,
  shelfY,
  shelfZ,
  yearLabelHeight,
  yearLabelWidth,
  yearLabelX,
  yearLabelYOffset,
} from './archive-scene-constants'
import type { ArchiveSceneLayout } from './archive-scene-layout'
import type { ArchiveCasePose } from './archive-scene-types'

interface ArchiveStageOptions {
  gl: WebGL2RenderingContext
  box: ArchiveBoxGeometry
  layout: ArchiveSceneLayout
  anisotropy: number
  titleFontFamily: () => string
}

const floats = archiveInstanceFloats
const shelfLineHeight = 0.034
const cardDepth = 0.03
const frontZ = shelfZ + caseWidth / 2

// The fixed furniture of the scene: an inked ground line under each row, a
// boxed year marker beside it, and the bloom of paper-white behind whichever
// cover is open.
export const createArchiveStage = (options: ArchiveStageOptions) => {
  const { gl, box, layout, anisotropy, titleFontFamily } = options
  const count = layout.shelfGroups.length
  const matrix = createMat4()

  const createInstances = (fill: (data: Float32Array, shelfIndex: number) => void) => {
    const data = new Float32Array(count * floats)
    for (let shelfIndex = 0; shelfIndex < count; shelfIndex++) {
      fill(data.subarray(shelfIndex * floats, (shelfIndex + 1) * floats), shelfIndex)
    }
    const buffer = gl.createBuffer()
    if (!buffer) {
      throw new Error('Buffer could not be created')
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
    return { buffer, vertexArray: box.createVertexArray(buffer) }
  }

  const yearSheet = createYearSheet(layout.shelfGroups.map((group) => group.year), titleFontFamily())
  const yearTexture = createInkTexture(gl, anisotropy)
  yearTexture.upload(yearSheet.canvas)
  const cards = createInstances((data, shelfIndex) => {
    mat4Compose(matrix, [
      yearLabelX,
      (layout.shelfCenterYPositions[shelfIndex] ?? shelfY) + yearLabelYOffset,
      frontZ,
    ], [0, 0, 0, 1], [1, 1, 1])
    data.set(matrix)
    const rect = yearSheet.rects[shelfIndex]
    data.set([rect.u0, rect.v0, rect.u1, rect.v1], 20)
  })
  const lines = createInstances((data, shelfIndex) => {
    const group = layout.shelfGroups[shelfIndex]
    const first = layout.shelfXPositions[group.articleIndices[0]] ?? 0
    const last = layout.shelfXPositions[group.articleIndices.at(-1) ?? 0] ?? 0
    // Long enough to run off both sides of any screen.
    mat4Compose(matrix, [
      (first + last) / 2,
      layout.shelfCenterYPositions[shelfIndex] - caseHeight / 2 - shelfLineHeight / 2,
      frontZ,
    ], [0, 0, 0, 1], [last - first + 160, 1, 1])
    data.set(matrix)
  })

  const glowBuffer = gl.createBuffer()
  const glowArray = gl.createVertexArray()
  gl.bindVertexArray(glowArray)
  gl.bindBuffer(gl.ARRAY_BUFFER, glowBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  gl.bindVertexArray(null)

  return {
    // Drawn with the book program already in use.
    drawFurniture(program: ArchiveProgram, indexCount: number) {
      gl.uniform1i(program.uniform('uKind'), 1)
      gl.uniform3f(program.uniform('uSize'), yearLabelWidth, yearLabelHeight, cardDepth)
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, yearTexture.texture)
      gl.bindVertexArray(cards.vertexArray)
      gl.drawElementsInstanced(gl.TRIANGLES, indexCount, gl.UNSIGNED_SHORT, 0, count)
      gl.uniform1i(program.uniform('uKind'), 2)
      gl.uniform3f(program.uniform('uSize'), 1, shelfLineHeight, shelfLineHeight)
      gl.bindVertexArray(lines.vertexArray)
      gl.drawElementsInstanced(gl.TRIANGLES, indexCount, gl.UNSIGNED_SHORT, 0, count)
    },
    // Blended over the row and behind anything nearer than the row.
    drawGlow(program: ArchiveProgram, pose: ArchiveCasePose | null) {
      if (!pose || pose.swing < 0.01) {
        return
      }
      gl.uniform3f(program.uniform('uCenter'), pose.center[0], pose.center[1], frontZ + 0.05)
      gl.uniform2f(
        program.uniform('uExtent'),
        caseWidth * mix(0.7, 1.55, pose.swing),
        caseHeight * 1.12,
      )
      gl.uniform1f(program.uniform('uStrength'), 0.94 * pose.swing)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      gl.depthMask(false)
      gl.bindVertexArray(glowArray)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      gl.depthMask(true)
      gl.disable(gl.BLEND)
    },
    refreshTypography() {
      yearSheet.paint(titleFontFamily())
      yearTexture.upload(yearSheet.canvas)
    },
    destroy() {
      for (const item of [cards, lines]) {
        gl.deleteBuffer(item.buffer)
        gl.deleteVertexArray(item.vertexArray)
      }
      gl.deleteBuffer(glowBuffer)
      gl.deleteVertexArray(glowArray)
      yearTexture.destroy()
    },
  }
}

export type ArchiveStage = ReturnType<typeof createArchiveStage>
