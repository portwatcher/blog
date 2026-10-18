import type { Ref } from 'vue'
import { archiveTravelForInput } from '~/lib/archive-navigation'

interface ArchiveInputOptions {
  stage: Ref<HTMLElement | null>
  available: () => boolean
  move: (delta: number) => void
  release: (velocity: number) => void
  hover: (x: number, y: number) => void
  navigate: (key: string) => void
  activate: () => void
}

export const useArchiveInput = (options: ArchiveInputOptions) => {
  const dragging = ref(false)
  let wheelTimer = 0
  let suppressClickUntil = 0
  let gesture: {
    id: number
    x: number
    y: number
    startX: number
    startY: number
    time: number
    velocity: number
    axis: 'x' | 'y' | null
  } | null = null

  const travelForPixels = (pixels: number) => archiveTravelForInput(
    pixels, options.stage.value?.clientWidth || window.innerWidth,
  )

  const cancel = () => {
    window.clearTimeout(wheelTimer)
    const pointerId = gesture?.id
    gesture = null
    dragging.value = false
    if (pointerId !== undefined && options.stage.value?.hasPointerCapture(pointerId)) {
      options.stage.value.releasePointerCapture(pointerId)
    }
  }

  const onPointerDown = (event: PointerEvent) => {
    if (!event.isPrimary) {
      // Let a second touch become a browser pinch gesture.
      cancel()
      options.release(0)
      return
    }
    if (!options.available() || event.button !== 0) {
      return
    }
    const target = event.target instanceof Element ? event.target : null
    if (target?.closest('button, a, input')) {
      return
    }
    window.clearTimeout(wheelTimer)
    options.move(0)
    gesture = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      time: event.timeStamp,
      velocity: 0,
      axis: null,
    }
    options.stage.value?.setPointerCapture(event.pointerId)
    if (event.pointerType === 'mouse') {
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
    const deltaX = event.clientX - gesture.x
    const deltaY = event.clientY - gesture.y
    if (!gesture.axis && (deltaX || deltaY)) {
      gesture.axis = Math.abs(deltaX) >= Math.abs(deltaY) ? 'x' : 'y'
    }
    const delta = travelForPixels(-(gesture.axis === 'x' ? deltaX : deltaY))
    const seconds = Math.max(0.001, (event.timeStamp - gesture.time) / 1000)
    const sampleVelocity = delta / seconds
    gesture.velocity += (sampleVelocity - gesture.velocity) * (1 - Math.exp(-30 * seconds))
    gesture.x = event.clientX
    gesture.y = event.clientY
    gesture.time = event.timeStamp
    if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) > 3) {
      dragging.value = true
    }
    // Even sub-threshold movement reaches the scene. The threshold only
    // distinguishes a click from a drag; it never gates animation input.
    options.move(delta)
  }

  const onPointerEnd = (event: PointerEvent) => {
    if (!gesture || event.pointerId !== gesture.id) {
      return
    }
    const velocity = event.type === 'pointerup' && dragging.value
      ? gesture.velocity * Math.exp(-20 * Math.max(0, event.timeStamp - gesture.time) / 1000)
      : 0
    if (dragging.value) {
      suppressClickUntil = performance.now() + 350
    }
    cancel()
    options.release(velocity)
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
    options.move(travelForPixels(delta * unit))
    window.clearTimeout(wheelTimer)
    wheelTimer = window.setTimeout(() => options.release(0), 160)
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
    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'a', 'd', 'w', 's', 'home', 'end', 'escape'].includes(key)) {
      event.preventDefault()
      cancel()
      options.navigate(key)
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
