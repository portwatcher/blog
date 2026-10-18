import type { Ref } from 'vue'

interface ArchiveInputOptions {
  stage: Ref<HTMLElement | null>
  available: () => boolean
  move: (delta: number) => void
  release: () => void
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
    axis: 'x' | 'y' | null
  } | null = null

  const pixelsPerArticle = () => {
    const width = options.stage.value?.clientWidth || window.innerWidth
    // A longer gesture gives extraction room to unfold, without adding lag.
    return Math.min(570, Math.max(180, width * 0.42))
  }

  const cancel = () => {
    const active = gesture !== null || wheelTimer !== 0
    window.clearTimeout(wheelTimer)
    wheelTimer = 0
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
        options.release()
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
    window.clearTimeout(wheelTimer)
    wheelTimer = 0
    options.move(0)
    gesture = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
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
    const delta = -(gesture.axis === 'x' ? deltaX : deltaY) / pixelsPerArticle()
    gesture.x = event.clientX
    gesture.y = event.clientY
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
    if (dragging.value) {
      suppressClickUntil = performance.now() + 350
    }
    cancel()
    options.release()
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
    options.move(delta * unit / pixelsPerArticle())
    window.clearTimeout(wheelTimer)
    wheelTimer = window.setTimeout(() => {
      wheelTimer = 0
      options.release()
    }, 160)
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
