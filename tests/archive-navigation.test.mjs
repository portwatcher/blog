import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createArchiveNavigation,
  archivePresentationAt,
  archivePositionForTravel,
  archiveTravelForPosition,
} from '../lib/archive-navigation.ts'

const settle = (navigation, hz = 60) => {
  for (let frame = 0; frame < hz * 3; frame++) {
    navigation.advance(1 / hz)
  }
}

test('initial and explicitly deselected rests keep every book unselected', () => {
  const navigation = createArchiveNavigation(0, 5)
  assert.equal(navigation.selectedIndex, null)
  assert.equal(archivePresentationAt(navigation.position, 0), 0)
  navigation.hold(1)
  navigation.deselect()
  settle(navigation)
  assert.equal(navigation.selectedIndex, null)
  assert.equal(navigation.position, 1.5)
  for (const index of [1, 2]) {
    assert.equal(archivePresentationAt(navigation.position, index), 0)
  }
})

test('release sticks to the nearer selected book on either side of each midpoint', () => {
  const navigation = createArchiveNavigation(0, 5)
  for (const [from, position, expected] of [
    [1, 1.49, 1], [1, 1.51, 2],
    [2, 1.51, 2], [2, 1.49, 1],
    [2, 2.49, 2], [2, 2.51, 3],
    [3, 2.51, 3], [3, 2.49, 2],
    [2, 2.07, 2],
  ]) {
    navigation.hold(from)
    navigation.moveBy(archiveTravelForPosition(position) - navigation.travel)
    const before = navigation.position
    navigation.release()
    assert.equal(navigation.position, before, 'release must not teleport the book')
    navigation.advance(1 / 60)
    assert.ok(navigation.position > Math.min(before, expected)
      && navigation.position < Math.max(before, expected), 'settling must approach the chosen book')
    settle(navigation)
    assert.equal(navigation.position, expected, `release at ${position} from ${from}`)
    assert.equal(navigation.selectedIndex, expected)
  }
})

test('every delta moves the scene, with more resistance near a book, in either direction', () => {
  for (const direction of [-1, 1]) {
    const navigation = createArchiveNavigation(0, 5)
    navigation.hold(2)
    const center = navigation.position
    navigation.moveBy(direction * 0.001)
    const resisted = Math.abs(navigation.position - center)
    assert.ok(resisted > 0)
    navigation.setRange(0, 5, 2.5)
    navigation.moveBy(direction * 0.001)
    assert.ok(Math.abs(navigation.position - 2.5) > resisted * 2)
    navigation.moveBy(-direction * 0.001)
    assert.ok(Math.abs(navigation.position - 2.5) < 1e-10)
  }
})

test('continuing or reversing input immediately takes over a running release snap', () => {
  const navigation = createArchiveNavigation(0, 5)
  navigation.hold(1)
  navigation.moveBy(archiveTravelForPosition(1.51) - navigation.travel)
  navigation.release()
  navigation.advance(1 / 60)
  const before = navigation.position
  navigation.moveBy(-0.001)
  assert.ok(navigation.position < before)
  const interrupted = navigation.position
  settle(navigation)
  assert.equal(navigation.position, interrupted)
  navigation.moveBy(archiveTravelForPosition(1.49) - navigation.travel)
  navigation.release()
  settle(navigation)
  assert.equal(navigation.selectedIndex, 1)
})

test('input batching and refresh rate do not change travel or settling', () => {
  const whole = createArchiveNavigation(0, 5)
  const split = createArchiveNavigation(0, 5)
  whole.moveBy(3.27)
  for (let event = 0; event < 327; event++) {
    split.moveBy(0.01)
  }
  assert.ok(Math.abs(whole.position - split.position) < 1e-10)
  whole.release()
  split.release()
  for (let frame = 0; frame < 12; frame++) {
    whole.advance(1 / 60)
  }
  for (let frame = 0; frame < 24; frame++) {
    split.advance(1 / 120)
  }
  assert.ok(Math.abs(whole.position - split.position) < 1e-10)
})

test('release respects shelf bounds and single-book shelves', () => {
  const navigation = createArchiveNavigation(6, 6)
  for (const delta of [-100, 100]) {
    navigation.moveBy(delta)
    assert.equal(navigation.selectedIndex, null)
    navigation.release()
    settle(navigation)
    assert.equal(navigation.position, 6)
    assert.equal(navigation.selectedIndex, 6)
  }
  navigation.deselect()
  settle(navigation)
  assert.equal(navigation.selectedIndex, null)
  navigation.setRange(12, 17)
  assert.equal(navigation.position, 11.5)
  for (const [position, expected] of [[11.5, 12], [17.5, 17]]) {
    navigation.setRange(12, 17, position)
    navigation.release()
    settle(navigation)
    assert.equal(navigation.selectedIndex, expected)
  }
})

test('travel mapping is reversible and continuous across shelf indices', () => {
  let previous = -Infinity
  for (let step = -500; step <= 1000; step++) {
    const position = step / 100
    const travel = archiveTravelForPosition(position)
    assert.ok(travel > previous)
    assert.ok(Math.abs(archivePositionForTravel(travel) - position) < 1e-10)
    previous = travel
  }
})
