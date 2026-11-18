// Browsing lives in book units: a position of n has book n open in front of
// the reader. The display position is the only animated quantity; every book's
// pose follows from it (see archive-presentation.ts).
//
// Input sets a goal and the display follows it under a speed limit, so however
// fast the input, each book on the way is fully brought out and put back. Under
// a pointer the display stays glued to the hand: a book can be drawn part-way
// out, held there, and pushed back by moving the other way. A key or button
// press has no hand to follow, so its flip is eased by a spring instead.
const flipRate = 24
const followRate = 70
const cruiseSpeed = 9
const dwellSpeed = 5
const hurry = 0.6
const presenceRate = 13
// A touch that travels less than this is a tap, not a drag.
const tapTravel = 0.02
// Letting go while still moving this fast carries on to the neighbour.
const flickSpeed = 1.2
const flickTravel = 0.08
const edgeSlack = 0.3
const edgeReach = 1.2
const stepSeconds = 1 / 240
const restDistance = 0.0004
const restSpeed = 0.004

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

// The familiar rubber band: travel past either end is progressively absorbed
// and can never exceed `edgeSlack`.
const absorb = (distance: number) =>
  edgeSlack * (1 - 1 / (distance * 0.55 / edgeSlack + 1))

export const createArchiveNavigation = (first: number, last: number) => {
  let minimum = first
  let maximum = last
  let position = first
  let velocity = 0
  let goal = first
  let target = first
  let dragging = false
  let origin = first
  let caught = first
  let travel = first
  let handSpeed = 0
  let presence = 0
  let presenceVelocity = 0
  let presenceGoal = 0
  let presenceDelay = 0

  const banded = (value: number) => {
    if (value < minimum) {
      return minimum - absorb(minimum - value)
    }
    if (value > maximum) {
      return maximum + absorb(value - maximum)
    }
    return value
  }

  // Slower as a book passes fully open, so it is seen, and faster in between.
  // A long way to go raises the limit so a far jump does not drag on.
  const speedLimit = () => {
    const between = 0.5 - 0.5 * Math.cos(2 * Math.PI * position)
    const far = Math.max(0, Math.abs(goal - position) - 2)
    return (dwellSpeed + (cruiseSpeed - dwellSpeed) * between) * (1 + hurry * far)
  }

  const chase = (seconds: number) => {
    const steps = Math.max(1, Math.ceil(seconds / stepSeconds - 1e-9))
    const step = seconds / steps
    for (let index = 0; index < steps; index++) {
      const limit = speedLimit()
      if (dragging) {
        // No spring between the hand and the row: only enough smoothing to
        // hide the pointer's sampling, a frame's worth at most.
        velocity = clamp((goal - position) * followRate, -limit, limit)
      } else {
        velocity += (flipRate * flipRate * (goal - position) - 2 * flipRate * velocity) * step
        velocity = clamp(velocity, -limit, limit)
      }
      position += velocity * step
    }
    handSpeed += (velocity - handSpeed) * (1 - Math.exp(-25 * seconds))
    if (Math.abs(goal - position) < restDistance && Math.abs(velocity) < restSpeed) {
      position = goal
      velocity = 0
    }
  }

  const appear = (seconds: number) => {
    if (presenceDelay > 0 && presenceGoal > presence) {
      presenceDelay = Math.max(0, presenceDelay - seconds)
      return
    }
    const offset = presence - presenceGoal
    const carried = presenceVelocity + presenceRate * offset
    const decay = Math.exp(-presenceRate * seconds)
    presence = presenceGoal + (offset + carried * seconds) * decay
    presenceVelocity = (carried - presenceRate * (offset + carried * seconds)) * decay
    if (Math.abs(presence - presenceGoal) < 0.0006 && Math.abs(presenceVelocity) < 0.006) {
      presence = presenceGoal
      presenceVelocity = 0
    }
  }

  // `delay` holds the book in the row for a moment, for a camera still on its
  // way to this shelf.
  const goTo = (index: number, delay = 0) => {
    const next = clamp(Math.round(index), minimum, maximum)
    const moved = next !== target || presenceGoal !== 1
    dragging = false
    target = next
    goal = next
    presenceGoal = 1
    presenceDelay = delay
    return moved
  }

  return {
    get position() { return position },
    get velocity() { return velocity },
    get goal() { return goal },
    get target() { return target },
    get presence() { return presence },
    get dragging() { return dragging },
    get selectedIndex() { return presenceGoal > 0 ? target : null },
    // Direct manipulation: the row is scrubbed under the pointer.
    moveBy(delta: number) {
      if (!dragging) {
        dragging = true
        origin = target
        caught = position
        travel = position
        handSpeed = 0
        presenceGoal = 1
        presenceDelay = 0
      }
      travel = clamp(travel + delta, minimum - edgeReach, maximum + edgeReach)
      goal = banded(travel)
      target = clamp(Math.round(goal), minimum, maximum)
    },
    // The row comes to rest on the book nearest where the hand left it, so a
    // book drawn part-way out and let go simply goes back. `flick` lets a
    // release that is still moving carry on to the neighbour; `commit` is for
    // input with no speed to judge (a wheel), where travelling that far in
    // one direction is taken as meaning it.
    release(flick = true, commit = Infinity) {
      if (!dragging) {
        return
      }
      dragging = false
      const pulled = travel - caught
      let next = origin
      if (Math.abs(pulled) >= Math.min(tapTravel, commit)) {
        next = Math.round(goal)
        const direction = Math.sign(pulled)
        const flicked = flick && Math.abs(pulled) >= flickTravel
          && handSpeed * direction >= flickSpeed
        if ((flicked || Math.abs(pulled) >= commit) && (next - origin) * direction < 1) {
          next = origin + direction
        }
      }
      target = clamp(next, minimum, maximum)
      goal = target
    },
    goTo,
    // Returns false at the end of a shelf, where there is nothing to flip to.
    step(direction: -1 | 1) {
      return goTo(target + direction)
    },
    deselect() {
      dragging = false
      goal = target
      presenceGoal = 0
    },
    hold(index: number) {
      goTo(index)
      position = target
      velocity = 0
      presence = 1
      presenceVelocity = 0
    },
    setRange(firstIndex: number, lastIndex: number, index = firstIndex) {
      minimum = firstIndex
      maximum = lastIndex
      dragging = false
      target = clamp(Math.round(index), minimum, maximum)
      goal = target
      position = target
      velocity = 0
      presence = 0
      presenceVelocity = 0
      presenceGoal = 0
      presenceDelay = 0
    },
    advance(seconds: number) {
      const travelling = position !== goal || velocity !== 0
      if (travelling) {
        chase(seconds)
      }
      const appearing = presence !== presenceGoal || presenceVelocity !== 0
      if (appearing) {
        appear(seconds)
      }
      return travelling || appearing
    },
  }
}

export type ArchiveNavigation = ReturnType<typeof createArchiveNavigation>
