// Input lives in a continuous travel coordinate. Its strictly positive slope
// slows movement near each book without thresholds, discarded deltas or locks.
const browsingSpeed = 2.1
const selectionSpeed = 0.26
const speedRatio = Math.sqrt(selectionSpeed / browsingSpeed)
const inputTravelScale = Math.sqrt(selectionSpeed * browsingSpeed)
const captureRadius = 0.09
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export const archiveTravelForInput = (pixels: number, width: number) =>
  pixels * inputTravelScale / Math.min(570, Math.max(180, width * 0.42))

// A smooth, position-based speed profile gives the whole approach more
// resistance, then accelerates through the gap. These analytic inverse maps
// preserve every input delta and make reversing/batching gestures equivalent.
export const archivePositionForTravel = (travel: number) => {
  const center = Math.floor(travel + 0.5)
  const phase = (travel - center) * Math.PI
  return center + Math.atan2(speedRatio * Math.sin(phase), Math.cos(phase)) / Math.PI
}

export const archiveTravelForPosition = (position: number) => {
  const center = Math.floor(position + 0.5)
  const phase = (position - center) * Math.PI
  return center + Math.atan2(Math.sin(phase), speedRatio * Math.cos(phase)) / Math.PI
}

export const archivePresentationAt = (position: number, index: number) => {
  const distance = Math.abs(position - index)
  const progress = clamp((0.42 - distance) / (0.42 - captureRadius), 0, 1)
  return progress ** 3 * (progress * (progress * 6 - 15) + 10)
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
