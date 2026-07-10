import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  DynamicDrawUsage,
  Float32BufferAttribute,
  HemisphereLight,
  InstancedMesh,
  LinearFilter,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'

export interface ArchiveSceneArticle {
  title: string
  date: string
}

export interface ArchiveSceneFrame {
  position: number
  selectedIndex: number
  presentationProgress: number
  selectionProgress: number
  hovered: boolean
}

export interface ArchiveSceneRects {
  surfaceRect: DOMRect
  titleRect: DOMRect
}

export interface ArchiveSceneEngine {
  draw: (frame: ArchiveSceneFrame) => void
  getActiveRects: () => ArchiveSceneRects
  pickArticleAt: (clientX: number, clientY: number) => number | null
  refreshTypography: () => void
  resize: () => void
  destroy: () => void
}

interface ArchiveSceneOptions {
  canvas: HTMLCanvasElement
  context: WebGL2RenderingContext
  host: HTMLElement
  articles: ArchiveSceneArticle[]
  lowPower: boolean
  locale: string
  archiveLabel: string
  titleFontFamily?: string
  backgroundColor?: number
}

interface CasePose {
  matrix: Matrix4
  faceVisibility: number
}

interface TitleBounds {
  left: number
  top: number
  width: number
  height: number
}

const caseWidth = 3.15
const caseHeight = 4.6
const caseDepth = 0.64
const spinePitch = 0.88
const shelfY = -0.28
const shelfZ = -1.3
const pullDistance = 3.3
const browsingPullRatio = 0.15
const turnStart = 0.58
const cameraDepthOffset = pullDistance * 0.42
const alignedCameraOffset = pullDistance - cameraDepthOffset
const cameraY = 0.72
const labelWidth = caseWidth * 0.94
const labelHeight = caseHeight * 0.955
const spineLabelWidth = caseDepth * 0.86
const spineLabelHeight = caseHeight * 0.9
const labelLogicalWidth = 384
const labelLogicalHeight = 576
const labelTextureScale = 1.5
const spineAtlasCellWidth = 56
const spineAtlasCellHeight = 384
const spineAtlasTextureScale = 1.25
const spineTitleMaxFontSize = 26
const spineTitleMinFontSize = 18

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const mix = (from: number, to: number, progress: number) =>
  from + (to - from) * progress

const smootherstep = (edge0: number, edge1: number, value: number) => {
  const progress = clamp((value - edge0) / (edge1 - edge0), 0, 1)
  return progress * progress * progress * (progress * (progress * 6 - 15) + 10)
}

const indexVariance = (index: number) => {
  const value = Math.sin((index + 1) * 91.173) * 43758.5453
  return (value - Math.floor(value)) * 2 - 1
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>()

const formatDate = (value: string, locale: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  let formatter = dateFormatters.get(locale)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    })
    dateFormatters.set(locale, formatter)
  }
  return formatter.format(date)
}

const wrapTitle = (
  context: CanvasRenderingContext2D,
  title: string,
  maxWidth: number,
  maxLines: number,
) => {
  const segments = /\s/.test(title)
    ? title.trim().split(/\s+/)
    : Array.from(title.trim())
  const separator = /\s/.test(title) ? ' ' : ''
  const lines: string[] = []
  let line = ''

  for (const segment of segments) {
    const candidate = line ? `${line}${separator}${segment}` : segment
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line)
      line = segment
    } else {
      line = candidate
    }

    if (lines.length === maxLines) break
  }

  if (line && lines.length < maxLines) lines.push(line)
  if (lines.length === maxLines && segments.join(separator) !== lines.join(separator)) {
    let last = lines[maxLines - 1]
    while (last.length > 1 && context.measureText(`${last}…`).width > maxWidth) {
      last = last.slice(0, -1)
    }
    lines[maxLines - 1] = `${last}…`
  }

  return lines
}

const createLabel = () => {
  const canvas = document.createElement('canvas')
  canvas.width = labelLogicalWidth * labelTextureScale
  canvas.height = labelLogicalHeight * labelTextureScale
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new Error('Canvas 2D is unavailable')
  context.scale(labelTextureScale, labelTextureScale)

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.generateMipmaps = false
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter

  return {
    canvas,
    context,
    texture,
    logicalWidth: labelLogicalWidth,
    logicalHeight: labelLogicalHeight,
    articleIndex: -1,
    paintKey: '',
    titleBounds: {
      left: 36,
      top: 190,
      width: 306,
      height: 120,
    } satisfies TitleBounds,
  }
}

interface SpineAtlasRect {
  u0: number
  u1: number
  v0: number
  v1: number
  x: number
  y: number
}

const createSpineAtlas = (articleCount: number) => {
  const columns = Math.max(
    1,
    Math.min(
      articleCount,
      Math.ceil(
        Math.sqrt(articleCount * spineAtlasCellHeight / spineAtlasCellWidth),
      ),
    ),
  )
  const rows = Math.max(1, Math.ceil(articleCount / columns))
  const logicalWidth = columns * spineAtlasCellWidth
  const logicalHeight = rows * spineAtlasCellHeight
  const canvas = document.createElement('canvas')
  canvas.width = logicalWidth * spineAtlasTextureScale
  canvas.height = logicalHeight * spineAtlasTextureScale
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new Error('Canvas 2D is unavailable')
  context.scale(spineAtlasTextureScale, spineAtlasTextureScale)

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.generateMipmaps = false
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter

  const gutter = 2
  const rects: SpineAtlasRect[] = Array.from(
    { length: articleCount },
    (_, index) => {
      const x = (index % columns) * spineAtlasCellWidth
      const y = Math.floor(index / columns) * spineAtlasCellHeight
      return {
        x,
        y,
        u0: (x + gutter) / logicalWidth,
        u1: (x + spineAtlasCellWidth - gutter) / logicalWidth,
        v0: 1 - (y + spineAtlasCellHeight - gutter) / logicalHeight,
        v1: 1 - (y + gutter) / logicalHeight,
      }
    },
  )

  return {
    canvas,
    context,
    texture,
    rects,
    logicalWidth,
    logicalHeight,
    paintKey: '',
  }
}

const truncateSpineTitle = (
  context: CanvasRenderingContext2D,
  title: string,
  maxWidth: number,
) => {
  const normalized = title.trim().replace(/\s+/g, ' ')
  if (context.measureText(normalized).width <= maxWidth) return normalized

  const characters = Array.from(normalized)
  let lower = 0
  let upper = characters.length
  while (lower < upper) {
    const middle = Math.ceil((lower + upper) / 2)
    const candidate = `${characters.slice(0, middle).join('').trimEnd()}…`
    if (context.measureText(candidate).width <= maxWidth) {
      lower = middle
    } else {
      upper = middle - 1
    }
  }
  return `${characters.slice(0, lower).join('').trimEnd()}…`
}

const paintSpineAtlas = (
  atlas: ReturnType<typeof createSpineAtlas>,
  articles: ArchiveSceneArticle[],
  titleFontFamily: string,
) => {
  if (atlas.paintKey === titleFontFamily) return
  atlas.paintKey = titleFontFamily

  const { context } = atlas
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, atlas.logicalWidth, atlas.logicalHeight)
  context.fillStyle = '#20252a'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.letterSpacing = '0px'
  const maxTitleWidth = spineAtlasCellHeight - 34

  for (let index = 0; index < articles.length; index++) {
    const rect = atlas.rects[index]
    if (!rect) continue
    const normalizedTitle = articles[index].title.trim().replace(/\s+/g, ' ')
    context.font = `600 ${spineTitleMaxFontSize}px ${titleFontFamily}`
    const naturalWidth = context.measureText(normalizedTitle).width
    const proportionalSize = naturalWidth > 0
      ? spineTitleMaxFontSize * Math.min(1, maxTitleWidth / naturalWidth)
      : spineTitleMaxFontSize
    // Preserve the full title whenever a modest reduction is enough. Only
    // after reaching the legibility floor do we fall back to an ellipsis.
    const fontSize = clamp(
      Math.floor(proportionalSize * 10) / 10,
      spineTitleMinFontSize,
      spineTitleMaxFontSize,
    )
    context.font = `600 ${fontSize}px ${titleFontFamily}`
    const title = truncateSpineTitle(
      context,
      normalizedTitle,
      maxTitleWidth,
    )
    context.save()
    context.translate(
      rect.x + spineAtlasCellWidth / 2,
      rect.y + spineAtlasCellHeight / 2,
    )
    // The glyphs stay in normal horizontal typesetting; the complete line is
    // rotated onto the case so its baseline follows the spine's long axis.
    context.rotate(Math.PI / 2)
    context.fillText(title, 0, 0)
    context.restore()
  }
  atlas.texture.needsUpdate = true
}

const createShelfSpineGeometry = (
  restMatrices: Matrix4[],
  spineLabelOffset: Matrix4,
  rects: SpineAtlasRect[],
) => {
  const positions = new Float32Array(restMatrices.length * 4 * 3)
  const uvs = new Float32Array(restMatrices.length * 4 * 2)
  const indices: number[] = []
  const worldMatrix = new Matrix4()
  const point = new Vector3()
  const localPoints = [
    [-spineLabelWidth / 2, spineLabelHeight / 2, 0],
    [spineLabelWidth / 2, spineLabelHeight / 2, 0],
    [-spineLabelWidth / 2, -spineLabelHeight / 2, 0],
    [spineLabelWidth / 2, -spineLabelHeight / 2, 0],
  ] as const

  restMatrices.forEach((restMatrix, articleIndex) => {
    worldMatrix.multiplyMatrices(restMatrix, spineLabelOffset)
    const positionOffset = articleIndex * 12
    for (let vertexIndex = 0; vertexIndex < 4; vertexIndex++) {
      const local = localPoints[vertexIndex]
      point.set(local[0], local[1], local[2]).applyMatrix4(worldMatrix)
      point.toArray(positions, positionOffset + vertexIndex * 3)
    }

    const rect = rects[articleIndex]
    const uvOffset = articleIndex * 8
    uvs.set([
      rect.u0, rect.v1,
      rect.u1, rect.v1,
      rect.u0, rect.v0,
      rect.u1, rect.v0,
    ], uvOffset)

    const vertexOffset = articleIndex * 4
    indices.push(
      vertexOffset,
      vertexOffset + 2,
      vertexOffset + 1,
      vertexOffset + 2,
      vertexOffset + 3,
      vertexOffset + 1,
    )
  })

  const geometry = new BufferGeometry()
  const positionAttribute = new Float32BufferAttribute(positions, 3)
  positionAttribute.setUsage(DynamicDrawUsage)
  geometry.setAttribute('position', positionAttribute)
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()

  return { geometry, restPositions: positions.slice() }
}

const paintLabel = (
  label: ReturnType<typeof createLabel>,
  article: ArchiveSceneArticle,
  index: number,
  count: number,
  locale: string,
  archiveLabel: string,
  titleFontFamily: string,
  initialTitleFontSize: number,
  titleAlignment: 'left' | 'center',
) => {
  const paintKey = `${index}:${initialTitleFontSize.toFixed(2)}:${titleAlignment}:${titleFontFamily}`
  if (label.paintKey === paintKey) return
  label.paintKey = paintKey
  label.articleIndex = index

  const { context } = label
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, label.logicalWidth, label.logicalHeight)

  context.strokeStyle = '#dadee3'
  context.lineWidth = 2
  context.strokeRect(
    18,
    18,
    label.logicalWidth - 36,
    label.logicalHeight - 36,
  )

  context.fillStyle = '#5e646b'
  context.font = '600 18px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  context.textBaseline = 'top'
  context.letterSpacing = '2px'
  context.fillText(archiveLabel.toLocaleUpperCase(locale), 36, 39)
  context.textAlign = 'right'
  context.fillText(`${String(index + 1).padStart(2, '0')} / ${String(count).padStart(2, '0')}`, 348, 39)

  context.textAlign = 'left'
  context.letterSpacing = '0px'
  let fontSize = initialTitleFontSize
  let lines: string[] = []
  do {
    context.font = `700 ${fontSize}px ${titleFontFamily}`
    lines = wrapTitle(context, article.title, 306, 5)
    fontSize -= 2
  } while (lines.length > 4 && fontSize > 30)

  const lineHeight = (fontSize + 2) * 1.14
  const blockHeight = lines.length * lineHeight
  const titleTop = (label.logicalHeight - blockHeight) * 0.48
  let titleWidth = 1
  for (const line of lines) {
    titleWidth = Math.max(titleWidth, context.measureText(line).width)
  }
  const titleX = titleAlignment === 'center' ? label.logicalWidth / 2 : 36
  let y = titleTop
  label.titleBounds = {
    left: titleAlignment === 'center' ? titleX - titleWidth / 2 : titleX,
    top: titleTop - lineHeight / 2,
    width: titleWidth,
    height: blockHeight,
  }
  context.fillStyle = '#0e1217'
  context.textAlign = titleAlignment
  context.textBaseline = 'middle'
  for (const line of lines) {
    context.fillText(line, titleX, y)
    y += lineHeight
  }

  context.fillStyle = '#5e646b'
  context.font = '500 18px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  context.textAlign = 'left'
  context.textBaseline = 'bottom'
  context.fillText(formatDate(article.date, locale), 36, 532)
  label.texture.needsUpdate = true
}

export const createArchiveScene = (options: ArchiveSceneOptions): ArchiveSceneEngine => {
  const {
    canvas,
    context,
    host,
    articles,
    lowPower,
    locale,
    archiveLabel,
    titleFontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  } = options
  const renderer = new WebGLRenderer({
    canvas,
    context,
    alpha: false,
    antialias: true,
    depth: true,
    stencil: false,
    preserveDrawingBuffer: false,
    powerPreference: 'low-power',
    precision: 'mediump',
  })
  renderer.outputColorSpace = SRGBColorSpace

  const scene = new Scene()
  const background = new Color(options.backgroundColor ?? 0xfbfcfd)
  scene.background = background

  // A restrained perspective keeps the card readable while the moving camera
  // and physical extraction path provide the depth cues.
  const camera = new PerspectiveCamera(40, 1, 0.1, 64)
  // Keep the pale stock dimensional without clipping it to flat white. These
  // restrained lights also avoid the cost of shadows on low-end GPUs.
  const ambient = new AmbientLight(0xffffff, 0.68)
  const hemisphere = new HemisphereLight(0xffffff, 0xdadee3, 0.9)
  const keyLight = new DirectionalLight(0xffffff, 1.55)
  keyLight.position.set(-4.5, 6, 7)
  const fillLight = new DirectionalLight(0xe8ebef, 0.38)
  fillLight.position.set(5, -1.5, 4)
  scene.add(
    ambient,
    hemisphere,
    keyLight,
    keyLight.target,
    fillLight,
    fillLight.target,
  )

  // Keep every case resident in one instanced draw call. The article count is
  // small enough that recycling a short pool costs more visually (instances
  // pop at either edge) than it saves on even a low-end mobile GPU.
  const instanceCount = articles.length
  const geometry = new BoxGeometry(caseWidth, caseHeight, caseDepth, 1, 1, 1)
  const material = new MeshStandardMaterial({
    // White stock stays white; the Standard material and directional light
    // describe its faces through response to light instead of a grey base tint.
    color: 0xffffff,
    roughness: 0.72,
    metalness: 0,
  })
  const cases = new InstancedMesh(geometry, material, instanceCount)
  cases.instanceMatrix.setUsage(DynamicDrawUsage)
  cases.frustumCulled = false
  scene.add(cases)

  // The fixed shelf remains one instanced draw call. Only the outgoing and
  // incoming cases become dedicated meshes while they leave their slots; this
  // keeps depth ordering physical without rebuilding the whole shelf per frame.
  const activeCases = [0, 1].map(() => {
    const mesh = new Mesh(geometry, material)
    mesh.matrixAutoUpdate = false
    mesh.visible = false
    mesh.frustumCulled = false
    scene.add(mesh)
    return mesh
  })

  const labelGeometry = new PlaneGeometry(labelWidth, labelHeight)
  const labels = [createLabel(), createLabel()]
  const labelMeshes = labels.map((label) => {
    const labelMaterial = new MeshStandardMaterial({
      map: label.texture,
      color: 0xffffff,
      roughness: 0.86,
      metalness: 0,
    })
    const mesh = new Mesh(labelGeometry, labelMaterial)
    mesh.matrixAutoUpdate = false
    mesh.visible = false
    mesh.frustumCulled = false
    scene.add(mesh)
    return mesh
  })

  // One atlas keeps every title resident while still uploading only a single
  // texture. The shelf labels are batched below, so article count does not
  // become article-count draw calls.
  const spineAtlas = createSpineAtlas(articles.length)
  paintSpineAtlas(spineAtlas, articles, titleFontFamily)
  const textureAnisotropy = Math.max(
    1,
    Math.min(
      lowPower ? 2 : 4,
      renderer.capabilities.getMaxAnisotropy(),
    ),
  )
  labels.forEach((label) => {
    label.texture.anisotropy = textureAnisotropy
  })
  spineAtlas.texture.anisotropy = textureAnisotropy
  const spineLabelMaterial = new MeshStandardMaterial({
    map: spineAtlas.texture,
    color: 0xffffff,
    roughness: 0.84,
    metalness: 0,
  })

  const poseObject = new Object3D()
  const shelfRotationObject = new Object3D()
  const displayRotationObject = new Object3D()
  const facingObject = new Object3D()
  displayRotationObject.rotation.set(-0.16, 0.4, -0.1, 'XYZ')
  const labelOffset = new Matrix4().makeTranslation(0, 0, caseDepth / 2 + 0.008)
  const spineLabelOffsetObject = new Object3D()
  spineLabelOffsetObject.position.set(-caseWidth / 2 - 0.009, 0, 0)
  spineLabelOffsetObject.rotation.y = -Math.PI / 2
  spineLabelOffsetObject.updateMatrix()
  const spineLabelOffset = spineLabelOffsetObject.matrix.clone()
  const hiddenMatrix = new Matrix4().makeScale(0, 0, 0)
  const pickPoint = new Vector2()
  const raycaster = new Raycaster()
  const projectedPoint = new Vector3()
  const cameraTarget = new Vector3()
  // Stable per-article variation reads as physical manufacturing/casual shelf
  // placement while preserving batching and avoiding layout shifts on return.
  const caseScales = articles.map((_, articleIndex) => ({
    x: 1 + indexVariance(articleIndex + 37) * 0.018,
    y: 1 + indexVariance(articleIndex + 73) * 0.014,
    z: 1 + indexVariance(articleIndex + 109) * 0.045,
  }))
  const caseYawAngles = articles.map(
    (_, articleIndex) => indexVariance(articleIndex) * 0.018,
  )
  const caseLeanAngles = new Array<number>(articles.length).fill(0)
  let leanGroupStart = 0
  let leanGroupIndex = 0
  while (leanGroupStart < articles.length) {
    const remaining = articles.length - leanGroupStart
    const groupSize = Math.min(
      remaining,
      2 + Math.floor((indexVariance(leanGroupIndex + 211) + 1) * 1.5),
    )
    const groupStrength = 0.019
      + (indexVariance(leanGroupIndex + 257) + 1) * 0.0025
    for (let offset = 0; offset < groupSize; offset++) {
      const articleIndex = leanGroupStart + offset
      const inwardLean = groupSize === 1
        ? 0
        : mix(-1, 1, offset / (groupSize - 1))
      caseLeanAngles[articleIndex] = inwardLean * groupStrength
        + indexVariance(articleIndex + 307) * 0.0015
    }
    leanGroupStart += groupSize
    leanGroupIndex++
  }
  const shelfXPositions = new Array<number>(articles.length).fill(0)
  const baseSpineGap = spinePitch - caseDepth
  for (let articleIndex = 1; articleIndex < articles.length; articleIndex++) {
    const previousScale = caseScales[articleIndex - 1]
    const currentScale = caseScales[articleIndex]
    const variedGap = baseSpineGap
      * (1 + indexVariance(articleIndex + 151) * 0.18)
    shelfXPositions[articleIndex] = shelfXPositions[articleIndex - 1]
      + caseDepth * (previousScale.z + currentScale.z) / 2
      + variedGap
  }
  const shelfBaseY = shelfY - caseHeight / 2
  const shelfYPositions = articles.map((_, articleIndex) => {
    const caseScale = caseScales[articleIndex]
    const yaw = caseYawAngles[articleIndex]
    const lean = caseLeanAngles[articleIndex]
    const halfHeight = caseHeight * caseScale.y / 2
    const halfShelfWidth = caseDepth * caseScale.z / 2 * Math.cos(yaw)
      + caseWidth * caseScale.x / 2 * Math.abs(Math.sin(yaw))
    const leanedHalfHeight = halfHeight * Math.cos(lean)
      + halfShelfWidth * Math.abs(Math.sin(lean))
    return shelfBaseY + leanedHalfHeight
  })
  const restMatrices = articles.map((_, articleIndex) => {
    const caseScale = caseScales[articleIndex]
    poseObject.position.set(
      shelfXPositions[articleIndex],
      shelfYPositions[articleIndex],
      shelfZ,
    )
    poseObject.rotation.set(
      0,
      Math.PI / 2 + caseYawAngles[articleIndex],
      caseLeanAngles[articleIndex],
      // ZYX applies the lean in shelf space, so neighboring tops actually
      // angle toward one another rather than merely rolling in depth.
      'ZYX',
    )
    poseObject.scale.set(caseScale.x, caseScale.y, caseScale.z)
    poseObject.updateMatrix()
    return poseObject.matrix.clone()
  })
  const {
    geometry: shelfSpineGeometry,
    restPositions: shelfSpineRestPositions,
  } = createShelfSpineGeometry(
    restMatrices,
    spineLabelOffset,
    spineAtlas.rects,
  )
  const shelfSpineMesh = new Mesh(shelfSpineGeometry, spineLabelMaterial)
  shelfSpineMesh.frustumCulled = false
  scene.add(shelfSpineMesh)

  // The two cases crossing the active selection boundary leave the static
  // batch and receive tiny dynamic quads that share the same atlas/material.
  const activeSpineGeometries = [0, 1].map(
    () => new PlaneGeometry(spineLabelWidth, spineLabelHeight),
  )
  const activeSpineMeshes = activeSpineGeometries.map((spineGeometry) => {
    const mesh = new Mesh(spineGeometry, spineLabelMaterial)
    mesh.matrixAutoUpdate = false
    mesh.visible = false
    mesh.frustumCulled = false
    scene.add(mesh)
    return mesh
  })
  const poseResult: CasePose = {
    matrix: poseObject.matrix,
    faceVisibility: 0,
  }
  let currentFrame: ArchiveSceneFrame = {
    position: 0,
    selectedIndex: 0,
    presentationProgress: 1,
    selectionProgress: 0,
    hovered: false,
  }
  let width = 1
  let height = 1
  let cameraDistance = 10
  let cardTitleFontSize = 27
  let cardTitleAlignment: 'left' | 'center' = 'center'
  let hiddenIndexA = -1
  let hiddenIndexB = -1
  let hiddenSpineIndexA = -1
  let hiddenSpineIndexB = -1

  restMatrices.forEach((matrix, articleIndex) => {
    cases.setMatrixAt(articleIndex, matrix)
  })
  cases.instanceMatrix.needsUpdate = true

  const browsingWeightForDistance = (distance: number) =>
    distance >= 1 ? 0 : 1 - smootherstep(0, 1, distance)

  const presentationForIndex = (
    articleIndex: number,
    frame: ArchiveSceneFrame,
  ) => articleIndex === frame.selectedIndex
    ? smootherstep(0, 1, frame.presentationProgress)
    : 0

  const slideForIndex = (
    articleIndex: number,
    frame: ArchiveSceneFrame,
    presentation: number,
  ) => {
    const browsingSlide = browsingPullRatio
      * browsingWeightForDistance(Math.abs(articleIndex - frame.position))
    return mix(
      browsingSlide,
      1,
      smootherstep(0, 0.72, presentation),
    )
  }

  const updateCamera = (frame: ArchiveSceneFrame) => {
    const lower = clamp(Math.floor(frame.position), 0, articles.length - 1)
    const upper = clamp(Math.ceil(frame.position), 0, articles.length - 1)
    const fraction = clamp(frame.position - lower, 0, 1)
    const handoff = lower === upper
      ? 0
      : smootherstep(0.38, 0.62, fraction)
    const lowerPresentation = presentationForIndex(lower, frame)
    const upperPresentation = presentationForIndex(upper, frame)
    const slide = mix(
      slideForIndex(lower, frame, lowerPresentation),
      slideForIndex(upper, frame, upperPresentation),
      handoff,
    )
    const turn = mix(
      smootherstep(turnStart, 1, lowerPresentation),
      smootherstep(turnStart, 1, upperPresentation),
      handoff,
    )
    const lift = mix(
      smootherstep(0.42, 1, lowerPresentation),
      smootherstep(0.42, 1, upperPresentation),
      handoff,
    )
    const focusX = mix(
      shelfXPositions[lower],
      shelfXPositions[upper],
      handoff,
    ) - 0.1 * turn
    const focusBaseY = mix(
      shelfYPositions[lower],
      shelfYPositions[upper],
      handoff,
    )
    const focusY = focusBaseY + 0.56 * lift
    const focusZ = shelfZ + pullDistance * slide
    const selected = smootherstep(0, 1, frame.selectionProgress)
    const shoulder = camera.aspect < 0.72 ? 0.18 : 0.3
    const browsingCameraX = focusX + shoulder

    cameraTarget.set(focusX, focusY, focusZ)
    camera.position.set(
      mix(browsingCameraX, focusX, selected),
      // The camera translates along X only. Y/Z stay locked while its look-at
      // target follows the case's physical extraction path.
      cameraY,
      shelfZ + cameraDistance + cameraDepthOffset,
    )
    camera.lookAt(cameraTarget)

    keyLight.position.set(focusX - 4.5, focusY + 6, focusZ + 7)
    keyLight.target.position.copy(cameraTarget)
    fillLight.position.set(focusX + 5, focusY - 1.5, focusZ + 4)
    fillLight.target.position.copy(cameraTarget)
  }

  const getPose = (articleIndex: number, frame: ArchiveSceneFrame): CasePose => {
    const presented = articleIndex === frame.selectedIndex
    const presentation = presentationForIndex(articleIndex, frame)
    const slide = slideForIndex(articleIndex, frame, presentation)
    const turn = smootherstep(turnStart, 1, presentation)
    const lift = smootherstep(0.42, 1, presentation)
    const selected = presented ? frame.selectionProgress : 0
    const align = smootherstep(0, 0.62, selected)
    const flatten = smootherstep(0.62, 1, selected)
    const hover = presented
      && frame.hovered
      && presentation > 0.999
      && selected === 0
      ? 1
      : 0
    const caseScale = caseScales[articleIndex]
    const scale = 1 + hover * 0.012

    poseObject.position.set(
      shelfXPositions[articleIndex] - 0.1 * turn,
      shelfYPositions[articleIndex] + 0.56 * lift,
      shelfZ + pullDistance * slide + hover * 0.1,
    )
    shelfRotationObject.rotation.set(
      0,
      Math.PI / 2 + caseYawAngles[articleIndex],
      caseLeanAngles[articleIndex],
      'ZYX',
    )
    poseObject.quaternion.slerpQuaternions(
      shelfRotationObject.quaternion,
      displayRotationObject.quaternion,
      turn,
    )

    if (align > 0) {
      facingObject.position.copy(poseObject.position)
      facingObject.lookAt(camera.position)
      poseObject.quaternion.slerp(facingObject.quaternion, align)
    }

    poseObject.scale.set(
      caseScale.x * scale,
      caseScale.y * scale,
      mix(caseScale.z * scale, 0.045, flatten),
    )
    poseObject.updateMatrix()

    poseResult.matrix = poseObject.matrix
    poseResult.faceVisibility = Math.max(turn, align)
    return poseResult
  }

  const setLabelMatrix = (
    mesh: Mesh,
    label: ReturnType<typeof createLabel>,
    articleIndex: number,
    frame: ArchiveSceneFrame,
  ) => {
    const article = articles[articleIndex]
    if (!article) {
      mesh.visible = false
      return
    }

    const pose = getPose(articleIndex, frame)
    if (pose.faceVisibility < 0.025 && frame.selectionProgress === 0) {
      mesh.visible = false
      return
    }

    paintLabel(
      label,
      article,
      articleIndex,
      articles.length,
      locale,
      archiveLabel,
      titleFontFamily,
      cardTitleFontSize,
      cardTitleAlignment,
    )
    mesh.matrix.copy(pose.matrix).multiply(labelOffset)
    mesh.visible = true
  }

  const setSpineGeometryArticle = (
    spineGeometry: PlaneGeometry,
    articleIndex: number,
  ) => {
    if (spineGeometry.userData.articleIndex === articleIndex) return
    const rect = spineAtlas.rects[articleIndex]
    const uv = spineGeometry.getAttribute('uv')
    uv.setXY(0, rect.u0, rect.v1)
    uv.setXY(1, rect.u1, rect.v1)
    uv.setXY(2, rect.u0, rect.v0)
    uv.setXY(3, rect.u1, rect.v0)
    uv.needsUpdate = true
    spineGeometry.userData.articleIndex = articleIndex
  }

  const setActiveSpineLabel = (
    mesh: Mesh,
    spineGeometry: PlaneGeometry,
    articleIndex: number,
    frame: ArchiveSceneFrame,
  ) => {
    if (articleIndex < 0 || articleIndex >= articles.length) {
      mesh.visible = false
      return
    }

    setSpineGeometryArticle(spineGeometry, articleIndex)
    const pose = getPose(articleIndex, frame)
    mesh.matrix.copy(pose.matrix).multiply(spineLabelOffset)
    mesh.visible = true
  }

  const syncActiveShelfCases = (indexA: number, indexB: number) => {
    let changed = false
    const hiddenAIsActive = hiddenIndexA >= 0
      && (hiddenIndexA === indexA || hiddenIndexA === indexB)
    const hiddenBIsActive = hiddenIndexB >= 0
      && (hiddenIndexB === indexA || hiddenIndexB === indexB)

    if (hiddenIndexA >= 0 && !hiddenAIsActive) {
      cases.setMatrixAt(hiddenIndexA, restMatrices[hiddenIndexA])
      changed = true
    }
    if (
      hiddenIndexB >= 0
      && hiddenIndexB !== hiddenIndexA
      && !hiddenBIsActive
    ) {
      cases.setMatrixAt(hiddenIndexB, restMatrices[hiddenIndexB])
      changed = true
    }

    const indexAWasHidden = indexA === hiddenIndexA || indexA === hiddenIndexB
    const indexBWasHidden = indexB === hiddenIndexA || indexB === hiddenIndexB
    if (indexA >= 0 && !indexAWasHidden) {
      cases.setMatrixAt(indexA, hiddenMatrix)
      changed = true
    }
    if (indexB >= 0 && indexB !== indexA && !indexBWasHidden) {
      cases.setMatrixAt(indexB, hiddenMatrix)
      changed = true
    }

    hiddenIndexA = indexA
    hiddenIndexB = indexB
    if (changed) cases.instanceMatrix.needsUpdate = true
  }

  const setShelfSpineVisible = (articleIndex: number, visible: boolean) => {
    if (articleIndex < 0 || articleIndex >= articles.length) return false
    const position = shelfSpineGeometry.getAttribute('position')
    const offset = articleIndex * 12

    if (visible) {
      for (let component = 0; component < 12; component++) {
        position.array[offset + component] =
          shelfSpineRestPositions[offset + component]
      }
    } else {
      const x = shelfSpineRestPositions[offset]
      const y = shelfSpineRestPositions[offset + 1]
      const z = shelfSpineRestPositions[offset + 2]
      for (let vertex = 0; vertex < 4; vertex++) {
        position.setXYZ(articleIndex * 4 + vertex, x, y, z)
      }
    }
    return true
  }

  const syncActiveShelfSpines = (indexA: number, indexB: number) => {
    const previous = [hiddenSpineIndexA, hiddenSpineIndexB]
      .filter(
        (index, slot, values) => index >= 0 && values.indexOf(index) === slot,
      )
    const next = [indexA, indexB]
      .filter(
        (index, slot, values) => index >= 0 && values.indexOf(index) === slot,
      )
    let changed = false

    for (const articleIndex of previous) {
      if (!next.includes(articleIndex)) {
        changed = setShelfSpineVisible(articleIndex, true) || changed
      }
    }
    for (const articleIndex of next) {
      if (!previous.includes(articleIndex)) {
        changed = setShelfSpineVisible(articleIndex, false) || changed
      }
    }

    hiddenSpineIndexA = indexA
    hiddenSpineIndexB = indexB
    if (changed) shelfSpineGeometry.getAttribute('position').needsUpdate = true
  }

  const setActiveCase = (
    mesh: Mesh,
    articleIndex: number,
    frame: ArchiveSceneFrame,
  ) => {
    if (articleIndex < 0 || articleIndex >= articles.length) {
      mesh.visible = false
      mesh.userData.articleIndex = -1
      return
    }

    const pose = getPose(articleIndex, frame)
    mesh.matrix.copy(pose.matrix)
    mesh.userData.articleIndex = articleIndex
    mesh.visible = true
  }

  const setActiveLabels = (
    lower: number,
    upper: number,
    frame: ArchiveSceneFrame,
  ) => {
    const lowerSlot = labels[0].articleIndex === lower
      ? 0
      : labels[1].articleIndex === lower
        ? 1
        : 0

    if (upper === lower) {
      const hiddenSlot = lowerSlot === 0 ? 1 : 0
      setLabelMatrix(labelMeshes[lowerSlot], labels[lowerSlot], lower, frame)
      labelMeshes[hiddenSlot].visible = false
      return
    }

    let upperSlot = labels[0].articleIndex === upper
      ? 0
      : labels[1].articleIndex === upper
        ? 1
        : lowerSlot === 0 ? 1 : 0
    if (upperSlot === lowerSlot) upperSlot = lowerSlot === 0 ? 1 : 0

    setLabelMatrix(labelMeshes[lowerSlot], labels[lowerSlot], lower, frame)
    setLabelMatrix(labelMeshes[upperSlot], labels[upperSlot], upper, frame)
  }

  const setActiveSpineLabels = (
    lower: number,
    upper: number,
    frame: ArchiveSceneFrame,
  ) => {
    setActiveSpineLabel(
      activeSpineMeshes[0],
      activeSpineGeometries[0],
      lower,
      frame,
    )
    if (upper === lower) {
      activeSpineMeshes[1].visible = false
    } else {
      setActiveSpineLabel(
        activeSpineMeshes[1],
        activeSpineGeometries[1],
        upper,
        frame,
      )
    }
  }

  const resize = () => {
    const nextWidth = Math.max(1, Math.round(host.clientWidth))
    const nextHeight = Math.max(1, Math.round(host.clientHeight))
    if (nextWidth === width && nextHeight === height) return

    width = nextWidth
    height = nextHeight
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
    cardTitleFontSize = clamp(
      306 * articleTitleFontSize / articleTitleWidth,
      21,
      30,
    )
    cardTitleAlignment = width <= 640 ? 'left' : 'center'
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
    cameraDistance = Math.max(verticalDistance, horizontalDistance)
    camera.updateProjectionMatrix()
    updateCamera(currentFrame)
  }

  const draw = (frame: ArchiveSceneFrame) => {
    currentFrame = frame
    updateCamera(frame)
    const lower = clamp(Math.floor(frame.position), 0, articles.length - 1)
    const upper = clamp(Math.ceil(frame.position), 0, articles.length - 1)
    const secondIndex = upper === lower ? -1 : upper
    syncActiveShelfSpines(lower, secondIndex)
    syncActiveShelfCases(lower, secondIndex)
    setActiveCase(activeCases[0], lower, frame)
    setActiveCase(activeCases[1], secondIndex, frame)

    setActiveSpineLabels(lower, upper, frame)
    setActiveLabels(lower, upper, frame)

    renderer.render(scene, camera)
  }

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
    const pose = getPose(currentFrame.selectedIndex, currentFrame)
    const surfaceRect = projectBounds(
      pose.matrix,
      -caseWidth / 2,
      caseWidth / 2,
      -caseHeight / 2,
      caseHeight / 2,
      -caseDepth / 2,
      caseDepth / 2,
    )
    const activeLabel = labels[1].articleIndex === currentFrame.selectedIndex
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
    ) return null

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
      const articleIndex = intersection.object.userData.articleIndex
      if (Number.isInteger(articleIndex) && articleIndex >= 0) {
        return articleIndex as number
      }
    }
    return null
  }

  resize()
  draw(currentFrame)

  return {
    draw,
    getActiveRects,
    pickArticleAt,
    refreshTypography() {
      labels.forEach((label) => {
        label.paintKey = ''
      })
      spineAtlas.paintKey = ''
      paintSpineAtlas(spineAtlas, articles, titleFontFamily)
    },
    resize() {
      width = 0
      height = 0
      resize()
    },
    destroy() {
      geometry.dispose()
      material.dispose()
      labelGeometry.dispose()
      shelfSpineGeometry.dispose()
      activeSpineGeometries.forEach((spineGeometry) => spineGeometry.dispose())
      labels.forEach((label) => label.texture.dispose())
      spineAtlas.texture.dispose()
      spineLabelMaterial.dispose()
      labelMeshes.forEach((mesh) => {
        const meshMaterial = mesh.material
        if (Array.isArray(meshMaterial)) {
          meshMaterial.forEach((item) => item.dispose())
        } else {
          meshMaterial.dispose()
        }
      })
      scene.clear()
      renderer.dispose()
      context.getExtension('WEBGL_lose_context')?.loseContext()
    },
  }
}
