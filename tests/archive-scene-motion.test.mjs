import assert from 'node:assert/strict'
import test from 'node:test'
import { createMat4, mat4Perspective, transformDirection, transformPoint } from '../lib/archive-math.ts'
import { archiveReach } from '../lib/archive-presentation.ts'
import { caseWidth, presentedOffsetX, shelfZ } from '../lib/archive-scene-constants.ts'
import { createArchiveSceneLayout } from '../lib/archive-scene-layout.ts'
import { createArchiveSceneMotion } from '../lib/archive-scene-motion.ts'

const createScene = (aspect) => {
  const articles = Array.from({ length: 9 }, (_, index) => ({
    title: `Archive article ${index}`,
    date: index < 6 ? '2026-06-23' : '2025-03-14',
  }))
  const layout = createArchiveSceneLayout(articles)
  const camera = {
    fieldOfView: 40 * Math.PI / 180, aspect, position: [0, 0, 0],
    view: createMat4(), projection: createMat4(), viewProjection: createMat4(),
  }
  mat4Perspective(camera.projection, camera.fieldOfView, aspect, 0.1, 64)
  const motion = createArchiveSceneMotion({ camera, layout })
  motion.setCameraDistance(12)
  const frame = {
    position: 0, presence: 1, speed: 0, selectedIndex: null, firstIndex: 0, lastIndex: 5,
    deltaSeconds: 1 / 60, selectionProgress: 0, hovered: false,
  }
  const update = () => motion.update(frame)
  update()
  return { camera, layout, frame, motion, update }
}

const restCenter = (layout, index) => transformPoint([0, 0, 0], layout.restMatrices[index], [0, 0, 0])

test('horizontal browsing keeps the shelf at a fixed screen height through extraction and reversal', () => {
  for (const [width, height, hz] of [[393, 690, 60], [1280, 720, 120]]) {
    const { camera, layout, frame, update } = createScene(width / height)
    frame.deltaSeconds = 1 / hz
    // Fixed points on the actual shelf geometry must not bob as covers move.
    const points = [0, 3, 5].map((index) =>
      transformPoint([0, 0, 0], layout.restMatrices[index], [0, -2, 0]))
    const screenY = (point) =>
      (1 - transformPoint([0, 0, 0], camera.viewProjection, point)[1]) * height / 2
    const initialY = points.map(screenY)
    const initialPosition = [...camera.position]
    const initialView = Array.from(camera.view)
    let maxDrift = 0
    for (const direction of [1, -1]) {
      for (let step = 0; step <= hz * 2; step++) {
        const progress = step / (hz * 2)
        frame.position = -0.3 + 5.6 * (direction === 1 ? progress : 1 - progress)
        update()
        points.forEach((point, index) => {
          maxDrift = Math.max(maxDrift, Math.abs(screenY(point) - initialY[index]))
        })
        assert.equal(camera.position[1], initialPosition[1])
        assert.equal(camera.position[2], initialPosition[2])
      }
      assert.ok(Math.abs(camera.position[0] - initialPosition[0]) > 0.01,
        'horizontal input must still move the camera')
    }
    assert.ok(maxDrift < 0.01, `${width}×${height}: stationary shelf drifted ${maxDrift.toFixed(3)}px`)
    for (const element of [0, 1, 2, 4, 5, 6, 8, 9, 10]) {
      assert.ok(Math.abs(camera.view[element] - initialView[element]) < 1e-7,
        'the viewing direction never changes')
    }
  }
})

test('the camera follows the browsing position exactly, including past the shelf ends', () => {
  const { camera, layout, frame, update } = createScene(1280 / 720)
  const offset = camera.position[0] - layout.shelfXPositions[0]
  for (const position of [0, 1, 2.5, 5]) {
    frame.position = position
    assert.equal(update(), false, 'tracking adds no lag of its own')
    const lower = Math.floor(position)
    const upper = Math.min(5, lower + 1)
    const expected = layout.shelfXPositions[lower]
      + (layout.shelfXPositions[upper] - layout.shelfXPositions[lower]) * (position - lower)
    assert.ok(Math.abs(camera.position[0] - offset - expected) < 1e-9)
  }
  frame.position = 5.3
  update()
  assert.ok(camera.position[0] - offset > layout.shelfXPositions[5])
})

test('changing year shelves glides vertically without a jump and settles at the matching shelf', () => {
  const { camera, layout, frame, update } = createScene(393 / 690)
  frame.position = 4
  update()
  const initialY = camera.position[1]
  const initialX = camera.position[0]
  const shelfDelta = layout.shelfCenterYPositions[1] - layout.shelfCenterYPositions[0]
  Object.assign(frame, { position: 6, firstIndex: 6, lastIndex: 8 })
  assert.equal(update(), true)
  assert.ok(initialY - camera.position[1] < 0.2 && Math.abs(camera.position[0] - initialX) < 0.2,
    'the first frame continues from where the camera was')
  let previous = camera.position[1]
  for (let step = 0; step < 240; step++) {
    update()
    assert.ok(camera.position[1] <= previous + 1e-9
      && camera.position[1] >= initialY + shelfDelta - 1e-9,
    'the glide never reverses or overshoots')
    previous = camera.position[1]
  }
  assert.ok(Math.abs(camera.position[1] - initialY - shelfDelta) < 1e-9)
  assert.equal(update(), false, 'the animation must stop after reaching the new shelf')
})

test('entering on a later shelf starts there instead of gliding in from the first', () => {
  const { camera, layout, frame, motion, update } = createScene(1280 / 720)
  const firstShelfY = camera.position[1]
  Object.assign(frame, { position: 7, firstIndex: 6, lastIndex: 8 })
  motion.snap()
  assert.equal(update(), false)
  assert.ok(Math.abs(camera.position[1] - firstShelfY
    - (layout.shelfCenterYPositions[1] - layout.shelfCenterYPositions[0])) < 1e-9)
})

// Scrubs towards book 2 and checks the solid geometry on the way.
const scrub = (from, to, check) => {
  const { layout, frame, motion, update } = createScene(1280 / 720)
  for (let step = 0; step <= 400; step++) {
    frame.position = from + (to - from) * step / 400
    update()
    check(motion.getPose(2, frame), layout, step)
  }
}

test('a book travels straight out of the row before its cover swings open, from either side', () => {
  const front = shelfZ + caseWidth / 2
  for (const from of [2 - archiveReach, 2 + archiveReach]) {
    let previousSwing = 0
    let previousDepth = -Infinity
    scrub(from, 2, (pose, layout, step) => {
      const rest = restCenter(layout, 2)
      assert.ok(pose.swing >= previousSwing - 1e-9, 'the cover never swings back while coming out')
      previousSwing = pose.swing
      // The fore-edge is the last part to leave the row. While any of it is
      // still between the neighbours, it must not have moved sideways into them.
      for (const y of [-2.3, 2.3]) {
        const corner = transformPoint([0, 0, 0], pose.matrix, [caseWidth / 2, y, 0])
        if (corner[2] < front - 0.12) {
          assert.ok(Math.abs(corner[0] - rest[0]) < 0.3,
            `step ${step}: turned ${(corner[0] - rest[0]).toFixed(2)} sideways while still in the row`)
        }
      }
      if (pose.swing === 0) {
        assert.ok(pose.center[2] >= previousDepth - 1e-6 && Math.abs(pose.center[0] - rest[0]) < 1e-5,
          'the first move is a straight pull')
        previousDepth = pose.center[2]
      }
    })
    assert.equal(previousSwing, 1)
  }
})

test('the open cover faces the reader, centred in front of the camera', () => {
  const { camera, layout, frame, motion, update } = createScene(1280 / 720)
  frame.position = 2
  frame.selectedIndex = 2
  update()
  const pose = motion.getPose(2, frame)
  const facing = transformDirection([0, 0, 0], pose.matrix, [0, 0, 1])
  assert.ok(facing[2] / Math.hypot(...facing) > 0.85)
  assert.ok(Math.abs(pose.center[0] - (layout.shelfXPositions[2] + presentedOffsetX)) < 1e-5)
  assert.ok(Math.abs(pose.center[0] - camera.position[0]) < 1e-5)
})

test('opening an article turns the cover square to the reader and presses it flat', () => {
  const { camera, frame, motion, update } = createScene(1280 / 720)
  frame.position = 2
  frame.selectedIndex = 2
  frame.selectionProgress = 1
  update()
  const pose = motion.getPose(2, frame)
  const facing = transformDirection([0, 0, 0], pose.matrix, [0, 0, 1])
  const toCamera = camera.position.map((value, axis) => value - pose.center[axis])
  const alignment = facing.reduce((sum, value, axis) => sum + value * toCamera[axis], 0)
    / (Math.hypot(...facing) * Math.hypot(...toCamera))
  assert.ok(alignment > 0.9999)
  assert.ok(Math.hypot(...facing) < 0.06, 'the book is pressed nearly flat')
})

test('putting every book back plays the same movement without the row moving', () => {
  const { layout, frame, motion, update } = createScene(1280 / 720)
  frame.position = 3
  frame.selectedIndex = 3
  const rest = restCenter(layout, 3)
  let previousSwing = 1
  for (let step = 0; step <= 100; step++) {
    frame.presence = 1 - step / 100
    update()
    const pose = motion.getPose(3, frame)
    assert.ok(pose.swing <= previousSwing + 1e-9)
    previousSwing = pose.swing
  }
  const pose = motion.getPose(3, frame)
  assert.equal(pose.swing, 0)
  assert.ok(Math.hypot(...pose.center.map((value, axis) => value - rest[axis])) < 1e-5,
    'the book is back in its slot')
})
