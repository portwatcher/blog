import { createBoxGeometry, createProgram } from './archive-gl'
import { createMat4 } from './archive-math'
import { createArchiveActiveBooks } from './archive-scene-active'
import { createArchiveBookStyles } from './archive-scene-books'
import {
  caseDepth,
  caseHeight,
  caseWidth,
  mix,
} from './archive-scene-constants'
import { createArchiveSceneInteraction } from './archive-scene-interaction'
import { createArchiveSceneLayout } from './archive-scene-layout'
import { createArchiveSceneMotion } from './archive-scene-motion'
import {
  bookFragmentShader,
  bookVertexShader,
  glowFragmentShader,
  glowVertexShader,
} from './archive-scene-shaders'
import { createArchiveShelves } from './archive-scene-shelves'
import { createArchiveStage } from './archive-scene-stage'
import type {
  ArchiveCamera,
  ArchiveSceneEngine,
  ArchiveSceneFrame,
  ArchiveSceneOptions,
} from './archive-scene-types'
import { resizeArchiveSceneViewport } from './archive-scene-viewport'

// The row keeps a little air even with nothing selected and steps back behind
// the paper-white of the page once a cover is open in front of it.
const restingHaze = 0.05
const focusedHaze = 0.46
const hazeLead = 0.9
// From the reader's upper left, as the page is usually lit in print.
const light = [-0.447, 0.596, 0.667]
const lineWidth = 1.1
// A device that cannot hold this frame time is given fewer pixels to fill.
const slowFrameSeconds = 0.024
const slowFramesAllowed = 8

const rgb = (color: number) =>
  [(color >> 16 & 255) / 255, (color >> 8 & 255) / 255, (color & 255) / 255] as const

export const createArchiveScene = (
  options: ArchiveSceneOptions,
): ArchiveSceneEngine => {
  const {
    canvas,
    context: gl,
    host,
    articles,
    lowPower,
    locale,
  } = options
  let fontFamily = options.titleFontFamily
    ?? '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  const titleFontFamily = () => fontFamily
  const background = rgb(options.backgroundColor ?? 0xfbfcfd)
  const ink = rgb(options.theme?.heading ?? 0x14171a)

  const bookProgram = createProgram(gl, bookVertexShader, bookFragmentShader)
  const glowProgram = createProgram(gl, glowVertexShader, glowFragmentShader)
  const box = createBoxGeometry(gl)
  const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number
  const filter = gl.getExtension('EXT_texture_filter_anisotropic')
  const anisotropy = filter
    ? Math.min(lowPower ? 4 : 8, gl.getParameter(filter.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number)
    : 1

  const layout = createArchiveSceneLayout(articles)
  const styles = createArchiveBookStyles(articles)
  // A restrained perspective keeps the cover readable while the moving camera
  // and the book's path out of the row provide the depth cues.
  const camera: ArchiveCamera = {
    fieldOfView: 40 * Math.PI / 180,
    aspect: 1,
    position: [0, 0, 0],
    view: createMat4(),
    projection: createMat4(),
    viewProjection: createMat4(),
  }
  const motion = createArchiveSceneMotion({ camera, layout })
  const shelves = createArchiveShelves({
    gl, box, layout, articles, styles, lowPower, maxTextureSize, anisotropy, titleFontFamily,
  })
  const active = createArchiveActiveBooks({
    gl, box, shelves, motion, articles, styles, lowPower, maxTextureSize, anisotropy,
    locale, titleFontFamily,
  })
  const stage = createArchiveStage({ gl, box, layout, anisotropy, titleFontFamily })

  let currentFrame: ArchiveSceneFrame = {
    position: 0,
    presence: 0,
    speed: 0,
    selectedIndex: null,
    firstIndex: 0,
    lastIndex: articles.length - 1,
    deltaSeconds: 0,
    selectionProgress: 0,
    hovered: false,
  }
  let width = 1
  let height = 1
  let pixelRatio = 1
  let quality = 1
  let slowFrames = 0
  let warming = 0
  let destroyed = false

  gl.enable(gl.DEPTH_TEST)
  gl.depthFunc(gl.LEQUAL)
  gl.enable(gl.CULL_FACE)
  gl.clearColor(background[0], background[1], background[2], 1)

  const resize = (force = false) => {
    const nextWidth = Math.max(1, Math.round(host.clientWidth))
    const nextHeight = Math.max(1, Math.round(host.clientHeight))
    if (!force && nextWidth === width && nextHeight === height) {
      return
    }

    width = nextWidth
    height = nextHeight
    const viewport = resizeArchiveSceneViewport({
      camera,
      canvas,
      height,
      lowPower,
      quality,
      width,
    })
    pixelRatio = viewport.pixelRatio
    active.setTypography(viewport.cardTitleFontSize, viewport.cardTitleAlignment)
    motion.setCameraDistance(viewport.cameraDistance)
    motion.update({ ...currentFrame, deltaSeconds: 0 })
  }

  // Rows that have not been seen yet are painted one at a time while the
  // browser is idle, so changing year does not wait on a canvas.
  const warm = () => {
    if (warming || destroyed) {
      return
    }
    const run = () => {
      warming = 0
      if (!destroyed && shelves.warm()) {
        warm()
      }
    }
    // Safari has no idle callback; a short timer is close enough.
    const idle: typeof window.requestIdleCallback | undefined = window.requestIdleCallback
    warming = idle ? idle(run, { timeout: 2000 }) : window.setTimeout(run, 300)
  }

  const render = (frame: ArchiveSceneFrame) => {
    const artwork = active.sync(frame)
    shelves.syncActiveArticles(active.indices)
    shelves.updateVisibility(camera.viewProjection)
    // The book nearest the browsing position is the one in front.
    const lead = active.indices.length
      ? active.indices.reduce((nearest, index) =>
        Math.abs(frame.position - index) < Math.abs(frame.position - nearest) ? index : nearest)
      : null
    const pose = lead !== null ? motion.getPose(lead, frame) : null
    const swing = pose?.swing ?? 0
    const hazeNear = motion.shelfDepth - hazeLead

    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    gl.useProgram(bookProgram.program)
    gl.uniformMatrix4fv(bookProgram.uniform('uViewProjection'), false, camera.viewProjection)
    gl.uniform3f(bookProgram.uniform('uLight'), light[0], light[1], light[2])
    gl.uniform3f(bookProgram.uniform('uPaper'), 1, 1, 1)
    gl.uniform3f(bookProgram.uniform('uInk'), ink[0], ink[1], ink[2])
    gl.uniform3f(bookProgram.uniform('uBackground'), background[0], background[1], background[2])
    gl.uniform3f(
      bookProgram.uniform('uHaze'),
      hazeNear,
      mix(restingHaze, focusedHaze, swing) / hazeLead,
      motion.shelfDepth,
    )
    gl.uniform1f(bookProgram.uniform('uLine'), lineWidth * pixelRatio)
    gl.uniform1i(bookProgram.uniform('uSpine'), 0)
    gl.uniform1i(bookProgram.uniform('uCover'), 1)
    gl.uniform1i(bookProgram.uniform('uKind'), 0)
    gl.uniform3f(bookProgram.uniform('uSize'), caseWidth, caseHeight, caseDepth)
    const painted = shelves.draw(box.indexCount) || artwork.painted
    stage.drawFurniture(bookProgram, box.indexCount)

    gl.useProgram(glowProgram.program)
    gl.uniformMatrix4fv(glowProgram.uniform('uViewProjection'), false, camera.viewProjection)
    gl.uniform3f(glowProgram.uniform('uBackground'), background[0], background[1], background[2])
    stage.drawGlow(glowProgram, pose)

    gl.useProgram(bookProgram.program)
    gl.uniform1i(bookProgram.uniform('uKind'), 0)
    gl.uniform3f(bookProgram.uniform('uSize'), caseWidth, caseHeight, caseDepth)
    active.draw(frame, box.indexCount)
    gl.bindVertexArray(null)
    return { painted, pending: artwork.pending }
  }

  // Frames that keep arriving late mean the GPU cannot fill this many pixels.
  // Text gets a little softer; the motion stays smooth, which matters more.
  const adapt = (seconds: number, painted: boolean) => {
    if (painted || seconds === 0) {
      return
    }
    slowFrames = seconds > slowFrameSeconds ? slowFrames + 1 : Math.max(0, slowFrames - 2)
    if (slowFrames >= slowFramesAllowed && quality > 0.5) {
      quality *= 0.8
      slowFrames = 0
      resize(true)
    }
  }

  const draw = (frame: ArchiveSceneFrame) => {
    currentFrame = frame
    const moving = motion.update(frame)
    const { painted, pending } = render(frame)
    adapt(frame.deltaSeconds, painted)
    if (!moving && !pending) {
      warm()
    }
    return moving || pending
  }

  const interaction = createArchiveSceneInteraction({
    camera,
    shelves,
    layout,
    getActive: () => active.indices,
    getFrame: () => currentFrame,
    getSize: () => ({ width, height }),
    host,
    labelFor: active.labelFor,
    motion,
  })

  resize(true)
  draw(currentFrame)

  return {
    draw,
    getActiveRects: interaction.getActiveRects,
    pickArticleAt: interaction.pickArticleAt,
    place() {
      motion.snap()
    },
    refreshTypography(nextFontFamily?: string) {
      fontFamily = nextFontFamily || fontFamily
      shelves.refreshTypography()
      active.refreshTypography()
      stage.refreshTypography()
    },
    resize() {
      resize(true)
    },
    destroy() {
      destroyed = true
      const cancelIdle: typeof window.cancelIdleCallback | undefined = window.cancelIdleCallback
      cancelIdle?.(warming)
      window.clearTimeout(warming)
      shelves.destroy()
      active.destroy()
      stage.destroy()
      box.destroy()
      bookProgram.destroy()
      glowProgram.destroy()
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    },
  }
}
