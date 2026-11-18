import {
  createMat4,
  lerpVec3,
  mat4Compose,
  mat4LookAt,
  mat4Multiply,
  quatFacing,
  quatFromEuler,
  quatRotate,
  quatSlerp,
  setVec3,
} from './archive-math'
import type { Quat, Vec3 } from './archive-math'
import { archiveDistance, archivePullAt, archiveSwingAt } from './archive-presentation'
import {
  cameraDepthOffset,
  cameraY,
  caseWidth,
  clamp,
  mix,
  presentedLift,
  presentedOffsetX,
  pulledLift,
  pullDistance,
  shelfY,
  spinePitch,
  shelfZ,
  smootherstep,
} from './archive-scene-constants'
import type { ArchiveSceneLayout } from './archive-scene-layout'
import type {
  ArchiveCamera,
  ArchiveCasePose,
  ArchiveSceneFrame,
} from './archive-scene-types'

interface ArchiveSceneMotionOptions {
  camera: ArchiveCamera
  layout: ArchiveSceneLayout
}

const rigRate = 9.5
const hoverRate = 16

export const createArchiveSceneMotion = (
  options: ArchiveSceneMotionOptions,
) => {
  const { camera, layout } = options
  const {
    caseLeanAngles,
    caseScales,
    caseYawAngles,
    shelfCenterYPositions,
    shelfIndexByArticle,
    shelfXPositions,
    shelfYPositions,
  } = layout
  const shelfRotation: Quat = [0, 0, 0, 1]
  const rotation: Quat = [0, 0, 0, 1]
  const facing: Quat = [0, 0, 0, 1]
  // Leaning back with its top towards the spine, like a tape tipped out of a
  // row and held up to the light.
  const shownRotation = quatFromEuler([0, 0, 0, 1], -0.2, 0.42, 0.13, 'XYZ')
  const cameraTarget: Vec3 = [0, 0, 0]
  const hinge: Vec3 = [0, 0, 0]
  const pulledHinge: Vec3 = [0, 0, 0]
  const shownHinge: Vec3 = [0, 0, 0]
  const spineOffset: Vec3 = [0, 0, 0]
  const center: Vec3 = [0, 0, 0]
  const scale: Vec3 = [1, 1, 1]
  const pose: ArchiveCasePose = { matrix: createMat4(), swing: 0, center }
  let cameraDistance = 10
  let rigShelf = -1
  let rigX = 0
  let rigY = 0
  let rigOffsetX = 0
  let rigOffsetY = 0
  let rigVelocityX = 0
  let rigVelocityY = 0
  let hover = 0

  const shelfXAt = (frame: ArchiveSceneFrame) => {
    const position = clamp(frame.position, frame.firstIndex, frame.lastIndex)
    const lower = Math.floor(position)
    const upper = Math.min(frame.lastIndex, lower + 1)
    // Past either end the rubber band keeps travelling at one book per unit.
    return mix(shelfXPositions[lower], shelfXPositions[upper], position - lower)
      + (frame.position - position) * spinePitch
  }

  const updateCamera = (frame: ArchiveSceneFrame) => {
    const shelf = shelfIndexByArticle[frame.firstIndex] ?? 0
    const idealX = shelfXAt(frame) + presentedOffsetX
    const idealY = shelfCenterYPositions[shelf] ?? shelfY
    if (rigShelf >= 0 && shelf !== rigShelf) {
      // Changing year teleports the browsing position. Carry the camera's
      // current place over as an offset and let it glide to the new shelf.
      rigOffsetX += rigX - idealX
      rigOffsetY += rigY - idealY
    }
    rigShelf = shelf
    rigX = idealX
    rigY = idealY

    const seconds = frame.deltaSeconds
    const decay = Math.exp(-rigRate * seconds)
    const carriedX = rigVelocityX + rigRate * rigOffsetX
    const carriedY = rigVelocityY + rigRate * rigOffsetY
    const nextX = (rigOffsetX + carriedX * seconds) * decay
    const nextY = (rigOffsetY + carriedY * seconds) * decay
    rigVelocityX = (carriedX - rigRate * (rigOffsetX + carriedX * seconds)) * decay
    rigVelocityY = (carriedY - rigRate * (rigOffsetY + carriedY * seconds)) * decay
    rigOffsetX = nextX
    rigOffsetY = nextY
    const moving = Math.hypot(rigOffsetX, rigOffsetY) > 0.0008
      || Math.hypot(rigVelocityX, rigVelocityY) > 0.008
    if (!moving) {
      rigOffsetX = rigOffsetY = rigVelocityX = rigVelocityY = 0
    }

    // Track the shelf, not the rising covers. A fixed look direction keeps
    // stationary books vertically still while the row pans; only an explicit
    // year change moves both camera and target to another shelf height.
    const x = idealX + rigOffsetX
    const y = idealY + rigOffsetY
    setVec3(camera.position, x, y + (cameraY - shelfY), shelfZ + cameraDistance + cameraDepthOffset)
    setVec3(cameraTarget, x, y + presentedLift, shelfZ + pullDistance)
    mat4LookAt(camera.view, camera.position, cameraTarget)
    mat4Multiply(camera.viewProjection, camera.projection, camera.view)
    return moving
  }

  const updateHover = (frame: ArchiveSceneFrame) => {
    const goal = frame.hovered
      && frame.selectedIndex !== null
      && frame.selectionProgress === 0
      && archiveDistance(frame.position, frame.presence, frame.selectedIndex) < 0.03
      ? 1
      : 0
    hover = goal + (hover - goal) * Math.exp(-hoverRate * frame.deltaSeconds)
    if (Math.abs(hover - goal) < 0.002) {
      hover = goal
    }
    return hover !== goal
  }

  const getPose = (
    articleIndex: number,
    frame: ArchiveSceneFrame,
  ): ArchiveCasePose => {
    const presented = articleIndex === frame.selectedIndex
    // A book cannot turn between its neighbours, so it first travels straight
    // out (towards the camera, where the move reads as the spine growing) and
    // only then swings open.
    const distance = archiveDistance(frame.position, frame.presence, articleIndex)
    const pull = archivePullAt(distance)
    const swing = archiveSwingAt(distance)
    const selected = presented ? frame.selectionProgress : 0
    const align = smootherstep(0, 0.62, selected)
    const flatten = smootherstep(0.62, 1, selected)
    const lifted = presented ? hover : 0
    const caseScale = caseScales[articleIndex]
    const grow = 1 + lifted * 0.012
    const halfWidth = caseWidth * caseScale.x / 2

    quatFromEuler(
      shelfRotation, 0, Math.PI / 2 + caseYawAngles[articleIndex], caseLeanAngles[articleIndex], 'ZYX',
    )
    // Follow the spine edge, where a hand would hold the book: straight out of
    // the row first, then across to where the opened cover is centred.
    quatRotate(spineOffset, shelfRotation, setVec3(spineOffset, -halfWidth, 0, 0))
    setVec3(
      hinge,
      shelfXPositions[articleIndex] + spineOffset[0],
      shelfYPositions[articleIndex] + spineOffset[1],
      shelfZ + spineOffset[2],
    )
    setVec3(pulledHinge, hinge[0], hinge[1] + pulledLift, hinge[2] + pullDistance)
    quatRotate(spineOffset, shownRotation, setVec3(spineOffset, -halfWidth, 0, 0))
    setVec3(
      shownHinge,
      shelfXPositions[articleIndex] + presentedOffsetX + spineOffset[0],
      shelfYPositions[articleIndex] + presentedLift + spineOffset[1],
      shelfZ + pullDistance + lifted * 0.1 + spineOffset[2],
    )
    lerpVec3(hinge, hinge, pulledHinge, pull)
    lerpVec3(hinge, hinge, shownHinge, swing)

    quatSlerp(rotation, shelfRotation, shownRotation, swing)
    quatRotate(spineOffset, rotation, setVec3(spineOffset, halfWidth, 0, 0))
    setVec3(center, hinge[0] + spineOffset[0], hinge[1] + spineOffset[1], hinge[2] + spineOffset[2])

    if (align > 0) {
      // Opening an article turns the cover square to the reader.
      quatFacing(facing, center, camera.position)
      quatSlerp(rotation, rotation, facing, align)
    }

    setVec3(scale, caseScale.x * grow, caseScale.y * grow, mix(caseScale.z * grow, 0.045, flatten))
    mat4Compose(pose.matrix, center, rotation, scale)
    pose.swing = swing
    return pose
  }

  return {
    getPose,
    setCameraDistance(value: number) {
      cameraDistance = value
    },
    // Distance from the camera to the spines resting in the row.
    get shelfDepth() {
      return cameraDistance + cameraDepthOffset - caseWidth / 2
    },
    // Start the next frame on its shelf instead of gliding there.
    snap() {
      rigShelf = -1
      rigOffsetX = rigOffsetY = rigVelocityX = rigVelocityY = 0
    },
    update(frame: ArchiveSceneFrame) {
      const cameraMoving = updateCamera(frame)
      return updateHover(frame) || cameraMoving
    },
  }
}

export type ArchiveSceneMotion = ReturnType<typeof createArchiveSceneMotion>
