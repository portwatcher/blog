import {
  Object3D,
  Vector3,
} from 'three'
import type {
  DirectionalLight,
  PerspectiveCamera,
} from 'three'
import {
  cameraDepthOffset,
  cameraY,
  clamp,
  mix,
  pullDistance,
  shelfY,
  spinePitch,
  shelfZ,
  smootherstep,
  turnStart,
} from './archive-scene-constants'
import { archivePresentationAt } from './archive-navigation'
import type { ArchiveSceneLayout } from './archive-scene-layout'
import type {
  ArchiveCasePose,
  ArchiveSceneFrame,
} from './archive-scene-types'

interface ArchiveSceneMotionOptions {
  camera: PerspectiveCamera
  fillLight: DirectionalLight
  keyLight: DirectionalLight
  layout: ArchiveSceneLayout
}

export const createArchiveSceneMotion = (
  options: ArchiveSceneMotionOptions,
) => {
  const {
    camera,
    fillLight,
    keyLight,
    layout,
  } = options
  const {
    caseLeanAngles,
    caseScales,
    caseYawAngles,
    shelfCenterYPositions,
    shelfIndexByArticle,
    shelfXPositions,
    shelfYPositions,
  } = layout
  const poseObject = new Object3D()
  const shelfRotationObject = new Object3D()
  const displayRotationObject = new Object3D()
  const facingObject = new Object3D()
  const cameraTarget = new Vector3()
  const poseResult: ArchiveCasePose = {
    matrix: poseObject.matrix,
    faceVisibility: 0,
  }
  let cameraDistance = 10

  displayRotationObject.rotation.set(-0.16, 0.4, -0.1, 'XYZ')

  let smoothedX = 0
  let smoothedShelfY = shelfY
  let cameraInitialized = false

  const presentationForIndex = (articleIndex: number, frame: ArchiveSceneFrame) =>
    archivePresentationAt(frame.position, articleIndex)

  const slideForPresentation = (presentation: number) =>
    // Spread extraction across more of the approach, while leaving enough
    // clearance before the cover turns past its neighbors.
    smootherstep(0, 0.88, presentation)

  const updateCamera = (frame: ArchiveSceneFrame) => {
    const lower = clamp(Math.floor(frame.position), frame.firstIndex, frame.lastIndex)
    const upper = clamp(Math.ceil(frame.position), frame.firstIndex, frame.lastIndex)
    const fraction = clamp(frame.position - lower, 0, 1)
    const lowerPresentation = presentationForIndex(lower, frame)
    const upperPresentation = presentationForIndex(upper, frame)
    const presentation = Math.max(lowerPresentation, upperPresentation)
    const turn = smootherstep(turnStart, 1, presentation)
    // Linear shelf tracking has no stationary sections or handoff discontinuity.
    const edgeOffset = (frame.position - clamp(
      frame.position, frame.firstIndex, frame.lastIndex,
    )) * spinePitch
    const focusX = mix(shelfXPositions[lower], shelfXPositions[upper], fraction)
      + edgeOffset - 0.1 * turn
    const shelfCenter = shelfCenterYPositions[shelfIndexByArticle[frame.firstIndex]] ?? shelfY
    const follow = cameraInitialized ? 1 - Math.exp(-26 * frame.deltaSeconds) : 1
    smoothedX = mix(smoothedX, focusX, follow)
    smoothedShelfY = mix(smoothedShelfY, shelfCenter, follow)
    cameraInitialized = true
    const moving = Math.abs(smoothedX - focusX) > 0.001
      || Math.abs(smoothedShelfY - shelfCenter) > 0.001
    if (!moving) {
      smoothedX = focusX
      smoothedShelfY = shelfCenter
    }
    // Track the shelf, not the rising/receding covers. A fixed look direction
    // keeps stationary books vertically still during a horizontal pan. Only an
    // explicit year change moves both camera and target to another shelf height.
    camera.position.set(
      smoothedX,
      smoothedShelfY + (cameraY - shelfY),
      shelfZ + cameraDistance + cameraDepthOffset,
    )
    cameraTarget.set(smoothedX, smoothedShelfY + 0.56, shelfZ + pullDistance)
    camera.lookAt(cameraTarget)
    keyLight.position.set(cameraTarget.x - 4.5, cameraTarget.y + 6, cameraTarget.z + 7)
    keyLight.target.position.copy(cameraTarget)
    fillLight.position.set(cameraTarget.x + 5, cameraTarget.y - 1.5, cameraTarget.z + 4)
    fillLight.target.position.copy(cameraTarget)
    return moving
  }

  const getPose = (
    articleIndex: number,
    frame: ArchiveSceneFrame,
  ): ArchiveCasePose => {
    const presented = articleIndex === frame.selectedIndex
    const presentation = presentationForIndex(articleIndex, frame)
    const slide = slideForPresentation(presentation)
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

  return {
    getPose,
    setCameraDistance(value: number) {
      cameraDistance = value
    },
    updateCamera,
  }
}

export type ArchiveSceneMotion = ReturnType<typeof createArchiveSceneMotion>
