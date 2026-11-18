import assert from 'node:assert/strict'
import test from 'node:test'
import { createArchiveWheel } from '../lib/archive-gestures.ts'
import { createArchiveNavigation } from '../lib/archive-navigation.ts'
import {
  archiveDistance,
  archivePullAt,
  archiveReach,
  archiveSwingAt,
} from '../lib/archive-presentation.ts'

const run = (navigation, seconds, hz = 60, each = () => {}) => {
  for (let frame = 0; frame < Math.round(seconds * hz); frame++) {
    navigation.advance(1 / hz)
    each(frame)
  }
}

// Moves the pointer a distance (in books) at a steady speed.
const drag = (navigation, distance, seconds, hz = 60) => {
  const frames = Math.max(1, Math.round(seconds * hz))
  for (let frame = 0; frame < frames; frame++) {
    navigation.moveBy(distance / frames)
    navigation.advance(1 / hz)
  }
}

const open = (navigation, index) =>
  archiveSwingAt(archiveDistance(navigation.position, navigation.presence, index))

test('a shelf opens with every book in its row, and Escape puts the book back without moving', () => {
  const navigation = createArchiveNavigation(0, 5)
  assert.equal(navigation.selectedIndex, null)
  assert.equal(archivePullAt(archiveDistance(navigation.position, navigation.presence, 0)), 0)
  navigation.goTo(0)
  run(navigation, 2)
  assert.equal(navigation.selectedIndex, 0)
  assert.equal(open(navigation, 0), 1)
  navigation.deselect()
  run(navigation, 2)
  assert.equal(navigation.selectedIndex, null)
  assert.equal(navigation.position, 0)
  assert.equal(archivePullAt(archiveDistance(navigation.position, navigation.presence, 0)), 0)
  navigation.step(1)
  assert.equal(navigation.selectedIndex, 1, 'browsing brings books out again')
})

test('one flip is quick, eased at both ends and never overshoots, at any refresh rate', () => {
  const landed = [60, 120].map((hz) => {
    const navigation = createArchiveNavigation(0, 5)
    navigation.hold(2)
    navigation.step(1)
    assert.equal(navigation.position, 2, 'a step must not teleport')
    let previous = 2
    let fastest = 0
    run(navigation, 0.25, hz, () => {
      assert.ok(navigation.position >= previous && navigation.position <= 3)
      fastest = Math.max(fastest, (navigation.position - previous) * hz)
      previous = navigation.position
    })
    assert.ok(fastest < 9.5, 'no part of the flip is skipped in a frame')
    const afterQuarterSecond = navigation.position
    run(navigation, 2, hz)
    assert.equal(navigation.position, 3)
    assert.equal(navigation.advance(1 / hz), false, 'the flip must come to rest')
    return afterQuarterSecond
  })
  assert.ok(landed[0] > 2.94, 'the new book is open within a quarter of a second')
  assert.ok(Math.abs(landed[0] - landed[1]) < 1e-6)
})

test('the outgoing book is leaving the row while the incoming one is already arriving', () => {
  const navigation = createArchiveNavigation(0, 5)
  navigation.hold(2)
  navigation.step(1)
  let together = 0
  let clashed = false
  run(navigation, 1, 120, () => {
    const leaving = archiveDistance(navigation.position, navigation.presence, 2)
    const arriving = archiveDistance(navigation.position, navigation.presence, 3)
    if (archivePullAt(leaving) > 0.05 && archivePullAt(arriving) > 0.05) {
      together++
    }
    // The cover that swings shut over the next slot is shut before that
    // slot's book comes out past it.
    clashed = clashed || (archiveSwingAt(leaving) > 0.02 && archivePullAt(arriving) > 0.02)
  })
  assert.ok(together >= 4, 'the two movements overlap rather than queue')
  assert.equal(clashed, false)
})

test('however fast the input, every book on the way comes fully out and goes back', () => {
  const inputs = {
    'a burst of key presses': (navigation) => {
      navigation.step(1)
      navigation.step(1)
      navigation.step(1)
    },
    'a violent drag': (navigation) => {
      drag(navigation, 3.1, 0.05, 120)
      navigation.release()
    },
  }
  for (const [name, input] of Object.entries(inputs)) {
    const navigation = createArchiveNavigation(0, 9)
    navigation.hold(1)
    input(navigation)
    const destination = navigation.target
    assert.equal(destination, 4, name)
    const openFrames = new Map()
    run(navigation, 4, 120, () => {
      for (let index = 2; index < destination; index++) {
        if (open(navigation, index) === 1) {
          openFrames.set(index, (openFrames.get(index) ?? 0) + 1)
        }
      }
    })
    assert.equal(navigation.position, destination)
    for (let index = 2; index < destination; index++) {
      assert.ok((openFrames.get(index) ?? 0) >= 2,
        `${name}: book ${index} must be seen fully open on the way`)
      assert.equal(open(navigation, index), 0, `${name}: book ${index} must be back in its row`)
    }
  }
})

test('rapid flips are spaced so each one can be read, and a far jump still does not drag on', () => {
  const navigation = createArchiveNavigation(0, 40)
  navigation.hold(0)
  navigation.goTo(3)
  let frames = 0
  run(navigation, 3, 120, () => {
    frames += navigation.position < 2.98 ? 1 : 0
  })
  assert.ok(frames / 120 > 0.4, 'three flips take long enough to see each book')
  assert.ok(frames / 120 < 0.8)
  navigation.hold(0)
  navigation.goTo(30)
  frames = 0
  run(navigation, 6, 120, () => {
    frames += navigation.position < 29.98 ? 1 : 0
  })
  assert.ok(frames / 120 < 1.4, 'thirty books do not take thirty flips of time')
})

test('dragging scrubs the row under the pointer and can be held anywhere', () => {
  const navigation = createArchiveNavigation(0, 5)
  navigation.hold(2)
  drag(navigation, 0.3, 0.5)
  run(navigation, 0.3)
  assert.ok(navigation.dragging)
  assert.ok(Math.abs(navigation.position - 2.3) < 0.01, 'the row stays under the pointer')
  assert.ok(open(navigation, 2) > 0 && open(navigation, 2) < 1, 'the book is held part-way shut')
  drag(navigation, -0.3, 0.5)
  run(navigation, 0.3)
  assert.ok(Math.abs(navigation.position - 2) < 0.01, 'and follows the pointer back')
  assert.equal(open(navigation, 2), 1)
})

test('a book drawn part-way out follows the hand back, and goes back if simply let go', () => {
  const navigation = createArchiveNavigation(0, 9)
  navigation.hold(4)
  // Out past the point where the neighbour has started to appear...
  drag(navigation, 0.45, 0.4, 120)
  run(navigation, 0.2, 120)
  assert.ok(open(navigation, 4) < 0.05, 'the open book has closed under the hand')
  assert.ok(archivePullAt(archiveDistance(navigation.position, navigation.presence, 5)) > 0.2,
    'and the next one is part-way out of the row')
  // ...and back again by moving the other way, without letting go.
  let previous = navigation.position
  for (let frame = 0; frame < 48; frame++) {
    navigation.moveBy(-0.45 / 48)
    navigation.advance(1 / 120)
    assert.ok(navigation.position <= previous + 1e-9, 'the row never runs on ahead of the hand')
    previous = navigation.position
  }
  run(navigation, 0.2, 120)
  assert.ok(Math.abs(navigation.position - 4) < 0.01)
  assert.equal(open(navigation, 4), 1, 'the book is open again exactly as it was')
  assert.equal(archivePullAt(archiveDistance(navigation.position, navigation.presence, 5)), 0)

  drag(navigation, 0.4, 0.5, 120)
  run(navigation, 0.3, 120)
  navigation.release()
  assert.equal(navigation.target, 4, 'held still short of half-way and let go, it returns')
  run(navigation, 2, 120)
  assert.equal(navigation.position, 4)
})

test('the row stays glued to the hand: no lag to speak of, no easing of its own', () => {
  for (const hz of [60, 120]) {
    const navigation = createArchiveNavigation(0, 9)
    navigation.hold(4)
    let worst = 0
    let travelled = 0
    // A steady, unhurried drag across one and a half books.
    for (let frame = 0; frame < hz; frame++) {
      navigation.moveBy(1.5 / hz)
      travelled += 1.5 / hz
      navigation.advance(1 / hz)
      worst = Math.max(worst, Math.abs(4 + travelled - navigation.position))
    }
    assert.ok(worst < 0.04, `${hz}Hz: fell ${worst.toFixed(3)} books behind the hand`)
  }
})

test('letting go settles on the nearer book, and a flick carries to the neighbour but no further', () => {
  for (const direction of [1, -1]) {
    for (const [travel, seconds, pause, expected] of [
      [0.3, 0.5, 0.3, 0], [0.45, 0.6, 0.3, 0], [0.6, 0.6, 0.3, 1], [1.4, 0.8, 0.3, 1],
      [1.6, 0.8, 0.3, 2], [2.4, 1, 0.3, 2],
      // Still moving at release: short quick swipes turn one book.
      [0.12, 0.04, 0, 1], [0.3, 0.08, 0, 1], [0.9, 0.12, 0, 1], [1.2, 0.15, 0, 1],
    ]) {
      const navigation = createArchiveNavigation(0, 9)
      navigation.hold(4)
      drag(navigation, direction * travel, seconds, 120)
      run(navigation, pause, 120)
      const before = navigation.position
      navigation.release()
      assert.equal(navigation.position, before, 'release must not teleport the row')
      assert.equal(navigation.target, 4 + direction * expected,
        `${travel} books in ${seconds}s${pause ? ', then held' : ''}`)
      run(navigation, 2, 120)
      assert.equal(navigation.position, 4 + direction * expected)
    }
  }
})

test('a touch that barely moves changes nothing', () => {
  const navigation = createArchiveNavigation(0, 9)
  navigation.hold(4)
  drag(navigation, 0.012, 0.02, 120)
  navigation.release()
  assert.equal(navigation.target, 4)
  run(navigation, 2, 120)
  assert.equal(navigation.position, 4)
})

test('new input takes over a flip in flight without a jump', () => {
  const navigation = createArchiveNavigation(0, 5)
  navigation.hold(1)
  navigation.step(1)
  run(navigation, 0.08, 120)
  const caught = navigation.position
  assert.ok(caught > 1 && caught < 2)
  navigation.moveBy(-0.001)
  navigation.advance(1 / 120)
  assert.ok(Math.abs(navigation.position - caught) < 0.06, 'a grab catches the row where it is')
  navigation.release()
  run(navigation, 2, 120)
  assert.equal(navigation.position, 2, 'a mere touch lets the flip finish where it was going')
  navigation.step(1)
  run(navigation, 0.06, 120)
  navigation.step(1)
  assert.equal(navigation.target, 4, 'steps taken mid-flip add up')
  drag(navigation, -0.5, 0.2, 120)
  navigation.release()
  run(navigation, 2, 120)
  assert.equal(navigation.position, Math.round(navigation.position))
})

test('the shelf ends give a little and spring back', () => {
  const navigation = createArchiveNavigation(3, 6)
  navigation.hold(6)
  drag(navigation, 40, 0.5)
  run(navigation, 0.3)
  assert.ok(navigation.position > 6 && navigation.position < 6.3)
  assert.equal(navigation.target, 6)
  navigation.release()
  run(navigation, 2)
  assert.equal(navigation.position, 6)
  assert.equal(navigation.step(1), false, 'there is nothing past the end to flip to')
  navigation.hold(3)
  drag(navigation, -40, 0.5)
  run(navigation, 0.3)
  assert.ok(navigation.position < 3 && navigation.position > 2.7)
  navigation.release()
  run(navigation, 2)
  assert.equal(navigation.position, 3)
})

test('changing shelf arrives with the row closed, then brings its book out after the camera', () => {
  const navigation = createArchiveNavigation(0, 5)
  navigation.hold(4)
  navigation.setRange(12, 17, 14)
  assert.equal(navigation.position, 14)
  assert.equal(navigation.selectedIndex, null)
  assert.equal(archivePullAt(archiveDistance(navigation.position, navigation.presence, 14)), 0)
  navigation.goTo(14, 0.24)
  run(navigation, 0.2)
  assert.equal(navigation.presence, 0, 'the book waits for the camera')
  run(navigation, 2)
  assert.equal(open(navigation, 14), 1)
  navigation.setRange(6, 6, 99)
  assert.equal(navigation.position, 6)
})

test('a book is out of the row before it turns, and shut before it goes back', () => {
  for (let step = 0; step <= 200; step++) {
    const distance = archiveReach * step / 200
    if (archiveSwingAt(distance) > 0.02) {
      assert.ok(archivePullAt(distance) > 0.97, `turning at ${distance} while still in the row`)
    }
  }
  assert.equal(archivePullAt(archiveReach), 0)
  assert.equal(archiveSwingAt(0.05), 1)
})

const pixelsPerBook = 240

// A trackpad swipe as the browser reports it: a fast rise, then inertia that
// decays for most of a second. Returns what the row was asked to do.
const swipe = (wheel, start, peak, direction = 1) => {
  let time = start
  let moved = 0
  let settles = 0
  const deltas = [2, 6, peak * 0.5, peak, peak * 0.9]
  for (let value = peak * 0.75; value >= 1; value *= 0.86) {
    deltas.push(value)
  }
  for (const delta of deltas) {
    const { move, settle } = wheel.push(direction * delta, time, pixelsPerBook)
    moved += move
    settles += settle ? 1 : 0
    time += 16
  }
  return { moved, settles, end: time }
}

test('a trackpad swipe moves the row with the fingers, and inertia can finish a flip but not start another', () => {
  for (const direction of [1, -1]) {
    const gentle = swipe(createArchiveWheel(), 1000, 8, direction)
    assert.ok(gentle.moved * direction > 0.1 && gentle.moved * direction < 0.5)
    assert.equal(gentle.settles, 0, 'a gentle swipe leaves the row where the fingers put it')
    for (const peak of [60, 150, 400]) {
      const hard = swipe(createArchiveWheel(), 1000, peak, direction)
      assert.ok(Math.abs(hard.moved - direction) < 1e-9, `peak ${peak}: exactly one book`)
      assert.equal(hard.settles, 1, 'and the row is told to rest as soon as it gets there')
    }
  }
})

test('reversing the fingers takes the book back the way it came', () => {
  const wheel = createArchiveWheel()
  let moved = 0
  let time = 0
  for (const delta of [20, 30, 30, 30, -25, -30, -30, -25]) {
    moved += wheel.push(delta, time, pixelsPerBook).move
    time += 16
    if (delta === 30 && time === 64) {
      assert.ok(moved > 0.4, 'part-way out')
    }
  }
  assert.ok(Math.abs(moved) < 1e-9, 'and all the way back')
  const navigation = createArchiveNavigation(0, 5)
  navigation.hold(2)
  navigation.moveBy(0.2)
  run(navigation, 0.11)
  navigation.release(false, wheel.commit)
  assert.equal(navigation.target, 2, 'a short scroll that stops is not a flip')
  navigation.moveBy(0.35)
  run(navigation, 0.11)
  navigation.release(false, wheel.commit)
  assert.equal(navigation.target, 3, 'a longer one is')
})

test('a second push goes one book further, after a pause or straight through the inertia of the first', () => {
  const wheel = createArchiveWheel()
  const first = swipe(wheel, 1000, 150)
  assert.ok(Math.abs(swipe(wheel, first.end + 300, 150).moved - 1) < 1e-9)
  const eager = createArchiveWheel()
  let time = 2000
  let moved = 0
  for (const delta of [3, 40, 160, 140, 110, 84, 66, 52, 40, 32, 24, 18, 14, 10, 8, 6, 6, 80, 180, 140, 100]) {
    moved += eager.push(delta, time, pixelsPerBook).move
    time += 16
  }
  assert.ok(Math.abs(moved - 2) < 1e-9)
})

test('one notch of a wheel is a flip, and a stray touch is not', () => {
  const navigation = createArchiveNavigation(0, 5)
  const notch = (delta, time) => {
    const wheel = createArchiveWheel()
    navigation.moveBy(wheel.push(delta, time, pixelsPerBook).move)
    run(navigation, 0.11)
    navigation.release(false, wheel.commit)
    return navigation.target
  }
  navigation.hold(2)
  assert.equal(notch(100, 0), 3)
  run(navigation, 1)
  assert.equal(notch(-100, 2000), 2)
  run(navigation, 1)
  assert.equal(notch(4, 4000), 3, 'one slow notch of a fine wheel still counts')
  run(navigation, 1)
  assert.equal(notch(1.5, 6000), 3, 'a brush of the trackpad does not')
})
