import {
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  DynamicDrawUsage,
  HemisphereLight,
  InstancedMesh,
  LinearFilter,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
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
  selectionProgress: number
  hovered: boolean
}

export interface ArchiveSceneEngine {
  draw: (frame: ArchiveSceneFrame) => void
  getActiveRect: () => DOMRect
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
  backgroundColor?: number
}

interface CasePose {
  matrix: Matrix4
  openness: number
}

const caseWidth = 3.15
const caseHeight = 4.6
const caseDepth = 0.56
const spinePitch = 0.63

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const mix = (from: number, to: number, progress: number) =>
  from + (to - from) * progress

const smoothstep = (edge0: number, edge1: number, value: number) => {
  const progress = clamp((value - edge0) / (edge1 - edge0), 0, 1)
  return progress * progress * (3 - 2 * progress)
}

const indexVariance = (index: number) => {
  const value = Math.sin((index + 1) * 91.173) * 43758.5453
  return (value - Math.floor(value)) * 2 - 1
}

const formatDate = (value: string, locale: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(date)
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
  canvas.width = 384
  canvas.height = 576
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new Error('Canvas 2D is unavailable')

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.generateMipmaps = false
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter

  return {
    canvas,
    context,
    texture,
    articleIndex: -1,
  }
}

const paintLabel = (
  label: ReturnType<typeof createLabel>,
  article: ArchiveSceneArticle,
  index: number,
  count: number,
  locale: string,
  archiveLabel: string,
) => {
  if (label.articleIndex === index) return
  label.articleIndex = index

  const { canvas, context } = label
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)

  context.strokeStyle = '#dadee3'
  context.lineWidth = 2
  context.strokeRect(18, 18, canvas.width - 36, canvas.height - 36)

  context.fillStyle = '#5e646b'
  context.font = '600 18px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  context.textBaseline = 'top'
  context.letterSpacing = '2px'
  context.fillText(archiveLabel.toLocaleUpperCase(locale), 36, 39)
  context.textAlign = 'right'
  context.fillText(`${String(index + 1).padStart(2, '0')} / ${String(count).padStart(2, '0')}`, 348, 39)

  context.textAlign = 'left'
  context.letterSpacing = '0px'
  let fontSize = 46
  let lines: string[] = []
  do {
    context.font = `650 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
    lines = wrapTitle(context, article.title, 306, 5)
    fontSize -= 2
  } while (lines.length > 4 && fontSize > 30)

  const lineHeight = (fontSize + 2) * 1.14
  const blockHeight = lines.length * lineHeight
  let y = (canvas.height - blockHeight) * 0.48
  context.fillStyle = '#0e1217'
  context.textBaseline = 'middle'
  for (const line of lines) {
    context.fillText(line, 36, y)
    y += lineHeight
  }

  context.fillStyle = '#5e646b'
  context.font = '500 18px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
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
  } = options
  const renderer = new WebGLRenderer({
    canvas,
    context,
    alpha: false,
    antialias: false,
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

  // A wider field of view makes depth changes legible instead of reading like
  // an orthographic stack, while resize() keeps the same responsive framing.
  const camera = new PerspectiveCamera(46, 1, 0.1, 48)
  // Keep the pale stock dimensional without clipping it to flat white. These
  // restrained lights also avoid the cost of shadows on low-end GPUs.
  const ambient = new AmbientLight(0xffffff, 0.68)
  const hemisphere = new HemisphereLight(0xffffff, 0xdadee3, 0.9)
  const keyLight = new DirectionalLight(0xffffff, 1.55)
  keyLight.position.set(-4.5, 6, 7)
  const fillLight = new DirectionalLight(0xe8ebef, 0.38)
  fillLight.position.set(5, -1.5, 4)
  scene.add(ambient, hemisphere, keyLight, fillLight)

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

  const labelGeometry = new PlaneGeometry(caseWidth * 0.94, caseHeight * 0.955)
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

  const poseObject = new Object3D()
  const labelOffset = new Matrix4().makeTranslation(0, 0, caseDepth / 2 + 0.004)
  const projectedPoint = new Vector3()
  const poseResult: CasePose = {
    matrix: poseObject.matrix,
    openness: 0,
  }
  let currentFrame: ArchiveSceneFrame = {
    position: 0,
    selectedIndex: 0,
    selectionProgress: 0,
    hovered: false,
  }
  let width = 1
  let height = 1

  const getPose = (articleIndex: number, frame: ArchiveSceneFrame): CasePose => {
    const offset = articleIndex - frame.position
    const openness = 1 - smoothstep(0.06, 0.56, Math.abs(offset))
    const presented = articleIndex === frame.selectedIndex
    const selected = presented
      ? frame.selectionProgress
      : 0
    const hover = presented && frame.hovered && selected === 0
      ? 1
      : 0

    const restingRoll = indexVariance(articleIndex) * 0.045
    const x = offset * spinePitch
    const y = mix(-0.2, 0.52, openness)
    // The nearest visual case owns the foreground while it is being presented.
    // Its lift grows as it turns edge-on, preventing adjacent cases from
    // intersecting its face during fractional trackpad/drag positions.
    const presentationLift = presented ? 0.15 + (1 - openness) * 3 : 0
    const selectionDepth = smoothstep(0, 0.12, selected) * 1.15
    const z = mix(-1.35, 1.55, openness)
      + presentationLift
      + selectionDepth
      + hover * 0.12
    const pitch = mix(0, -0.105, openness) * (1 - selected)
    const yaw = mix(Math.PI / 2, -0.12, openness) * (1 - selected)
    const roll = mix(restingRoll, -0.145, openness) * (1 - selected)
    const scale = 1 + hover * 0.012

    poseObject.position.set(x, mix(y, 0.18, selected), z)
    poseObject.rotation.set(pitch, yaw, roll, 'XYZ')
    poseObject.scale.set(scale, scale, mix(scale, 0.045, selected))
    poseObject.updateMatrix()

    poseResult.matrix = poseObject.matrix
    poseResult.openness = openness
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
    if (pose.openness < 0.025 && frame.selectionProgress === 0) {
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
    )
    mesh.matrix.copy(pose.matrix).multiply(labelOffset)
    mesh.renderOrder = articleIndex === frame.selectedIndex ? 2 : 1
    mesh.visible = true
  }

  const resize = () => {
    const nextWidth = Math.max(1, Math.round(host.clientWidth))
    const nextHeight = Math.max(1, Math.round(host.clientHeight))
    if (nextWidth === width && nextHeight === height) return

    width = nextWidth
    height = nextHeight
    const maxRatio = lowPower ? 1 : 1.25
    const pixelBudgetRatio = Math.sqrt(1_500_000 / (width * height))
    const ratio = clamp(Math.min(window.devicePixelRatio || 1, maxRatio, pixelBudgetRatio), 0.75, maxRatio)
    renderer.setPixelRatio(ratio)
    renderer.setSize(width, height, false)

    camera.aspect = width / height
    const compactLandscape = height < 500 && camera.aspect > 1.5
    const visibleHeight = compactLandscape
      ? 8.4
      : camera.aspect < 0.62
        ? 10.2
        : camera.aspect < 0.9
          ? 9.6
          : camera.aspect > 1.75
            ? 8.2
            : 8.8
    const distance = (visibleHeight / 2) / Math.tan((camera.fov * Math.PI) / 360)
    camera.position.set(0, 0.15, distance)
    camera.lookAt(0, 0.08, 0)
    camera.updateProjectionMatrix()
  }

  const draw = (frame: ArchiveSceneFrame) => {
    currentFrame = frame

    for (let articleIndex = 0; articleIndex < instanceCount; articleIndex++) {
      const pose = getPose(articleIndex, frame)
      cases.setMatrixAt(articleIndex, pose.matrix)
    }
    cases.instanceMatrix.needsUpdate = true

    const lower = clamp(Math.floor(frame.position), 0, articles.length - 1)
    const upper = clamp(Math.ceil(frame.position), 0, articles.length - 1)
    setLabelMatrix(labelMeshes[0], labels[0], lower, frame)
    if (upper === lower) {
      labelMeshes[1].visible = false
    } else {
      setLabelMatrix(labelMeshes[1], labels[1], upper, frame)
    }

    renderer.render(scene, camera)
  }

  const getActiveRect = () => {
    const pose = getPose(currentFrame.selectedIndex, currentFrame)
    const corners = [
      [-caseWidth / 2, -caseHeight / 2],
      [caseWidth / 2, -caseHeight / 2],
      [caseWidth / 2, caseHeight / 2],
      [-caseWidth / 2, caseHeight / 2],
    ] as const
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY

    for (const [x, y] of corners) {
      projectedPoint
        .set(x, y, caseDepth / 2)
        .applyMatrix4(pose.matrix)
        .project(camera)
      const screenX = (projectedPoint.x * 0.5 + 0.5) * width
      const screenY = (-projectedPoint.y * 0.5 + 0.5) * height
      minX = Math.min(minX, screenX)
      minY = Math.min(minY, screenY)
      maxX = Math.max(maxX, screenX)
      maxY = Math.max(maxY, screenY)
    }

    const hostRect = host.getBoundingClientRect()
    return new DOMRect(
      hostRect.left + minX,
      hostRect.top + minY,
      Math.max(1, maxX - minX),
      Math.max(1, maxY - minY),
    )
  }

  resize()
  draw(currentFrame)

  return {
    draw,
    getActiveRect,
    resize() {
      width = 0
      height = 0
      resize()
    },
    destroy() {
      geometry.dispose()
      material.dispose()
      labelGeometry.dispose()
      labels.forEach((label) => label.texture.dispose())
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
    },
  }
}
