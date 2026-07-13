import {
  Object3D,
  Vector3,
} from 'three'
import type {
  DirectionalLight,
  PerspectiveCamera,
} from 'three'
import {
  browsingPullRatio,
  cameraDepthOffset,
  cameraY,
  clamp,
  mix,
  pullDistance,
  shelfY,
  shelfZ,
  smootherstep,
  turnStart,
} from './archive-scene-constants'
import type { ArchiveSceneLayout } from './archive-scene-layout'
import type {
  ArchiveCasePose,
  ArchiveSceneFrame,
} from './archive-scene-types'

interface ArchiveSceneMotionOptions {
  articleCount: number
  camera: PerspectiveCamera
  fillLight: DirectionalLight
  keyLight: DirectionalLight
  layout: ArchiveSceneLayout
}

export const createArchiveSceneMotion = (
  options: ArchiveSceneMotionOptions,
) => {
  const {
    articleCount,
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
    const lower = clamp(Math.floor(frame.position), 0, articleCount - 1)
    const upper = clamp(Math.ceil(frame.position), 0, articleCount - 1)
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
    let focusX = mix(
      shelfXPositions[lower],
      shelfXPositions[upper],
      handoff,
    ) - 0.1 * turn
    let focusBaseY = mix(
      shelfYPositions[lower],
      shelfYPositions[upper],
      handoff,
    )
    let focusShelfCenterY = mix(
      shelfCenterYPositions[shelfIndexByArticle[lower]] ?? shelfY,
      shelfCenterYPositions[shelfIndexByArticle[upper]] ?? shelfY,
      handoff,
    )
    let cameraSlide = slide
    let cameraTurn = turn
    let cameraLift = lift

    if (frame.shelfTransitionProgress < 0.999) {
      const fromIndex = clamp(
        Math.round(frame.cameraFromIndex),
        0,
        articleCount - 1,
      )
      const toIndex = clamp(
        Math.round(frame.cameraToIndex),
        0,
        articleCount - 1,
      )
      const transition = smootherstep(
        0,
        1,
        frame.shelfTransitionProgress,
      )
      focusX = mix(
        shelfXPositions[fromIndex],
        shelfXPositions[toIndex],
        transition,
      )
      focusBaseY = mix(
        shelfYPositions[fromIndex],
        shelfYPositions[toIndex],
        transition,
      )
      focusShelfCenterY = mix(
        shelfCenterYPositions[shelfIndexByArticle[fromIndex]] ?? shelfY,
        shelfCenterYPositions[shelfIndexByArticle[toIndex]] ?? shelfY,
        transition,
      )
      cameraSlide = browsingPullRatio
      cameraTurn = 0
      cameraLift = 0
    }

    focusX -= 0.1 * (cameraTurn - turn)
    const focusY = focusBaseY + 0.56 * cameraLift
    const focusZ = shelfZ + pullDistance * cameraSlide
    const selected = smootherstep(0, 1, frame.selectionProgress)
    const shoulder = camera.aspect < 0.72 ? 0.18 : 0.3
    const browsingCameraX = focusX + shoulder

    cameraTarget.set(focusX, focusY, focusZ)
    camera.position.set(
      mix(browsingCameraX, focusX, selected),
      focusShelfCenterY + (cameraY - shelfY),
      shelfZ + cameraDistance + cameraDepthOffset,
    )
    camera.lookAt(cameraTarget)

    keyLight.position.set(focusX - 4.5, focusY + 6, focusZ + 7)
    keyLight.target.position.copy(cameraTarget)
    fillLight.position.set(focusX + 5, focusY - 1.5, focusZ + 4)
    fillLight.target.position.copy(cameraTarget)
  }

  const getPose = (
    articleIndex: number,
    frame: ArchiveSceneFrame,
  ): ArchiveCasePose => {
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

  return {
    getPose,
    setCameraDistance(value: number) {
      cameraDistance = value
    },
    updateCamera,
  }
}

export type ArchiveSceneMotion = ReturnType<typeof createArchiveSceneMotion>
