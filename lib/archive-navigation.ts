// Input lives in a continuous travel coordinate. Its strictly positive slope
// slows movement near each book without thresholds, discarded deltas or locks.
const tau = Math.PI * 2
const resistance = 0.66
const captureRadius = 0.09
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export const archivePositionForTravel = (travel: number) =>
  travel - resistance * Math.sin(tau * travel) / tau

export const archiveTravelForPosition = (position: number) => {
  let travel = position
  for (let step = 0; step < 8; step++) {
    travel -= (archivePositionForTravel(travel) - position)
      / (1 - resistance * Math.cos(tau * travel))
  }
  return travel
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

  const selectedIndex = () => {
    const position = archivePositionForTravel(travel)
    const index = Math.round(position)
    return index >= minimum && index <= maximum
      && Math.abs(position - index) <= captureRadius ? index : null
  }

  const moveBy = (delta: number) => {
    target = null
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
    },
    goTo(index: number) {
      target = clamp(index, minimum, maximum)
    },
    deselect() {
      target = clamp(Math.floor(archivePositionForTravel(travel)) + 0.5, minimum - 0.5, maximum + 0.5)
    },
    hold(index: number) {
      travel = clamp(index, minimum, maximum)
      target = null
    },
    release() {
      // The midpoint decides the resting book. Settle from the current pose;
      // gesture speed must not carry a release across its chosen midpoint.
      target = clamp(Math.round(archivePositionForTravel(travel)), minimum, maximum)
    },
    advance(seconds: number) {
      const before = travel
      if (target !== null) {
        travel = target + (travel - target) * Math.exp(-14 * seconds)
        if (Math.abs(travel - target) < 0.0001) {
          travel = target
          target = null
        }
      }
      return travel !== before
    },
  }
}

export type ArchiveNavigation = ReturnType<typeof createArchiveNavigation>
