<template>
  <div
    ref="stage"
    class="archive-scene"
    :class="{
      'archive-scene--ready': ready,
      'archive-scene--dragging': dragging,
    }"
    :data-fallback-reason="fallbackReason || undefined"
    role="region"
    :aria-roledescription="t('archiveScene.roleDescription')"
    :aria-label="t('archiveScene.region', { count: articles.length })"
    :aria-hidden="ready ? undefined : 'true'"
    :inert="!ready"
    :tabindex="ready ? 0 : -1"
    @keydown="onKeydown"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerEnd"
    @pointercancel="onPointerEnd"
    @lostpointercapture="onPointerEnd"
  >
    <canvas
      ref="canvas"
      class="archive-scene__canvas"
      aria-hidden="true"
    ></canvas>

    <div class="archive-scene__topline" aria-hidden="true">
      <span>{{ t('archive') }}</span>
      <span>{{ t('archiveScene.posts', {
        count: String(articles.length).padStart(2, '0'),
      }) }}</span>
    </div>

    <button
      ref="hitTarget"
      class="archive-scene__hit"
      :class="{ 'archive-scene__hit--visible': hitVisible }"
      :style="hitStyle"
      type="button"
      :aria-label="t('archiveScene.openArticle', { title: currentArticle?.title || '' })"
      :aria-hidden="hitVisible && ready ? undefined : 'true'"
      :tabindex="hitVisible && ready && !opening ? 0 : -1"
      :disabled="opening || !ready || !hitVisible"
      @pointerenter="setHovered(true)"
      @pointerleave="setHovered(false)"
      @focus="setHovered(true)"
      @blur="setHovered(false)"
      @click="activateCurrent"
    ></button>

    <button
      class="archive-scene__arrow archive-scene__arrow--previous"
      type="button"
      :aria-label="t('archiveScene.previous')"
      :disabled="!ready || currentIndex === 0 || opening || dragging || horizontalScrolling"
      @click="goToIndex(currentIndex - 1)"
    >
      <span aria-hidden="true">←</span>
    </button>

    <button
      class="archive-scene__arrow archive-scene__arrow--next"
      type="button"
      :aria-label="t('archiveScene.next')"
      :disabled="!ready || currentIndex === articles.length - 1 || opening || dragging || horizontalScrolling"
      @click="goToIndex(currentIndex + 1)"
    >
      <span aria-hidden="true">→</span>
    </button>

    <div class="archive-scene__footer">
      <div class="archive-scene__status" aria-hidden="true">
        <span>{{ formattedDate }}</span>
        <span>{{ String(currentIndex + 1).padStart(2, '0') }} / {{ String(articles.length).padStart(2, '0') }}</span>
      </div>
      <span class="archive-scene__hint" aria-hidden="true">{{ t('archiveScene.hint') }}</span>
    </div>

    <p class="archive-scene__announcement" aria-live="polite">
      {{ announcementText }}
    </p>
  </div>
</template>

<script setup lang="ts">
import type {
  ArchiveSceneEngine,
  ArchiveSceneFrame,
  ArchiveSceneRects,
} from '~/lib/archive-scene'

const props = withDefaults(defineProps<{
  articles: Article[]
  initialIndex?: number
  returning?: boolean
}>(), {
  initialIndex: 0,
  returning: false,
})

const emit = defineEmits<{
  activate: [
    article: Article,
    index: number,
    controller: {
      focusForOpen: () => Promise<ArchiveSceneRects>
      finishReturnPose: () => Promise<void>
    },
  ]
  mode: [mode: 'webgl' | 'fallback']
  ready: [controller: {
    getActiveRects: () => ArchiveSceneRects
    finishReturnPose: () => Promise<void>
  }]
}>()

const { locale, t } = useI18n()
const stage = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const hitTarget = ref<HTMLButtonElement | null>(null)
const ready = ref(false)
const fallbackReason = ref('')
const opening = ref(false)
const dragging = ref(false)
const horizontalScrolling = ref(false)
const currentIndex = ref(0)
const hitVisible = ref(false)
const hitStyle = ref<Record<string, string>>({})
const currentArticle = computed(() => props.articles[currentIndex.value])
const announcedIndex = ref(0)
const announcedArticle = computed(() => props.articles[announcedIndex.value])
const formatDate = (value?: string) => {
  if (!value) return ''

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(locale.value, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(date)
}
const formattedDate = computed(() => formatDate(currentArticle.value?.date))
const announcementText = computed(() => t('archiveScene.announcement', {
  title: announcedArticle.value?.title || '',
  date: formatDate(announcedArticle.value?.date),
  index: announcedIndex.value + 1,
  count: props.articles.length,
}))

const cssColorToNumber = (value: string, fallback: number) => {
  const probe = document.createElement('canvas')
  probe.width = 1
  probe.height = 1
  const context = probe.getContext('2d', { alpha: false })
  if (!context) return fallback

  context.fillStyle = '#fbfcfd'
  context.fillStyle = value
  context.fillRect(0, 0, 1, 1)
  const [red, green, blue] = context.getImageData(0, 0, 1, 1).data
  return (red << 16) | (green << 8) | blue
}

let engine: ArchiveSceneEngine | null = null
let track: HTMLElement | null = null
let resizeObserver: ResizeObserver | null = null
let scrollTimer = 0
let horizontalScrollTimer = 0
let animationFrame = 0
let lastFrameTime = 0
let trackTop = 0
let trackSpan = 1
let targetPosition = 0
let displayPosition = 0
let springVelocity = 0
let selectionProgress = 0
let hovered = false
let disposed = false
let expectedProgrammaticScrollTop: number | null = null
let boundCanvas: HTMLCanvasElement | null = null
let contextLostHandler: ((event: Event) => void) | null = null
let suppressClickUntil = 0
let wheelPixelsPerArticle = 0
let wheelSession: {
  axis: 'pending' | 'horizontal' | 'vertical'
  lastTime: number
  accumulatedX: number
  accumulatedY: number
} | null = null
let dragGesture: {
  pointerId: number
  pointerType: string
  startX: number
  startY: number
  startPosition: number
  pixelsPerArticle: number
  axis: 'pending' | 'horizontal'
} | null = null
let selectionTween: {
  from: number
  to: number
  startedAt: number
  duration: number
  resolve: () => void
} | null = null

const clampIndex = (value: number) =>
  Math.min(Math.max(0, Math.round(value)), Math.max(0, props.articles.length - 1))

const clampPosition = (value: number) =>
  Math.min(Math.max(0, value), Math.max(0, props.articles.length - 1))

const switchThreshold = 0.8
const wheelIdleMs = 160
const axisDominance = 1.25
const wheelAxisDominance = 1.05
const springStiffness = 190
const springDamping = 20
const springRestDistance = 0.0006
const springRestSpeed = 0.006
const sceneFrame: ArchiveSceneFrame = {
  position: 0,
  selectedIndex: 0,
  selectionProgress: 0,
  hovered: false,
}

const draw = () => {
  sceneFrame.position = displayPosition
  sceneFrame.selectedIndex = opening.value
    ? currentIndex.value
    : clampIndex(displayPosition)
  sceneFrame.selectionProgress = selectionProgress
  sceneFrame.hovered = hovered
  engine?.draw(sceneFrame)
}

const updateHitTarget = () => {
  if (!engine || !stage.value || opening.value) {
    hitVisible.value = false
    return
  }

  const rect = engine.getActiveRects().surfaceRect
  const stageRect = stage.value.getBoundingClientRect()
  hitStyle.value = {
    width: `${Math.max(44, rect.width)}px`,
    height: `${Math.max(44, rect.height)}px`,
    transform: `translate3d(${rect.left - stageRect.left}px, ${rect.top - stageRect.top}px, 0)`,
  }
  hitVisible.value = Math.abs(displayPosition - currentIndex.value) < 0.025
}

const requestDraw = () => {
  if (animationFrame || document.hidden) return
  animationFrame = window.requestAnimationFrame(frame)
}

const frame = (now: number) => {
  animationFrame = 0
  const delta = Math.min(0.032, Math.max(0.001, (now - (lastFrameTime || now)) / 1000))
  lastFrameTime = now

  const directlyManipulated = dragging.value || horizontalScrolling.value
  if (!directlyManipulated) {
    const steps = Math.min(4, Math.max(1, Math.ceil(delta / (1 / 120))))
    const step = delta / steps
    for (let index = 0; index < steps; index++) {
      const acceleration = springStiffness * (targetPosition - displayPosition)
        - springDamping * springVelocity
      springVelocity += acceleration * step
      displayPosition += springVelocity * step
    }

    if (
      Math.abs(targetPosition - displayPosition) < springRestDistance
      && Math.abs(springVelocity) < springRestSpeed
    ) {
      displayPosition = targetPosition
      springVelocity = 0
    }
  }

  if (selectionTween) {
    const elapsed = now - selectionTween.startedAt
    const progress = Math.min(1, elapsed / selectionTween.duration)
    selectionProgress = selectionTween.from
      + (selectionTween.to - selectionTween.from) * progress
    if (progress === 1) {
      selectionProgress = selectionTween.to
      const resolve = selectionTween.resolve
      selectionTween = null
      resolve()
    }
  }

  draw()
  const moving = Math.abs(targetPosition - displayPosition) >= springRestDistance
    || Math.abs(springVelocity) >= springRestSpeed
  if (selectionTween || dragging.value || horizontalScrolling.value) {
    hitVisible.value = false
    if (moving || selectionTween) requestDraw()
  } else if (moving) {
    // The final sub-pixel spring tail should not block opening a card that is
    // already visually picked. focusForOpen() snaps the remaining motion.
    if (Math.abs(displayPosition - currentIndex.value) < 0.025) {
      updateHitTarget()
    } else {
      hitVisible.value = false
    }
    requestDraw()
  } else {
    announcedIndex.value = currentIndex.value
    updateHitTarget()
  }
}

const measureTrack = () => {
  if (!track) return
  const rect = track.getBoundingClientRect()
  trackTop = rect.top + window.scrollY
  trackSpan = Math.max(1, track.offsetHeight - window.innerHeight)
}

const scrollTopForPosition = (position: number) => {
  const denominator = Math.max(1, props.articles.length - 1)
  return trackTop + (clampPosition(position) / denominator) * trackSpan
}

const scrollTopForIndex = (index: number) => scrollTopForPosition(clampIndex(index))

const syncWindowScroll = (top: number) => {
  expectedProgrammaticScrollTop = top
  window.scrollTo({ top, behavior: 'auto' })
}

const updateCommittedIndex = (position: number) => {
  let nextIndex = currentIndex.value
  const lastIndex = Math.max(0, props.articles.length - 1)

  while (nextIndex < lastIndex && position - nextIndex >= switchThreshold) {
    nextIndex++
  }
  while (nextIndex > 0 && position - nextIndex <= -switchThreshold) {
    nextIndex--
  }

  if (nextIndex !== currentIndex.value) currentIndex.value = nextIndex
}

const settleToCommitted = () => {
  if (!ready.value || opening.value) return

  window.clearTimeout(scrollTimer)
  window.clearTimeout(horizontalScrollTimer)
  wheelSession = null
  wheelPixelsPerArticle = 0
  dragging.value = false
  horizontalScrolling.value = false
  targetPosition = currentIndex.value
  springVelocity = Math.min(1.1, Math.max(-1.1, springVelocity * 0.15))
  lastFrameTime = 0
  syncWindowScroll(scrollTopForIndex(currentIndex.value))
  requestDraw()
}

const goToIndex = (index: number) => {
  if (!ready.value || opening.value) return
  const nextIndex = clampIndex(index)
  currentIndex.value = nextIndex
  targetPosition = nextIndex
  springVelocity = 0
  lastFrameTime = 0
  syncWindowScroll(scrollTopForIndex(nextIndex))
  requestDraw()
}

const settleScroll = () => {
  if (
    opening.value
    || !ready.value
    || dragging.value
    || horizontalScrolling.value
  ) return
  settleToCommitted()
}

const onScroll = () => {
  if (!ready.value || opening.value || dragging.value || horizontalScrolling.value) return
  if (expectedProgrammaticScrollTop !== null) {
    const expectedTop = expectedProgrammaticScrollTop
    expectedProgrammaticScrollTop = null
    if (Math.abs(window.scrollY - expectedTop) <= 1) return
  }
  const wasAtRest = Math.abs(targetPosition - displayPosition) < springRestDistance
    && Math.abs(springVelocity) < springRestSpeed
  const progress = (window.scrollY - trackTop) / trackSpan
  targetPosition = Math.min(
    Math.max(0, progress * Math.max(0, props.articles.length - 1)),
    Math.max(0, props.articles.length - 1),
  )
  if (wasAtRest) lastFrameTime = 0
  updateCommittedIndex(targetPosition)
  hitVisible.value = false
  window.clearTimeout(scrollTimer)
  scrollTimer = window.setTimeout(settleScroll, wheelIdleMs)
  requestDraw()
}

const animateSelection = (to: number, duration: number) => {
  if (selectionTween) selectionTween.resolve()
  lastFrameTime = 0

  return new Promise<void>((resolve) => {
    selectionTween = {
      from: selectionProgress,
      to,
      startedAt: performance.now(),
      duration,
      resolve,
    }
    requestDraw()
  })
}

const setHovered = (value: boolean) => {
  if (hovered === value || opening.value) return
  hovered = value
  requestDraw()
}

const pixelsPerArticle = () =>
  Math.min(280, Math.max(140, (stage.value?.clientWidth || window.innerWidth) * 0.3))

const setInteractivePosition = (position: number) => {
  const nextPosition = clampPosition(position)
  targetPosition = nextPosition
  displayPosition = nextPosition
  springVelocity = 0
  updateCommittedIndex(nextPosition)
  selectionProgress = 0
  hovered = false
  hitVisible.value = false
  window.clearTimeout(scrollTimer)
  requestDraw()
}

const onPointerDown = (event: PointerEvent) => {
  if (!ready.value || opening.value || !event.isPrimary) return
  if (event.pointerType === 'mouse' && event.button !== 0) return

  const target = event.target as HTMLElement
  if (target.closest('.archive-scene__arrow')) return

  // A sticky, focusable stage sits at the top of the document. Prevent a plain
  // canvas press from focusing that logical position (and jumping scroll),
  // while keeping the actual article button's native focus/click behavior.
  if (event.pointerType === 'mouse' && !target.closest('button, a, input')) {
    event.preventDefault()
  }

  dragGesture = {
    pointerId: event.pointerId,
    pointerType: event.pointerType,
    startX: event.clientX,
    startY: event.clientY,
    startPosition: displayPosition,
    pixelsPerArticle: pixelsPerArticle(),
    axis: 'pending',
  }
}

const onPointerMove = (event: PointerEvent) => {
  const gesture = dragGesture
  if (!gesture || gesture.pointerId !== event.pointerId) return

  const deltaX = event.clientX - gesture.startX
  const deltaY = event.clientY - gesture.startY
  if (gesture.axis === 'pending') {
    const threshold = gesture.pointerType === 'mouse' ? 5 : 10
    if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < threshold) return
    if (Math.abs(deltaX) <= Math.abs(deltaY) * axisDominance) {
      dragGesture = null
      return
    }

    gesture.axis = 'horizontal'
    if (horizontalScrolling.value) {
      window.clearTimeout(horizontalScrollTimer)
      horizontalScrolling.value = false
      wheelSession = null
      wheelPixelsPerArticle = 0
    }
    // Catch a running spring from its current visual position. The full pointer
    // travel since press still contributes, so the detent distance stays exact.
    gesture.startPosition = displayPosition
    targetPosition = displayPosition
    springVelocity = 0
    dragging.value = true
    hovered = false
    window.clearTimeout(scrollTimer)
    stage.value?.setPointerCapture(event.pointerId)
    if (gesture.pointerType === 'mouse') {
      stage.value?.focus({ preventScroll: true })
    }
  }

  event.preventDefault()
  setInteractivePosition(
    gesture.startPosition - deltaX / gesture.pixelsPerArticle,
  )
}

const onPointerEnd = (event: PointerEvent) => {
  const gesture = dragGesture
  if (!gesture || gesture.pointerId !== event.pointerId) return

  const wasHorizontal = gesture.axis === 'horizontal'
  dragGesture = null
  if (stage.value?.hasPointerCapture(event.pointerId)) {
    stage.value.releasePointerCapture(event.pointerId)
  }

  if (!wasHorizontal) return

  suppressClickUntil = performance.now() + 350
  settleToCommitted()
}

const normalizeWheelDeltas = (event: WheelEvent) => {
  const multiplier = event.deltaMode === WheelEvent.DOM_DELTA_LINE
    ? 16
    : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
      ? stage.value?.clientWidth || window.innerWidth
      : 1
  return {
    x: event.deltaX * multiplier,
    y: event.deltaY * multiplier,
  }
}

const onWheel = (event: WheelEvent) => {
  if (!ready.value || opening.value || dragging.value || event.ctrlKey) return

  const deltas = normalizeWheelDeltas(event)
  const horizontalDelta = event.shiftKey && Math.abs(deltas.x) < 1
    ? deltas.y
    : deltas.x
  const now = event.timeStamp
  if (!wheelSession || now - wheelSession.lastTime > wheelIdleMs) {
    if (horizontalScrolling.value) settleToCommitted()
    wheelSession = {
      axis: 'pending',
      lastTime: now,
      accumulatedX: 0,
      accumulatedY: 0,
    }
  } else {
    wheelSession.lastTime = now
  }

  wheelSession.accumulatedX += horizontalDelta
  wheelSession.accumulatedY += deltas.y
  let horizontalInput = horizontalDelta

  if (wheelSession.axis === 'pending') {
    const accumulatedX = Math.abs(wheelSession.accumulatedX)
    const accumulatedY = event.shiftKey ? 0 : Math.abs(wheelSession.accumulatedY)
    const horizontalIntent = event.shiftKey
      ? accumulatedX >= 0.25
      : accumulatedX >= 0.5
        && accumulatedX > accumulatedY * wheelAxisDominance
    const verticalIntent = !event.shiftKey
      && accumulatedY >= 0.5
      && accumulatedY > accumulatedX * wheelAxisDominance

    if (horizontalIntent) {
      wheelSession.axis = 'horizontal'
      wheelPixelsPerArticle = pixelsPerArticle()
      horizontalScrolling.value = true
      targetPosition = displayPosition
      springVelocity = 0
      horizontalInput = wheelSession.accumulatedX
    } else if (verticalIntent) {
      wheelSession.axis = 'vertical'
    } else if (Math.max(accumulatedX, accumulatedY) >= 1) {
      // Resolve diagonal high-resolution packets by their cumulative direction.
      wheelSession.axis = accumulatedX > accumulatedY ? 'horizontal' : 'vertical'
      if (wheelSession.axis === 'horizontal') {
        wheelPixelsPerArticle = pixelsPerArticle()
        horizontalScrolling.value = true
        targetPosition = displayPosition
        springVelocity = 0
        horizontalInput = wheelSession.accumulatedX
      }
    }
  }

  window.clearTimeout(horizontalScrollTimer)
  horizontalScrollTimer = window.setTimeout(() => {
    const shouldSettle = wheelSession?.axis === 'horizontal'
    wheelSession = null
    if (shouldSettle) settleToCommitted()
  }, wheelIdleMs)

  if (wheelSession.axis !== 'horizontal') return

  // Axis-lock the whole trackpad transaction. Later diagonal packets stay in
  // the shelf instead of alternately driving native vertical/browser history.
  if (event.cancelable) event.preventDefault()
  setInteractivePosition(
    displayPosition + horizontalInput / Math.max(1, wheelPixelsPerArticle),
  )
}

const activateCurrent = (event?: MouseEvent) => {
  if (
    event?.detail
    && performance.now() < suppressClickUntil
  ) {
    return
  }
  const article = currentArticle.value
  if (!article || opening.value || !ready.value || !hitVisible.value) return
  emit('activate', article, currentIndex.value, {
    focusForOpen,
    finishReturnPose,
  })
}

const onKeydown = (event: KeyboardEvent) => {
  const target = event.target as HTMLElement
  if (target.matches('input, button, a')) return

  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    event.preventDefault()
    goToIndex(currentIndex.value - 1)
  } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    event.preventDefault()
    goToIndex(currentIndex.value + 1)
  } else if (event.key === 'Home') {
    event.preventDefault()
    goToIndex(0)
  } else if (event.key === 'End') {
    event.preventDefault()
    goToIndex(props.articles.length - 1)
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    activateCurrent()
  }
}

const focusForOpen = async () => {
  if (!engine) throw new Error('Archive scene is unavailable')
  opening.value = true
  window.clearTimeout(scrollTimer)
  window.clearTimeout(horizontalScrollTimer)
  wheelSession = null
  dragging.value = false
  horizontalScrolling.value = false
  hovered = false
  displayPosition = currentIndex.value
  targetPosition = currentIndex.value
  springVelocity = 0
  syncWindowScroll(scrollTopForIndex(currentIndex.value))
  draw()
  await animateSelection(1, 300)
  if (disposed || !engine) throw new Error('Archive scene was disposed during transition')
  draw()
  return engine.getActiveRects()
}

const finishReturnPose = async () => {
  if (!engine) return
  await animateSelection(0, 320)
  if (disposed || !engine) return
  opening.value = false
  targetPosition = currentIndex.value
  displayPosition = currentIndex.value
  springVelocity = 0
  syncWindowScroll(scrollTopForIndex(currentIndex.value))
  draw()
  updateHitTarget()
  announcedIndex.value = currentIndex.value
  await nextTick()
  hitTarget.value?.focus({ preventScroll: true })
}

const getActiveRects = (): ArchiveSceneRects => engine?.getActiveRects() || {
  surfaceRect: new DOMRect(),
  titleRect: new DOMRect(),
}

defineExpose({
  focusForOpen,
  finishReturnPose,
  getActiveRects,
})

const useFallback = (reason: string) => {
  ready.value = false
  hitVisible.value = false
  fallbackReason.value = reason
  emit('mode', 'fallback')
}

const teardownScene = () => {
  window.clearTimeout(scrollTimer)
  window.clearTimeout(horizontalScrollTimer)
  window.cancelAnimationFrame(animationFrame)
  animationFrame = 0
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('resize', measureTrack)
  window.removeEventListener('wheel', onWheel, true)
  document.removeEventListener('visibilitychange', requestDraw)
  dragGesture = null
  wheelSession = null
  expectedProgrammaticScrollTop = null
  dragging.value = false
  horizontalScrolling.value = false
  document.documentElement.classList.remove('archive-scene-active')
  resizeObserver?.disconnect()
  resizeObserver = null
  if (boundCanvas && contextLostHandler) {
    boundCanvas.removeEventListener('webglcontextlost', contextLostHandler)
  }
  contextLostHandler = null
  boundCanvas = null
  selectionTween?.resolve()
  selectionTween = null
  engine?.destroy()
  engine = null
}

onMounted(async () => {
  await nextTick()
  if (!stage.value || !canvas.value) {
    useFallback('missing-stage')
    return
  }
  if (props.articles.length === 0) {
    useFallback('missing-content')
    return
  }

  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean }
    deviceMemory?: number
  }).connection
  const shouldFallback =
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
    || window.matchMedia('(forced-colors: active)').matches
    || Boolean(connection?.saveData)

  if (shouldFallback) {
    useFallback('preference-or-save-data')
    return
  }

  const context = canvas.value.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: true,
    stencil: false,
    preserveDrawingBuffer: false,
    powerPreference: 'low-power',
    failIfMajorPerformanceCaveat: true,
  })
  if (!context) {
    useFallback('webgl2-unavailable')
    return
  }

  const nav = navigator as Navigator & { deviceMemory?: number }
  const lowPower =
    window.matchMedia('(pointer: coarse)').matches
    || navigator.hardwareConcurrency <= 4
    || (nav.deviceMemory !== undefined && nav.deviceMemory <= 4)

  try {
    const { createArchiveScene } = await import('~/lib/archive-scene')
    if (disposed || !stage.value || !canvas.value) {
      context.getExtension('WEBGL_lose_context')?.loseContext()
      return
    }

    const stageStyles = getComputedStyle(stage.value)
    engine = createArchiveScene({
      canvas: canvas.value,
      context,
      host: stage.value,
      articles: props.articles,
      lowPower,
      locale: locale.value,
      archiveLabel: t('archive'),
      titleFontFamily: stageStyles.getPropertyValue('--font-serif').trim()
        || '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      backgroundColor: cssColorToNumber(
        stageStyles.backgroundColor,
        0xfbfcfd,
      ),
    })
    void document.fonts.ready.then(() => {
      if (disposed || !engine) return
      engine.refreshTypography()
      draw()
    })
  } catch (error) {
    context.getExtension('WEBGL_lose_context')?.loseContext()
    console.error('[archive] scene initialization failed', error)
    useFallback('initialization-failed')
    return
  }

  boundCanvas = canvas.value
  contextLostHandler = () => {
    teardownScene()
    useFallback('context-lost')
  }
  boundCanvas.addEventListener('webglcontextlost', contextLostHandler, { once: true })

  track = stage.value.parentElement
  currentIndex.value = clampIndex(props.initialIndex)
  announcedIndex.value = currentIndex.value
  targetPosition = currentIndex.value
  displayPosition = currentIndex.value
  selectionProgress = props.returning ? 1 : 0
  opening.value = props.returning

  ready.value = true
  emit('mode', 'webgl')
  await nextTick()
  if (disposed || !engine || !stage.value) return

  engine.resize()
  measureTrack()
  syncWindowScroll(scrollTopForIndex(currentIndex.value))
  draw()

  resizeObserver = new ResizeObserver(() => {
    measureTrack()
    engine?.resize()
    draw()
    updateHitTarget()
  })
  resizeObserver.observe(stage.value)

  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', measureTrack, { passive: true })
  window.addEventListener('wheel', onWheel, { passive: false, capture: true })
  document.addEventListener('visibilitychange', requestDraw)
  document.documentElement.classList.add('archive-scene-active')

  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  if (disposed || !engine) return
  draw()
  updateHitTarget()
  emit('ready', {
    getActiveRects,
    finishReturnPose,
  })
})

onBeforeUnmount(() => {
  disposed = true
  teardownScene()
})
</script>

<style scoped>
.archive-scene {
  position: sticky;
  top: 0;
  z-index: 2;
  width: 100%;
  height: 100vh;
  height: 100svh;
  overflow: hidden;
  background: var(--color-surface);
  color: var(--color-text);
  opacity: 0;
  outline: none;
  contain: layout paint size;
  touch-action: pan-y pinch-zoom;
  overscroll-behavior-x: none;
  user-select: none;
  -webkit-user-select: none;
}

:global(html.archive-scene-active),
:global(html.archive-scene-active body) {
  overscroll-behavior-x: none;
}

.archive-scene--ready {
  opacity: 1;
  cursor: grab;
}

.archive-scene--dragging,
.archive-scene--dragging .archive-scene__canvas,
.archive-scene--dragging .archive-scene__hit {
  cursor: grabbing;
}

.archive-scene:focus-visible {
  outline: 2px solid var(--color-heading);
  outline-offset: -4px;
}

.archive-scene__canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.archive-scene__topline,
.archive-scene__footer,
.archive-scene__arrow,
.archive-scene__hit {
  position: absolute;
  z-index: 2;
}

.archive-scene__topline {
  top: max(4.5rem, calc(env(safe-area-inset-top) + 4rem));
  right: max(1.25rem, env(safe-area-inset-right));
  left: max(1.25rem, env(safe-area-inset-left));
  display: flex;
  justify-content: space-between;
  font-size: 0.6875rem;
  font-variant-numeric: tabular-nums;
  font-weight: 620;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  pointer-events: none;
}

.archive-scene__hit {
  top: 0;
  left: 0;
  border: 1px solid transparent;
  padding: 0;
  background: transparent;
  cursor: grab;
  opacity: 0;
  pointer-events: none;
  touch-action: pan-y pinch-zoom;
  transform-origin: 0 0;
}

.archive-scene__hit--visible {
  opacity: 1;
  pointer-events: auto;
}

.archive-scene__hit:focus-visible {
  border-color: var(--color-heading);
  outline: 2px solid var(--color-heading);
  outline-offset: 4px;
}

.archive-scene__arrow {
  top: 50%;
  display: grid;
  width: 3rem;
  height: 3rem;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  place-items: center;
  background: var(--color-surface);
  color: inherit;
  font-size: 1.15rem;
  cursor: pointer;
  transform: translateY(-50%);
}

.archive-scene__arrow--previous {
  left: max(1rem, env(safe-area-inset-left));
}

.archive-scene__arrow--next {
  right: max(1rem, env(safe-area-inset-right));
}

.archive-scene__arrow:hover:not(:disabled) {
  background: var(--color-subtle);
}

.archive-scene__arrow:active:not(:disabled) {
  transform: translateY(-50%) scale(0.96);
}

.archive-scene__arrow:focus-visible {
  outline: 2px solid var(--color-heading);
  outline-offset: 3px;
}

.archive-scene__arrow:disabled {
  opacity: 0.28;
  cursor: default;
}

.archive-scene__footer {
  right: max(1.25rem, env(safe-area-inset-right));
  bottom: max(1.25rem, env(safe-area-inset-bottom));
  left: max(1.25rem, env(safe-area-inset-left));
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 1rem;
  align-items: center;
}

.archive-scene__status {
  display: flex;
  gap: 1.5rem;
  justify-content: flex-start;
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
}

.archive-scene__hint {
  justify-self: end;
  font-size: 0.6875rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.archive-scene__announcement {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}

@media (max-width: 44rem) {
  .archive-scene__arrow {
    top: auto;
    bottom: max(4.5rem, calc(env(safe-area-inset-bottom) + 4rem));
    width: 2.75rem;
    height: 2.75rem;
  }

  .archive-scene__footer {
    grid-template-columns: 1fr;
    gap: 0.25rem;
  }

  .archive-scene__hint {
    display: none;
  }
}

@media (max-height: 36rem) and (orientation: landscape) {
  .archive-scene__topline {
    top: 3.5rem;
  }

  .archive-scene__footer {
    bottom: max(0.5rem, env(safe-area-inset-bottom));
  }

  .archive-scene__arrow {
    top: 52%;
    bottom: auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .archive-scene {
    display: none;
  }
}

@media (forced-colors: active) {
  .archive-scene {
    display: none;
  }
}
</style>
