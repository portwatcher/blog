import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createArchiveNavigation,
  archivePresentationAt,
  archivePositionForTravel,
  archiveTravelForPosition,
  archiveTravelForInput,
} from '../lib/archive-navigation.ts'

const settle = (navigation, hz = 60) => {
  for (let frame = 0; frame < hz * 3; frame++) {
    navigation.advance(1 / hz)
  }
}

test('initial and between-book rests keep every book unselected', () => {
  const navigation = createArchiveNavigation(0, 5)
  assert.equal(navigation.selectedIndex, null)
  assert.equal(archivePresentationAt(navigation.position, 0), 0)
  navigation.moveBy(1)
  navigation.release()
  settle(navigation)
  assert.equal(navigation.selectedIndex, null)
  assert.equal(navigation.position, 0.5)
  for (const index of [0, 1]) {
    assert.equal(archivePresentationAt(navigation.position, index), 0)
  }
})

test('pointer and wheel travel stays equally slow near selection and at its center, with fast gaps', () => {
  // Observable book-distance budgets for a one-pixel gesture on a phone.
  const zones = [
    { position: 2.5, minimum: 0.0105, maximum: 0.013 },
    { position: 2.14, minimum: 0.0013, maximum: 0.0016 },
    { position: 2.09, minimum: 0.0013, maximum: 0.0016 },
    { position: 2, minimum: 0.0013, maximum: 0.0016 },
  ]
  for (const direction of [-1, 1]) {
    const navigation = createArchiveNavigation(0, 5)
    for (const zone of zones) {
      navigation.setRange(0, 5, zone.position)
      const before = navigation.position
      const delta = archiveTravelForInput(direction, 393)
      navigation.moveBy(delta)
      const distance = (navigation.position - before) * direction
      assert.ok(distance >= zone.minimum && distance <= zone.maximum,
        `position ${zone.position}, direction ${direction}: moved ${distance} books`)
      navigation.moveBy(-delta)
      assert.ok(Math.abs(navigation.position - before) < 1e-10,
        'reversing the same input must retrace the motion without a dead zone')
    }
  }
})

test('release in the selection zone settles continuously and holds even after a fast gesture', () => {
  const navigation = createArchiveNavigation(0, 5)
  navigation.setRange(0, 5, 2.07)
  assert.equal(navigation.selectedIndex, 2)
  const before = navigation.position
  navigation.release(8)
  assert.equal(navigation.position, before, 'release must not teleport the book')
  navigation.advance(1 / 60)
  assert.ok(navigation.position < before && navigation.position > 2)
  settle(navigation)
  assert.equal(navigation.position, 2)
  assert.equal(navigation.selectedIndex, 2)
})

test('continuing or reversing input immediately takes over a running settle', () => {
  const navigation = createArchiveNavigation(0, 5)
  navigation.hold(1)
  navigation.goTo(4)
  navigation.advance(1 / 60)
  const before = navigation.position
  navigation.moveBy(-0.001)
  assert.ok(navigation.position < before)
  const interrupted = navigation.position
  settle(navigation)
  assert.equal(navigation.position, interrupted)
  navigation.moveBy(archiveTravelForPosition(2.5) - navigation.travel)
  assert.equal(navigation.selectedIndex, null)
  assert.equal(archivePresentationAt(navigation.position, 2), 0)
})

test('input batching and refresh rate do not change travel or settling', () => {
  const whole = createArchiveNavigation(0, 5)
  const split = createArchiveNavigation(0, 5)
  whole.moveBy(3.27)
  for (let event = 0; event < 327; event++) {
    split.moveBy(0.01)
  }
  assert.ok(Math.abs(whole.position - split.position) < 1e-10)
  whole.goTo(3)
  split.goTo(3)
  for (let frame = 0; frame < 12; frame++) {
    whole.advance(1 / 60)
  }
  for (let frame = 0; frame < 24; frame++) {
    split.advance(1 / 120)
  }
  assert.ok(Math.abs(whole.position - split.position) < 1e-10)
})

test('single-book shelves, bounds and deselection remain reachable', () => {
  const navigation = createArchiveNavigation(6, 6)
  navigation.moveBy(100)
  assert.equal(navigation.position, 6.5)
  assert.equal(navigation.selectedIndex, null)
  navigation.goTo(6)
  settle(navigation)
  assert.equal(navigation.selectedIndex, 6)
  navigation.deselect()
  settle(navigation)
  assert.equal(navigation.selectedIndex, null)
  navigation.setRange(12, 17)
  assert.equal(navigation.position, 11.5)
  navigation.moveBy(0.5)
  assert.equal(navigation.selectedIndex, 12)
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
