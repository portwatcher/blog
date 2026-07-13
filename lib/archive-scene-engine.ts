import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  DynamicDrawUsage,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three'
import {
  createArchiveLabel,
  createShelfSpineGeometry,
  createSpineAtlas,
  createYearLabelTexture,
  paintArchiveLabel,
  paintSpineAtlas,
} from './archive-scene-assets'
import type { ArchiveLabel } from './archive-scene-assets'
import {
  caseDepth,
  caseHeight,
  caseWidth,
  clamp,
  labelHeight,
  labelWidth,
  shelfY,
  shelfZ,
  spineLabelHeight,
  spineLabelWidth,
  yearLabelHeight,
  yearLabelWidth,
  yearLabelX,
  yearLabelYOffset,
} from './archive-scene-constants'
import { createArchiveSceneInteraction } from './archive-scene-interaction'
import { createArchiveSceneLayout } from './archive-scene-layout'
import { createArchiveSceneMotion } from './archive-scene-motion'
import type {
  ArchiveSceneEngine,
  ArchiveSceneFrame,
  ArchiveSceneOptions,
} from './archive-scene-types'
import { resizeArchiveSceneViewport } from './archive-scene-viewport'

export const createArchiveScene = (
  options: ArchiveSceneOptions,
): ArchiveSceneEngine => {
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
  const geometry = new BoxGeometry(caseWidth, caseHeight, caseDepth, 1, 1, 1)
  const material = new MeshStandardMaterial({
    // White stock stays white; the Standard material and directional light
    // describe its faces through response to light instead of a grey base tint.
    color: 0xffffff,
    roughness: 0.72,
    metalness: 0,
  })
  const cases = new InstancedMesh(geometry, material, articles.length)
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
  const labels = [createArchiveLabel(), createArchiveLabel()]
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

  const labelOffset = new Matrix4().makeTranslation(
    0,
    0,
    caseDepth / 2 + 0.008,
  )
  const spineLabelOffsetObject = new Object3D()
  spineLabelOffsetObject.position.set(-caseWidth / 2 - 0.009, 0, 0)
  spineLabelOffsetObject.rotation.y = -Math.PI / 2
  spineLabelOffsetObject.updateMatrix()
  const spineLabelOffset = spineLabelOffsetObject.matrix.clone()
  const hiddenMatrix = new Matrix4().makeScale(0, 0, 0)
  const layout = createArchiveSceneLayout(articles)
  const {
    restMatrices,
    shelfCenterYPositions,
    shelfGroups,
  } = layout
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

  const yearLabelGeometry = new PlaneGeometry(
    yearLabelWidth,
    yearLabelHeight,
  )
  const yearLabels = shelfGroups.map((shelf, shelfIndex) => {
    const texture = createYearLabelTexture(shelf.year, titleFontFamily)
    texture.anisotropy = textureAnisotropy
    const yearMaterial = new MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    })
    const mesh = new Mesh(yearLabelGeometry, yearMaterial)
    mesh.position.set(
      yearLabelX,
      (shelfCenterYPositions[shelfIndex] ?? shelfY) + yearLabelYOffset,
      shelfZ + 0.2,
    )
    mesh.frustumCulled = false
    scene.add(mesh)
    return { material: yearMaterial, texture }
  })

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
  const motion = createArchiveSceneMotion({
    articleCount: articles.length,
    camera,
    fillLight,
    keyLight,
    layout,
  })
  let currentFrame: ArchiveSceneFrame = {
    position: 0,
    selectedIndex: 0,
    cameraFromIndex: 0,
    cameraToIndex: 0,
    shelfTransitionProgress: 1,
    presentationProgress: 1,
    selectionProgress: 0,
    hovered: false,
  }
  let width = 1
  let height = 1
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

  const setLabelMatrix = (
    mesh: Mesh,
    label: ArchiveLabel,
    articleIndex: number,
    frame: ArchiveSceneFrame,
  ) => {
    const article = articles[articleIndex]
    if (!article) {
      mesh.visible = false
      return
    }

    const pose = motion.getPose(articleIndex, frame)
    if (pose.faceVisibility < 0.025 && frame.selectionProgress === 0) {
      mesh.visible = false
      return
    }

    paintArchiveLabel(
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
    if (spineGeometry.userData.articleIndex === articleIndex) {
      return
    }
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
    const pose = motion.getPose(articleIndex, frame)
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
    if (changed) {
      cases.instanceMatrix.needsUpdate = true
    }
  }

  const setShelfSpineVisible = (articleIndex: number, visible: boolean) => {
    if (articleIndex < 0 || articleIndex >= articles.length) {
      return false
    }
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
    if (changed) {
      shelfSpineGeometry.getAttribute('position').needsUpdate = true
    }
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

    const pose = motion.getPose(articleIndex, frame)
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
    if (upperSlot === lowerSlot) {
      upperSlot = lowerSlot === 0 ? 1 : 0
    }

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
    if (nextWidth === width && nextHeight === height) {
      return
    }

    width = nextWidth
    height = nextHeight
    const viewport = resizeArchiveSceneViewport({
      camera,
      height,
      lowPower,
      renderer,
      width,
    })
    cardTitleFontSize = viewport.cardTitleFontSize
    cardTitleAlignment = viewport.cardTitleAlignment
    motion.setCameraDistance(viewport.cameraDistance)
    motion.updateCamera(currentFrame)
  }

  const draw = (frame: ArchiveSceneFrame) => {
    currentFrame = frame
    motion.updateCamera(frame)
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

  const interaction = createArchiveSceneInteraction({
    activeCases,
    camera,
    cases,
    getFrame: () => currentFrame,
    getSize: () => ({ width, height }),
    host,
    labels,
    motion,
  })

  resize()
  draw(currentFrame)

  return {
    draw,
    getActiveRects: interaction.getActiveRects,
    pickArticleAt: interaction.pickArticleAt,
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
      yearLabelGeometry.dispose()
      yearLabels.forEach(({ material: yearMaterial, texture }) => {
        yearMaterial.dispose()
        texture.dispose()
      })
      activeSpineGeometries.forEach((spineGeometry) => {
        spineGeometry.dispose()
      })
      labels.forEach((label) => {
        label.texture.dispose()
      })
      spineAtlas.texture.dispose()
      spineLabelMaterial.dispose()
      labelMeshes.forEach((mesh) => {
        const meshMaterial = mesh.material
        if (Array.isArray(meshMaterial)) {
          meshMaterial.forEach((item) => {
            item.dispose()
          })
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
