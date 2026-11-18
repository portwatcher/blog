import { smootherstep } from './archive-scene-constants'

// How a book sits is a pure function of how far the browsing position is from
// it, in book units. Passing a book therefore always plays its whole movement:
// out of the row, open, shut, back in. The ranges of neighbouring books overlap,
// so one is already leaving the row while the other returns to it.
//
// A book cannot turn between its neighbours: it only swings once it has left
// the row, and it is shut again before it goes back in. Its cover is also shut
// before the next book along starts to come out past it.
export const archiveReach = 0.68
const pulledWithin = 0.38
const swingWithin = 0.42
const openWithin = 0.06

export const archivePullAt = (distance: number) =>
  1 - smootherstep(pulledWithin, archiveReach, distance)

export const archiveSwingAt = (distance: number) =>
  1 - smootherstep(openWithin, swingWithin, distance)

// `presence` puts every book back without moving the browsing position, by
// treating the shelf as further away. The same ordered movement plays.
export const archiveDistance = (position: number, presence: number, index: number) =>
  Math.max(Math.abs(position - index), (1 - presence) * archiveReach)
