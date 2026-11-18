import type { Ref } from 'vue'
import { createArchiveWheel } from '~/lib/archive-gestures'

interface ArchiveInputOptions {
  stage: Ref<HTMLElement | null>
  available: () => boolean
  // Scrubs the row under the pointer, in books.
  move: (delta: number) => void
  // Lets go of the row. `flick` allows a release that is still moving to
  // carry on to the neighbour; `commit` is the travel that counts as a flip.
  release: (flick: boolean, commit?: number) => void
  shelf: (direction: -1 | 1) => void
  hover: (x: number, y: number) => void
  navigate: (key: string, repeat: boolean) => void
  activate: () => void
}

const navigationKeys = [
  'arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'a', 'd', 'w', 's', 'home', 'end', 'escape',
]
const shelfSwipePixels = 48
const wheelIdleMs = 110

export const useArchiveInput = (options: ArchiveInputOptions) => {
  const dragging = ref(false)
  const wheel = createArchiveWheel()
  let wheelTimer = 0
  let suppressClickUntil = 0
  let gesture: {
    id: number
    x: number
    startX: number
    startY: number
    slop: number
    touch: boolean
    axis: 'x' | 'y' | null
    shelved: boolean
  } | null = null

  // How far the hand travels to turn one book. Short enough that the book
  // visibly follows the hand from the first few pixels, long enough that the
  // whole movement can be scrubbed and held part-way. A finger covers more
  // of a small screen than a mouse does of a large one.
  const pixelsPerBook = (touch = false) => {
    const width = options.stage.value?.clientWidth || window.innerWidth
    return touch
      ? Math.min(300, Math.max(150, width * 0.42))
      : Math.min(240, Math.max(140, width * 0.19))
  }

  const settleWheel = () => {
    if (!wheelTimer) {
      return false
    }
    window.clearTimeout(wheelTimer)
    wheelTimer = 0
    return true
  }

  const cancel = () => {
    const active = gesture?.axis === 'x' || settleWheel()
    const pointerId = gesture?.id
    gesture = null
    dragging.value = false
    if (pointerId !== undefined && options.stage.value?.hasPointerCapture(pointerId)) {
      options.stage.value.releasePointerCapture(pointerId)
    }
    return active
  }

  const onPointerDown = (event: PointerEvent) => {
    if (!event.isPrimary) {
      // Let a second touch become a browser pinch gesture.
      if (cancel()) {
        options.release(false)
      }
      return
    }
    if (!options.available() || event.button !== 0) {
      return
    }
    const target = event.target instanceof Element ? event.target : null
    if (target?.closest('button, a, input')) {
      return
    }
    if (cancel()) {
      options.release(false)
    }
    const mouse = event.pointerType === 'mouse'
    gesture = {
      id: event.pointerId,
      x: event.clientX,
      startX: event.clientX,
      startY: event.clientY,
      slop: mouse ? 3 : 8,
      touch: !mouse,
      axis: null,
      shelved: false,
    }
    try {
      options.stage.value?.setPointerCapture(event.pointerId)
    } catch {
      // The pointer may already be gone; the drag still works while it stays
      // over the stage.
    }
    if (mouse) {
      event.preventDefault()
      options.stage.value?.focus({ preventScroll: true })
    }
  }

  const onPointerMove = (event: PointerEvent) => {
    if (!gesture || event.pointerId !== gesture.id) {
      if (event.pointerType === 'mouse') {
        options.hover(event.clientX, event.clientY)
      }
      return
    }
    if (!gesture.axis) {
      const travelX = event.clientX - gesture.startX
      const travelY = event.clientY - gesture.startY
      // A press that barely moves stays a click and leaves the book in place.
      if (Math.hypot(travelX, travelY) <= gesture.slop) {
        return
      }
      gesture.axis = Math.abs(travelX) >= Math.abs(travelY) ? 'x' : 'y'
      dragging.value = true
    }
    if (gesture.axis === 'x') {
      // The travel spent deciding the gesture is included, so nothing is lost.
      options.move(-(event.clientX - gesture.x) / pixelsPerBook(gesture.touch))
      gesture.x = event.clientX
      return
    }
    const travel = event.clientY - gesture.startY
    if (!gesture.shelved && Math.abs(travel) >= shelfSwipePixels) {
      gesture.shelved = true
      // Swiping up reveals the shelf below, as scrolling a page would.
      options.shelf(travel < 0 ? 1 : -1)
    }
  }

  const onPointerEnd = (event: PointerEvent) => {
    if (!gesture || event.pointerId !== gesture.id) {
      return
    }
    if (dragging.value) {
      suppressClickUntil = performance.now() + 350
    }
    if (cancel()) {
      // A cancelled gesture has no speed worth trusting.
      options.release(event.type === 'pointerup')
    }
  }

  const onWheel = (event: WheelEvent) => {
    if (!options.available() || event.ctrlKey || gesture) {
      return
    }
    event.preventDefault()
    const unit = event.deltaMode === 1 ? 16
      : event.deltaMode === 2 ? (options.stage.value?.clientHeight || 800) : 1
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
      ? event.deltaX : event.deltaY
    const { move, settle } = wheel.push(delta * unit, event.timeStamp, pixelsPerBook())
    if (move) {
      options.move(move)
      window.clearTimeout(wheelTimer)
      wheelTimer = window.setTimeout(() => {
        wheelTimer = 0
        options.release(false, wheel.commit)
      }, wheelIdleMs)
    }
    if (settle && settleWheel()) {
      // The neighbour is fully out: come to rest now, not after the inertia.
      options.release(false, wheel.commit)
    }
  }

  const onKeydown = (event: KeyboardEvent) => {
    if (!options.available() || event.defaultPrevented || event.isComposing
      || event.metaKey || event.ctrlKey || event.altKey) {
      return
    }
    const target = event.target instanceof HTMLElement ? event.target : null
    if (target?.matches('input, textarea, select, [contenteditable="true"]')) {
      return
    }
    const key = event.key.toLowerCase()
    if (navigationKeys.includes(key)) {
      event.preventDefault()
      if (cancel()) {
        options.release(false)
      }
      options.navigate(key, event.repeat)
    } else if (options.stage.value?.contains(target)
      && !target?.matches('button, a') && ['enter', ' '].includes(key)) {
      event.preventDefault()
      options.activate()
    }
  }

  return {
    dragging,
    cancel,
    canClick: () => performance.now() >= suppressClickUntil,
    onPointerDown,
    onPointerMove,
    onPointerEnd,
    onWheel,
    onKeydown,
  }
}
