// Input lives in a continuous travel coordinate. Its strictly positive slope
// slows movement near each book without thresholds, discarded deltas or locks.
const browsingSpeed = 2.1
const selectionSpeed = 0.26
const speedRatio = Math.sqrt(selectionSpeed / browsingSpeed)
const approachRadius = 0.18
const transitionRadius = 0.5 - approachRadius
const approachTravel = approachRadius / (2 * (approachRadius + transitionRadius * speedRatio))
const transitionTravel = 0.5 - approachTravel
const inputTravelScale = selectionSpeed * approachTravel / approachRadius
const captureRadius = 0.09
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export const archiveTravelForInput = (pixels: number, width: number) =>
  pixels * inputTravelScale / Math.min(570, Math.max(180, width * 0.42))

// Keep the same speed throughout the near-selection zone, then accelerate
// smoothly into the gap. Analytic inverse maps preserve every input delta and
// make reversing/batching gestures equivalent, including at the zone boundary.
export const archivePositionForTravel = (travel: number) => {
  const center = Math.floor(travel + 0.5)
  const offset = travel - center
  const distance = Math.abs(offset)
  if (distance <= approachTravel) {
    return center + offset * approachRadius / approachTravel
  }
  const phase = (distance - approachTravel) / transitionTravel * Math.PI / 2
  const transition = Math.atan2(speedRatio * Math.sin(phase), Math.cos(phase)) * 2 / Math.PI
  return center + Math.sign(offset) * (approachRadius + transitionRadius * transition)
}

export const archiveTravelForPosition = (position: number) => {
  const center = Math.floor(position + 0.5)
  const offset = position - center
  const distance = Math.abs(offset)
  if (distance <= approachRadius) {
    return center + offset * approachTravel / approachRadius
  }
  const phase = (distance - approachRadius) / transitionRadius * Math.PI / 2
  const transition = Math.atan2(Math.sin(phase), speedRatio * Math.cos(phase)) * 2 / Math.PI
  return center + Math.sign(offset) * (approachTravel + transitionTravel * transition)
}

const presentationRadius = 0.42
const presentationStart = archiveTravelForPosition(presentationRadius)
const presentationEnd = archiveTravelForPosition(captureRadius)

export const archivePresentationAt = (position: number, index: number) => {
  const distance = Math.abs(position - index)
  if (distance >= presentationRadius) {
    return 0
  }
  if (distance <= captureRadius) {
    return 1
  }
  // Pace the pose by gesture distance, not the faster-moving shelf position.
  // Each pose channel applies its easing once, keeping the pull gradual.
  return (presentationStart - archiveTravelForPosition(distance))
    / (presentationStart - presentationEnd)
}

export const createArchiveNavigation = (first: number, last: number) => {
  let minimum = first
  let maximum = last
  let travel = first - 0.5
  let target: number | null = null
  let velocity = 0

  const selectedIndex = () => {
    const position = archivePositionForTravel(travel)
    const index = Math.round(position)
    return index >= minimum && index <= maximum
      && Math.abs(position - index) <= captureRadius ? index : null
  }

  const moveBy = (delta: number) => {
    target = null
    velocity = 0
    travel = clamp(travel + delta, minimum - 0.5, maximum + 0.5)
  }

  return {
    get position() { return archivePositionForTravel(travel) },
    get travel() { return travel },
    get selectedIndex() { return selectedIndex() },
    get destination() { return target },
    moveBy,
    setRange(firstIndex: number, lastIndex: number, position = firstIndex - 0.5) {
      minimum = firstIndex
      maximum = lastIndex
      travel = archiveTravelForPosition(clamp(position, minimum - 0.5, maximum + 0.5))
      target = null
      velocity = 0
    },
    goTo(index: number) {
      target = clamp(index, minimum, maximum)
      velocity = 0
    },
    deselect() {
      target = clamp(Math.floor(archivePositionForTravel(travel)) + 0.5, minimum - 0.5, maximum + 0.5)
      velocity = 0
    },
    hold(index: number) {
      travel = clamp(index, minimum, maximum)
      target = null
      velocity = 0
    },
    release(releaseVelocity = 0) {
      target = selectedIndex()
      // Touch/mouse inertia is ours; wheel events already include OS inertia.
      velocity = target === null ? clamp(releaseVelocity, -8, 8) : 0
    },
    advance(seconds: number) {
      const before = travel
      if (target !== null) {
        travel = target + (travel - target) * Math.exp(-14 * seconds)
        if (Math.abs(travel - target) < 0.0001) {
          travel = target
          target = null
        }
      } else if (Math.abs(velocity) > 0.015) {
        const decay = Math.exp(-10 * seconds)
        travel = clamp(
          travel + velocity * (1 - decay) / 10,
          minimum - 0.5,
          maximum + 0.5,
        )
        velocity *= decay
        if (Math.abs(velocity) < 0.6) {
          target = selectedIndex()
        }
        if (travel === before) {
          velocity = 0
        }
      } else {
        velocity = 0
      }
      return travel !== before
    },
  }
}

export type ArchiveNavigation = ReturnType<typeof createArchiveNavigation>
