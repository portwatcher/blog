import assert from 'node:assert/strict'
import test from 'node:test'
import { DirectionalLight, PerspectiveCamera, Vector3 } from 'three'
import { createArchiveSceneLayout } from '../lib/archive-scene-layout.ts'
import { createArchiveSceneMotion } from '../lib/archive-scene-motion.ts'

const createScene = (aspect) => {
  const articles = Array.from({ length: 9 }, (_, index) => ({
    title: `Archive article ${index}`,
    date: index < 6 ? '2026-06-23' : '2025-03-14',
  }))
  const layout = createArchiveSceneLayout(articles)
  const camera = new PerspectiveCamera(40, aspect, 0.1, 64)
  const motion = createArchiveSceneMotion({
    camera, layout, fillLight: new DirectionalLight(), keyLight: new DirectionalLight(),
  })
  motion.setCameraDistance(12)
  const frame = {
    position: -0.5, selectedIndex: null, firstIndex: 0, lastIndex: 5,
    deltaSeconds: 1 / 60, selectionProgress: 0, hovered: false,
  }
  const update = () => {
    const moving = motion.updateCamera(frame)
    camera.updateMatrixWorld(true)
    return moving
  }
  update()
  return { camera, layout, frame, update }
}

test('horizontal browsing keeps the shelf at a fixed screen height through extraction and reversal', () => {
  for (const [width, height, hz] of [[393, 690, 60], [1280, 720, 120]]) {
    const { camera, layout, frame, update } = createScene(width / height)
    frame.deltaSeconds = 1 / hz
    // Fixed points on the actual shelf geometry must not bob as covers move.
    const points = [0, 3, 5].map((index) =>
      new Vector3(0, -2, 0).applyMatrix4(layout.restMatrices[index]))
    const screenY = (point) => (1 - point.clone().project(camera).y) * height / 2
    const initialY = points.map(screenY)
    const initialPosition = camera.position.clone()
    const initialOrientation = camera.quaternion.clone()
    let maxDrift = 0
    for (const direction of [1, -1]) {
      for (let step = 0; step <= hz * 2; step++) {
        const progress = step / (hz * 2)
        frame.position = -0.5 + 6 * (direction === 1 ? progress : 1 - progress)
        update()
        points.forEach((point, index) => {
          maxDrift = Math.max(maxDrift, Math.abs(screenY(point) - initialY[index]))
        })
        assert.equal(camera.position.y, initialPosition.y)
        assert.equal(camera.position.z, initialPosition.z)
      }
      assert.ok(Math.abs(camera.position.x - initialPosition.x) > 0.01,
        'horizontal input must still move the camera')
    }
    assert.ok(maxDrift < 0.01, `${width}×${height}: stationary shelf drifted ${maxDrift.toFixed(3)}px`)
    assert.ok(camera.quaternion.angleTo(initialOrientation) < 1e-7)
  }
})

test('changing year shelves still moves vertically and settles at the matching shelf', () => {
  const { camera, layout, frame, update } = createScene(393 / 690)
  const initialY = camera.position.y
  const shelfDelta = layout.shelfCenterYPositions[1] - layout.shelfCenterYPositions[0]
  Object.assign(frame, { position: 5.5, firstIndex: 6, lastIndex: 8 })
  assert.equal(update(), true)
  assert.ok(camera.position.y < initialY && camera.position.y > initialY + shelfDelta,
    'year changes should travel between shelves without jumping')
  for (let step = 0; step < 180; step++) {
    update()
  }
  assert.ok(Math.abs(camera.position.y - initialY - shelfDelta) < 1e-9)
  assert.equal(update(), false, 'the animation must stop after reaching the new shelf')
})
