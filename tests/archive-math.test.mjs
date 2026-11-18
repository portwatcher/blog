import assert from 'node:assert/strict'
import test from 'node:test'
import { Euler, Matrix4, Object3D, PerspectiveCamera, Quaternion, Vector3 } from 'three'
import {
  createMat4,
  mat4Compose,
  mat4Invert,
  mat4LookAt,
  mat4Multiply,
  mat4Perspective,
  quatFacing,
  quatFromEuler,
  quatRotate,
  quatSlerp,
  transformDirection,
  transformPoint,
} from '../lib/archive-math.ts'

// three.js is the independent reference: the scene no longer ships it, but
// its maths is the yardstick for this small replacement.
let seed = 7
const random = (scale = 1) => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  return (seed / 4294967296 * 2 - 1) * scale
}
const close = (actual, expected, tolerance = 1e-5, message = '') => {
  const values = Array.from(expected)
  assert.equal(actual.length, values.length, message)
  values.forEach((value, index) => {
    assert.ok(Math.abs(actual[index] - value) < tolerance,
      `${message} [${index}]: ${actual[index]} vs ${value}`)
  })
}
const sameRotation = (actual, expected, message) => {
  const dot = Math.abs(actual[0] * expected.x + actual[1] * expected.y
    + actual[2] * expected.z + actual[3] * expected.w)
  assert.ok(dot > 1 - 1e-6, `${message}: ${actual} vs ${expected.toArray()}`)
}

test('Euler angles, slerp and vector rotation agree with the reference', () => {
  for (let round = 0; round < 200; round++) {
    const angles = [random(3), random(3), random(3)]
    for (const order of ['XYZ', 'ZYX']) {
      const expected = new Quaternion().setFromEuler(new Euler(...angles, order))
      const actual = quatFromEuler([0, 0, 0, 1], ...angles, order)
      sameRotation(actual, expected, `euler ${order}`)
      const other = new Quaternion().setFromEuler(new Euler(random(3), random(3), random(3)))
      const progress = (random() + 1) / 2
      sameRotation(
        quatSlerp([0, 0, 0, 1], actual, other.toArray(), progress),
        new Quaternion().slerpQuaternions(expected, other, progress),
        'slerp',
      )
      const vector = [random(5), random(5), random(5)]
      close(quatRotate([0, 0, 0], actual, vector),
        new Vector3(...vector).applyQuaternion(expected).toArray(), 1e-5, 'rotate')
    }
  }
})

test('compose, multiply and invert agree with the reference', () => {
  for (let round = 0; round < 200; round++) {
    const position = [random(20), random(20), random(20)]
    const rotation = new Quaternion().setFromEuler(new Euler(random(3), random(3), random(3)))
    const scale = [1 + random(0.4), 1 + random(0.4), 1 + random(0.4)]
    const expected = new Matrix4().compose(
      new Vector3(...position), rotation, new Vector3(...scale),
    )
    const actual = mat4Compose(createMat4(), position, rotation.toArray(), scale)
    close(actual, expected.elements, 1e-5, 'compose')
    const other = new Matrix4().compose(
      new Vector3(random(5), random(5), random(5)),
      new Quaternion().setFromEuler(new Euler(random(3), random(3), random(3))),
      new Vector3(1, 1, 1),
    )
    const otherArray = new Float32Array(other.elements)
    close(mat4Multiply(createMat4(), actual, otherArray),
      new Matrix4().multiplyMatrices(expected, other).elements, 1e-4, 'multiply')
    close(mat4Multiply(actual.slice(), actual, otherArray),
      new Matrix4().multiplyMatrices(expected, other).elements, 1e-4, 'multiply in place')
    const inverse = createMat4()
    assert.equal(mat4Invert(inverse, actual), true)
    close(inverse, expected.clone().invert().elements, 1e-4, 'invert')
    const direction = [random(1), random(1), random(1)]
    close(transformDirection([0, 0, 0], actual, direction),
      new Vector3(...direction).transformDirection(expected)
        .multiplyScalar(new Vector3(...direction).applyMatrix4(expected.clone().setPosition(0, 0, 0)).length())
        .toArray(), 1e-4, 'direction')
  }
  const flat = mat4Compose(createMat4(), [1, 2, 3], [0, 0, 0, 1], [0, 0, 0])
  const untouched = createMat4()
  assert.equal(mat4Invert(untouched, flat), false, 'a vanished book has no inverse')
  close(untouched, createMat4(), 1e-9, 'and leaves the output alone')
})

test('the camera matrices project points exactly as the reference camera does', () => {
  for (const [aspect, fov] of [[1280 / 720, 40], [393 / 690, 40], [2.2, 55]]) {
    for (let round = 0; round < 60; round++) {
      const eye = [random(30), random(30), 8 + random(6)]
      const target = [eye[0] + random(2), eye[1] + random(2), random(3) - 2]
      const camera = new PerspectiveCamera(fov, aspect, 0.1, 64)
      camera.position.set(...eye)
      camera.lookAt(...target)
      camera.updateMatrixWorld(true)
      camera.updateProjectionMatrix()
      const view = mat4LookAt(createMat4(), eye, target)
      close(view, camera.matrixWorldInverse.elements, 1e-4, 'view')
      const projection = mat4Perspective(createMat4(), fov * Math.PI / 180, aspect, 0.1, 64)
      close(projection, camera.projectionMatrix.elements, 1e-5, 'projection')
      const viewProjection = mat4Multiply(createMat4(), projection, view)
      const point = [target[0] + random(6), target[1] + random(6), target[2] + random(3)]
      close(transformPoint([0, 0, 0], viewProjection, point),
        new Vector3(...point).project(camera).toArray(), 1e-4, 'project')
    }
  }
})

test('facing a point matches turning an object to look at it', () => {
  for (let round = 0; round < 200; round++) {
    const from = [random(10), random(10), random(10)]
    const to = [from[0] + random(8), from[1] + random(3), from[2] + 2 + random(1) + 4]
    const object = new Object3D()
    object.position.set(...from)
    object.lookAt(...to)
    sameRotation(quatFacing([0, 0, 0, 1], from, to), object.quaternion, 'facing')
  }
})
