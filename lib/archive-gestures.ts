// A wheel or trackpad reports a stream of small deltas, followed on most
// systems by a long tail of inertia. The row follows the fingers through that
// stream, in either direction, but one push can only carry it as far as the
// neighbouring book: inertia may finish a flip, never start another. A fresh
// push (a pause, or the stream picking up again) may go one book further.
const gapMs = 110
const pushDelta = 12
// Travelling this far in one direction is taken as meaning it.
const commitTravel = 0.3

export const createArchiveWheel = () => {
  let lastAt = -Infinity
  let travelled = 0
  let events = 0
  let pixels = 0
  let peak = 0
  let trough = 0
  let falling = false
  let spent = false

  const begin = (magnitude: number) => {
    travelled = 0
    events = 0
    pixels = 0
    peak = magnitude
    trough = magnitude
    falling = false
    spent = false
  }

  return {
    // Feed every wheel delta, in pixels. `move` is how far to scrub the row,
    // in books; `settle` says the push has gone as far as it can and the row
    // should come to rest now rather than wait out the inertia.
    push(delta: number, now: number, pixelsPerBook: number) {
      const magnitude = Math.abs(delta)
      if (now - lastAt > gapMs) {
        // A pause ends the previous push and its inertia.
        begin(magnitude)
      } else {
        // Inertia only ever decays. Once the stream has clearly started
        // falling, a delta that climbs well above its lowest point is new.
        peak = Math.max(peak, magnitude)
        if (falling) {
          trough = Math.min(trough, magnitude)
        } else if (magnitude < peak * 0.6) {
          falling = true
          trough = magnitude
        }
        if (falling && magnitude >= pushDelta && magnitude >= trough * 2) {
          begin(magnitude)
        }
      }
      lastAt = now
      if (spent) {
        return { move: 0, settle: false }
      }
      const next = Math.min(1, Math.max(-1, travelled + delta / pixelsPerBook))
      const move = next - travelled
      travelled = next
      pixels += delta
      events++
      spent = Math.abs(travelled) === 1
      return { move, settle: spent }
    },
    // How far the row must have travelled for the push to count as a flip. A
    // single notch of a wheel is too short to scrub, but it is deliberate.
    get commit() {
      return events <= 2 && Math.abs(pixels) >= 4 ? 0 : commitTravel
    },
  }
}

export type ArchiveWheel = ReturnType<typeof createArchiveWheel>
