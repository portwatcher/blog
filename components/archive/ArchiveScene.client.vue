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
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerEnd"
    @pointercancel="onPointerEnd"
    @lostpointercapture="onPointerEnd"
    @pointerleave="setHovered(false)"
    @touchstart.passive="onTouchStart"
    @touchend.passive="onTouchEnd"
    @touchcancel.passive="onTouchEnd"
    @wheel.passive="onWheel"
  >
    <div
      ref="horizontalRail"
      class="archive-scene__horizontal-rail"
      aria-hidden="true"
      @scroll.passive="onHorizontalRailScroll"
      @scrollend="onHorizontalRailScrollEnd"
      @click="activateFromSurface"
    >
      <div
        ref="horizontalRailContent"
        class="archive-scene__horizontal-rail-content"
      ></div>
    </div>

    <canvas
      ref="canvas"
      class="archive-scene__canvas"
      aria-hidden="true"
    ></canvas>

    <div class="archive-scene__topline" aria-hidden="true">
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
      @focus="setHovered(true)"
      @blur="setHovered(false)"
      @click="activateCurrent"
    ></button>

    <button
      class="archive-scene__arrow archive-scene__arrow--previous"
      type="button"
      :aria-label="t('archiveScene.previous')"
      :disabled="!canGoPreviousArticle"
      @click="goInShelf(-1)"
    >
      <span aria-hidden="true">←</span>
    </button>

    <button
      class="archive-scene__arrow archive-scene__arrow--next"
      type="button"
      :aria-label="t('archiveScene.next')"
      :disabled="!canGoNextArticle"
      @click="goInShelf(1)"
    >
      <span aria-hidden="true">→</span>
    </button>

    <button
      v-if="hasPreviousShelf"
      class="archive-scene__arrow archive-scene__arrow--shelf archive-scene__arrow--up"
      type="button"
      :aria-label="t('archiveScene.previousShelf')"
      :disabled="!controlsAvailable"
      @click="goToShelf(currentShelfIndex - 1)"
    >
      <span aria-hidden="true">↑</span>
    </button>

    <button
      v-if="hasNextShelf"
      class="archive-scene__arrow archive-scene__arrow--shelf archive-scene__arrow--down"
      type="button"
      :aria-label="t('archiveScene.nextShelf')"
      :disabled="!controlsAvailable"
      @click="goToShelf(currentShelfIndex + 1)"
    >
      <span aria-hidden="true">↓</span>
    </button>

    <div class="archive-scene__footer">
      <div class="archive-scene__status" aria-hidden="true">
        <span>{{ currentYear }}</span>
        <span>{{ formattedDate }}</span>
        <span>{{ String(currentShelfArticlePosition + 1).padStart(2, '0') }} / {{ String(currentShelfArticleIndices.length).padStart(2, '0') }}</span>
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
const horizontalRail = ref<HTMLElement | null>(null)
const horizontalRailContent = ref<HTMLElement | null>(null)
const hitTarget = ref<HTMLButtonElement | null>(null)
const ready = ref(false)
const fallbackReason = ref('')
const opening = ref(false)
const dragging = ref(false)
const horizontalScrolling = ref(false)
const verticalScrolling = ref(false)
const shelfMoving = ref(false)
const currentIndex = ref(0)
const currentShelfIndex = ref(0)
const hitVisible = ref(false)
const hitStyle = ref<Record<string, string>>({})
const currentArticle = computed(() => props.articles[currentIndex.value])
const yearShelves = computed(() => {
  const shelves: Array<{ year: string; articleIndices: number[] }> = []
  const shelfByYear = new Map<string, number>()

  props.articles.forEach((article, articleIndex) => {
    const parsedYear = new Date(article.date).getFullYear()
    const year = Number.isNaN(parsedYear) ? '—' : String(parsedYear)
    let shelfIndex = shelfByYear.get(year)
    if (shelfIndex === undefined) {
      shelfIndex = shelves.length
      shelfByYear.set(year, shelfIndex)
      shelves.push({ year, articleIndices: [] })
    }
    shelves[shelfIndex].articleIndices.push(articleIndex)
  })

  return shelves
})
const currentShelf = computed(() => yearShelves.value[currentShelfIndex.value])
const currentYear = computed(() => currentShelf.value?.year || '')
const currentShelfArticleIndices = computed(
  () => currentShelf.value?.articleIndices || [],
)
const lastVisitedArticleByShelf = new Map<number, number>()
const currentShelfArticlePosition = computed(() => Math.max(
  0,
  currentShelfArticleIndices.value.indexOf(currentIndex.value),
))
const controlsAvailable = computed(() => ready.value
  && !opening.value
  && !dragging.value
  && !horizontalScrolling.value
  && !verticalScrolling.value
  && !shelfMoving.value)
const canGoPreviousArticle = computed(() => controlsAvailable.value
  && currentShelfArticlePosition.value > 0)
const canGoNextArticle = computed(() => controlsAvailable.value
  && currentShelfArticlePosition.value
    < currentShelfArticleIndices.value.length - 1)
const hasPreviousShelf = computed(() => currentShelfIndex.value > 0)
const hasNextShelf = computed(
  () => currentShelfIndex.value < yearShelves.value.length - 1,
)
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
let wheelTimer = 0
let animationFrame = 0
let lastFrameTime = 0
let trackTop = 0
let trackSpan = 1
let horizontalPitch = 220
let lastHorizontalControlPosition = 0
let lastVerticalControlPosition = 0
let targetPosition = 0
let displayPosition = 0
let springVelocity = 0
let cameraFromIndex = 0
let cameraToIndex = 0
let shelfTransitionProgress = 1
let presentationIndex = 0
let presentationProgress = 1
let selectionProgress = 0
let hovered = false
let disposed = false
let expectedProgrammaticScrollTop: number | null = null
let expectedHorizontalScrollLeft: number | null = null
let boundCanvas: HTMLCanvasElement | null = null
let contextLostHandler: ((event: Event) => void) | null = null
let suppressClickUntil = 0
let activeHitRect: DOMRect | null = null
let scrubAnchorIndex: number | null = null
let touchContactActive = false
let wheelGestureActive = false
let gestureSettlePending = false
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
let presentationTween: {
  from: number
  to: number
  startedAt: number
  duration: number
  resolve: () => void
} | null = null
let shelfTransitionTween: {
  startedAt: number
  duration: number
  resolve: () => void
} | null = null

const clampIndex = (value: number) =>
  Math.min(Math.max(0, Math.round(value)), Math.max(0, props.articles.length - 1))

const shelfIndexForArticle = (articleIndex: number) => {
  const foundIndex = yearShelves.value.findIndex(
    (shelf) => shelf.articleIndices.includes(clampIndex(articleIndex)),
  )
  return Math.max(0, foundIndex)
}

const clampShelfIndex = (value: number) => Math.min(
  Math.max(0, Math.round(value)),
  Math.max(0, yearShelves.value.length - 1),
)

const clampPosition = (value: number) => {
  const indices = currentShelfArticleIndices.value
  if (!indices.length) return clampIndex(value)
  return Math.min(
    Math.max(indices[0], value),
    indices[indices.length - 1],
  )
}

const switchThreshold = 0.82
const scrollIdleFallbackMs = 260
const inputEndSettleMs = 30
const axisDominance = 1.25
const springStiffness = 190
const springDamping = 20
const springRestDistance = 0.0006
const springRestSpeed = 0.006
const presentationDuration = 220
const shelfTransitionDuration = 620
const sceneFrame: ArchiveSceneFrame = {
  position: 0,
  selectedIndex: 0,
  cameraFromIndex: 0,
  cameraToIndex: 0,
  shelfTransitionProgress: 1,
  presentationProgress: 1,
  selectionProgress: 0,
  hovered: false,
}

const draw = () => {
  sceneFrame.position = displayPosition
  sceneFrame.selectedIndex = presentationIndex
  sceneFrame.cameraFromIndex = cameraFromIndex
  sceneFrame.cameraToIndex = cameraToIndex
  sceneFrame.shelfTransitionProgress = shelfTransitionProgress
  sceneFrame.presentationProgress = presentationProgress
  sceneFrame.selectionProgress = selectionProgress
  sceneFrame.hovered = hovered
  engine?.draw(sceneFrame)
}

const updateHitTarget = () => {
  if (!engine || !stage.value || opening.value) {
    activeHitRect = null
    hitVisible.value = false
    return
  }

  const rect = engine.getActiveRects().surfaceRect
  activeHitRect = rect
  const stageRect = stage.value.getBoundingClientRect()
  hitStyle.value = {
    width: `${Math.max(44, rect.width)}px`,
    height: `${Math.max(44, rect.height)}px`,
    transform: `translate3d(${rect.left - stageRect.left}px, ${rect.top - stageRect.top}px, 0)`,
  }
  hitVisible.value = presentationIndex === currentIndex.value
    && presentationProgress > 0.999
    && !presentationTween
    && Math.abs(displayPosition - currentIndex.value) < 0.025
}

const requestDraw = () => {
  if (animationFrame || document.hidden) return
  animationFrame = window.requestAnimationFrame(frame)
}

const frame = (now: number) => {
  animationFrame = 0
  const delta = Math.min(0.032, Math.max(0.001, (now - (lastFrameTime || now)) / 1000))
  lastFrameTime = now

  const directlyManipulated = dragging.value
    || horizontalScrolling.value
    || verticalScrolling.value
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

  if (presentationTween) {
    const elapsed = now - presentationTween.startedAt
    const progress = Math.min(1, elapsed / presentationTween.duration)
    presentationProgress = presentationTween.from
      + (presentationTween.to - presentationTween.from) * progress
    if (progress === 1) {
      presentationProgress = presentationTween.to
      const resolve = presentationTween.resolve
      presentationTween = null
      resolve()
    }
  }

  if (shelfTransitionTween) {
    const elapsed = now - shelfTransitionTween.startedAt
    const progress = Math.min(1, elapsed / shelfTransitionTween.duration)
    shelfTransitionProgress = progress
    if (progress === 1) {
      shelfTransitionProgress = 1
      const resolve = shelfTransitionTween.resolve
      shelfTransitionTween = null
      resolve()
    }
  }

  draw()
  const moving = Math.abs(targetPosition - displayPosition) >= springRestDistance
    || Math.abs(springVelocity) >= springRestSpeed
  if (directlyManipulated) {
    hitVisible.value = false
    if (
      moving
      || selectionTween
      || presentationTween
      || shelfTransitionTween
    ) requestDraw()
  } else if (moving) {
    // Presentation and the snap spring intentionally overlap. Once the card is
    // fully out and the remaining spring tail is visually negligible, it is
    // ready to open even though the camera is still settling by a few pixels.
    if (
      presentationProgress > 0.999
      && Math.abs(displayPosition - currentIndex.value) < 0.025
    ) {
      updateHitTarget()
    } else {
      hitVisible.value = false
    }
    requestDraw()
  } else if (opening.value || selectionTween) {
    hitVisible.value = false
    if (selectionTween || presentationTween) requestDraw()
  } else if (presentationTween) {
    hitVisible.value = false
    requestDraw()
  } else if (shelfTransitionTween || shelfMoving.value) {
    hitVisible.value = false
    requestDraw()
  } else if (
    presentationIndex !== currentIndex.value
    || presentationProgress < 0.999
  ) {
    // Covers initialization and non-scroll state changes. Scroll settling
    // starts this presentation immediately so it can overlap the snap spring.
    presentationIndex = currentIndex.value
    hitVisible.value = false
    void animatePresentation(1, presentationDuration)
  } else {
    announcedIndex.value = currentIndex.value
    updateHitTarget()
  }
}

const pixelsPerArticle = () => {
  const viewportWidth = stage.value?.clientWidth || window.innerWidth
  // Keep phone swipes long-range, then progressively restore desktop precision.
  const widthProgress = Math.min(
    1,
    Math.max(0, (viewportWidth - 360) / (1280 - 360)),
  )
  const viewportShare = 0.22 + widthProgress * 0.08

  return Math.min(380, Math.max(72, viewportWidth * viewportShare))
}

const syncHorizontalRail = (position: number) => {
  if (!horizontalRail.value) return
  const nextPosition = clampPosition(position)
  const shelfStart = currentShelfArticleIndices.value[0] || 0
  const localPosition = nextPosition - shelfStart
  const left = localPosition * horizontalPitch
  lastHorizontalControlPosition = nextPosition
  if (Math.abs(horizontalRail.value.scrollLeft - left) <= 0.5) {
    expectedHorizontalScrollLeft = null
    return
  }
  expectedHorizontalScrollLeft = left
  horizontalRail.value.scrollTo({ left, behavior: 'auto' })
}

const updateHorizontalRailMetrics = () => {
  if (!stage.value || !horizontalRailContent.value) return
  horizontalPitch = pixelsPerArticle()
  const span = Math.max(
    0,
    currentShelfArticleIndices.value.length - 1,
  ) * horizontalPitch
  horizontalRailContent.value.style.width = `${stage.value.clientWidth + span}px`
  if (!horizontalScrolling.value && !dragging.value) {
    syncHorizontalRail(currentIndex.value)
  }
}

const measureTrack = () => {
  if (!track) return
  const rect = track.getBoundingClientRect()
  trackTop = rect.top + window.scrollY
  trackSpan = Math.max(1, track.offsetHeight - window.innerHeight)
  updateHorizontalRailMetrics()
  if (!verticalScrolling.value) {
    lastVerticalControlPosition = positionForScrollTop(window.scrollY)
  }
}

const scrollTopForPosition = (position: number) => {
  const denominator = Math.max(1, yearShelves.value.length - 1)
  return trackTop + (clampShelfIndex(position) / denominator) * trackSpan
}

const scrollTopForIndex = (index: number) => scrollTopForPosition(
  shelfIndexForArticle(index),
)

const positionForScrollTop = (top: number) => {
  const progress = (top - trackTop) / trackSpan
  return Math.min(
    Math.max(0, progress * Math.max(0, yearShelves.value.length - 1)),
    Math.max(0, yearShelves.value.length - 1),
  )
}

const syncWindowScroll = (top: number) => {
  lastVerticalControlPosition = positionForScrollTop(top)
  if (Math.abs(window.scrollY - top) <= 0.5) {
    expectedProgrammaticScrollTop = null
    return
  }
  expectedProgrammaticScrollTop = top
  window.scrollTo({ top, behavior: 'auto' })
}

const releasedIndex = (anchorIndex: number, position: number) => {
  const delta = position - anchorIndex
  const magnitude = Math.abs(delta)
  if (magnitude < switchThreshold) return Math.round(clampPosition(anchorIndex))

  const steps = 1 + Math.floor(Math.max(0, magnitude - switchThreshold))
  return Math.round(clampPosition(anchorIndex + Math.sign(delta) * steps))
}

const beginScrub = () => {
  if (scrubAnchorIndex === null) scrubAnchorIndex = currentIndex.value
  targetPosition = displayPosition
  springVelocity = 0
  lastFrameTime = 0
  hovered = false
  hitVisible.value = false
  void animatePresentation(0, 180)
}

const settleToCommitted = () => {
  if (!ready.value || opening.value || shelfMoving.value) return

  window.clearTimeout(scrollTimer)
  window.clearTimeout(horizontalScrollTimer)
  window.clearTimeout(wheelTimer)
  wheelGestureActive = false
  const nextIndex = releasedIndex(
    scrubAnchorIndex ?? currentIndex.value,
    displayPosition,
  )
  scrubAnchorIndex = null
  gestureSettlePending = false
  dragging.value = false
  horizontalScrolling.value = false
  verticalScrolling.value = false
  currentIndex.value = nextIndex
  lastVisitedArticleByShelf.set(currentShelfIndex.value, nextIndex)
  presentationIndex = nextIndex
  targetPosition = nextIndex
  displayPosition = nextIndex
  springVelocity = 0
  lastFrameTime = 0
  // Native scrolling is over. Align once with no synthetic velocity tail,
  // then let the physical extraction be the only remaining movement.
  void animatePresentation(1, presentationDuration)
  syncWindowScroll(scrollTopForIndex(nextIndex))
  syncHorizontalRail(nextIndex)
  requestDraw()
}

const goToIndex = (index: number) => {
  if (!ready.value || opening.value || shelfMoving.value) return
  const nextIndex = Math.round(clampPosition(index))
  window.clearTimeout(scrollTimer)
  window.clearTimeout(horizontalScrollTimer)
  window.clearTimeout(wheelTimer)
  wheelGestureActive = false
  scrubAnchorIndex = null
  gestureSettlePending = false
  dragging.value = false
  horizontalScrolling.value = false
  verticalScrolling.value = false
  hovered = false
  hitVisible.value = false
  void animatePresentation(0, 180)
  currentIndex.value = nextIndex
  lastVisitedArticleByShelf.set(currentShelfIndex.value, nextIndex)
  targetPosition = nextIndex
  springVelocity = 0
  lastFrameTime = 0
  syncWindowScroll(scrollTopForIndex(nextIndex))
  syncHorizontalRail(nextIndex)
  requestDraw()
}

const goInShelf = (direction: -1 | 1) => {
  const nextPosition = currentShelfArticlePosition.value + direction
  const nextIndex = currentShelfArticleIndices.value[nextPosition]
  if (nextIndex === undefined) return
  goToIndex(nextIndex)
}

const goToShelf = async (
  shelfIndex: number,
  preferredArticleIndex?: number,
) => {
  if (!ready.value || opening.value || shelfMoving.value) return
  const nextShelfIndex = clampShelfIndex(shelfIndex)
  if (nextShelfIndex === currentShelfIndex.value) {
    if (preferredArticleIndex !== undefined) goToIndex(preferredArticleIndex)
    return
  }

  const targetShelf = yearShelves.value[nextShelfIndex]
  if (!targetShelf?.articleIndices.length) return
  const previousIndex = currentIndex.value
  lastVisitedArticleByShelf.set(currentShelfIndex.value, previousIndex)
  const rememberedIndex = lastVisitedArticleByShelf.get(nextShelfIndex)
  const targetIndex = preferredArticleIndex !== undefined
    && targetShelf.articleIndices.includes(preferredArticleIndex)
    ? preferredArticleIndex
    : rememberedIndex !== undefined
      && targetShelf.articleIndices.includes(rememberedIndex)
      ? rememberedIndex
      : targetShelf.articleIndices[0]

  shelfMoving.value = true
  hitVisible.value = false
  hovered = false
  window.clearTimeout(scrollTimer)
  window.clearTimeout(horizontalScrollTimer)
  window.clearTimeout(wheelTimer)
  wheelGestureActive = false
  gestureSettlePending = false
  scrubAnchorIndex = null
  dragging.value = false
  horizontalScrolling.value = false
  verticalScrolling.value = false

  await animatePresentation(0, 160)
  if (disposed || !engine) return

  currentShelfIndex.value = nextShelfIndex
  currentIndex.value = targetIndex
  lastVisitedArticleByShelf.set(nextShelfIndex, targetIndex)
  presentationIndex = targetIndex
  targetPosition = targetIndex
  displayPosition = targetIndex
  springVelocity = 0
  cameraFromIndex = previousIndex
  cameraToIndex = targetIndex
  shelfTransitionProgress = 0
  lastFrameTime = 0
  updateHorizontalRailMetrics()
  syncWindowScroll(scrollTopForIndex(targetIndex))
  syncHorizontalRail(targetIndex)

  await animateShelfTransition(shelfTransitionDuration)
  if (disposed || !engine) return

  cameraFromIndex = targetIndex
  cameraToIndex = targetIndex
  shelfTransitionProgress = 1
  await animatePresentation(1, presentationDuration)
  if (disposed || !engine) return

  shelfMoving.value = false
  announcedIndex.value = targetIndex
  requestDraw()
}

const goToArticleIndex = (articleIndex: number) => {
  const nextIndex = clampIndex(articleIndex)
  const nextShelfIndex = shelfIndexForArticle(nextIndex)
  if (nextShelfIndex === currentShelfIndex.value) {
    goToIndex(nextIndex)
  } else {
    void goToShelf(nextShelfIndex, nextIndex)
  }
}

const settleScroll = () => {
  if (!verticalScrolling.value) return
  verticalScrolling.value = false
  gestureSettlePending = false
}

const onScroll = () => {
  if (
    !ready.value
    || opening.value
    || dragging.value
    || horizontalScrolling.value
    || shelfMoving.value
  ) return
  const nativePosition = positionForScrollTop(window.scrollY)
  if (expectedProgrammaticScrollTop !== null) {
    const expectedTop = expectedProgrammaticScrollTop
    expectedProgrammaticScrollTop = null
    if (Math.abs(window.scrollY - expectedTop) <= 1) {
      lastVerticalControlPosition = nativePosition
      return
    }
  }

  verticalScrolling.value = true
  lastVerticalControlPosition = nativePosition
  const nextShelfIndex = clampShelfIndex(nativePosition)
  if (nextShelfIndex !== currentShelfIndex.value) {
    void goToShelf(nextShelfIndex)
  }
  window.clearTimeout(scrollTimer)
  scrollTimer = window.setTimeout(
    settleScroll,
    scrollIdleFallbackMs,
  )
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

const animatePresentation = (to: number, duration: number) => {
  if (presentationTween) {
    presentationTween.resolve()
    presentationTween = null
  }
  lastFrameTime = 0

  if (Math.abs(presentationProgress - to) < 0.001) {
    presentationProgress = to
    requestDraw()
    return Promise.resolve()
  }

  return new Promise<void>((resolve) => {
    presentationTween = {
      from: presentationProgress,
      to,
      startedAt: performance.now(),
      duration,
      resolve,
    }
    requestDraw()
  })
}

const animateShelfTransition = (duration: number) => {
  if (shelfTransitionTween) {
    shelfTransitionTween.resolve()
    shelfTransitionTween = null
  }
  lastFrameTime = 0

  return new Promise<void>((resolve) => {
    shelfTransitionTween = {
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

const setInteractivePosition = (position: number) => {
  const nextPosition = clampPosition(position)
  targetPosition = nextPosition
  displayPosition = nextPosition
  springVelocity = 0
  selectionProgress = 0
  hovered = false
  hitVisible.value = false
  window.clearTimeout(scrollTimer)
  requestDraw()
}

const pointInsideActiveCase = (clientX: number, clientY: number) => Boolean(
  activeHitRect
  && clientX >= activeHitRect.left
  && clientX <= activeHitRect.right
  && clientY >= activeHitRect.top
  && clientY <= activeHitRect.bottom,
)

const onPointerDown = (event: PointerEvent) => {
  if (!ready.value || opening.value || !event.isPrimary) return
  // The transparent rail owns touch panning so mobile browsers can provide
  // their native momentum and deceleration. Pointer dragging remains the
  // desktop mouse/pen path only.
  if (event.pointerType === 'touch') return
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
  if (!gesture || gesture.pointerId !== event.pointerId) {
    if (event.pointerType === 'mouse') {
      setHovered(pointInsideActiveCase(event.clientX, event.clientY))
    }
    return
  }

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
    if (horizontalScrolling.value || verticalScrolling.value) {
      settleToCommitted()
    }
    // Catch a running spring from its current visual position. The full pointer
    // travel since press still contributes, so the detent distance stays exact.
    gesture.startPosition = displayPosition
    beginScrub()
    dragging.value = true
    window.clearTimeout(scrollTimer)
    window.clearTimeout(horizontalScrollTimer)
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

const settleHorizontalScroll = () => {
  if (
    !ready.value
    || opening.value
    || dragging.value
    || verticalScrolling.value
    || !horizontalScrolling.value
  ) return
  if (touchContactActive || wheelGestureActive) {
    gestureSettlePending = true
    return
  }
  settleToCommitted()
}

const onHorizontalRailScroll = () => {
  const rail = horizontalRail.value
  if (
    !rail
    || !ready.value
    || opening.value
    || dragging.value
    || verticalScrolling.value
    || shelfMoving.value
  ) return
  const shelfStart = currentShelfArticleIndices.value[0] || 0
  const nativePosition = clampPosition(
    shelfStart + rail.scrollLeft / Math.max(1, horizontalPitch),
  )
  if (expectedHorizontalScrollLeft !== null) {
    const expectedLeft = expectedHorizontalScrollLeft
    expectedHorizontalScrollLeft = null
    if (Math.abs(rail.scrollLeft - expectedLeft) <= 1) {
      lastHorizontalControlPosition = nativePosition
      return
    }
  }

  if (!horizontalScrolling.value) {
    beginScrub()
    horizontalScrolling.value = true
  }
  const delta = nativePosition - lastHorizontalControlPosition
  lastHorizontalControlPosition = nativePosition
  setInteractivePosition(displayPosition + delta)
  window.clearTimeout(horizontalScrollTimer)
  horizontalScrollTimer = window.setTimeout(
    settleHorizontalScroll,
    inputEndSettleMs,
  )
}

const onHorizontalRailScrollEnd = () => {
  window.clearTimeout(horizontalScrollTimer)
  settleHorizontalScroll()
}

const settleActiveScroll = () => {
  if (horizontalScrolling.value) {
    settleHorizontalScroll()
  } else if (verticalScrolling.value) {
    settleScroll()
  }
}

const onWheel = () => {
  if (!ready.value || opening.value || dragging.value) return
  wheelGestureActive = true
  gestureSettlePending = false
  window.clearTimeout(wheelTimer)
  wheelTimer = window.setTimeout(() => {
    wheelGestureActive = false
    if (
      gestureSettlePending
      || horizontalScrolling.value
      || verticalScrolling.value
    ) settleActiveScroll()
  }, inputEndSettleMs)
}

const scheduleTouchReleaseFallback = () => {
  if (horizontalScrolling.value) {
    window.clearTimeout(horizontalScrollTimer)
    horizontalScrollTimer = window.setTimeout(
      settleHorizontalScroll,
      inputEndSettleMs,
    )
  } else if (verticalScrolling.value) {
    window.clearTimeout(scrollTimer)
    scrollTimer = window.setTimeout(settleScroll, scrollIdleFallbackMs)
  }
}

const onTouchStart = (event: TouchEvent) => {
  touchContactActive = event.touches.length > 0
  if (touchContactActive) gestureSettlePending = false
}

const onTouchEnd = (event: TouchEvent) => {
  touchContactActive = event.touches.length > 0
  if (touchContactActive || !gestureSettlePending) return

  // Do not snap on touchend: the browser may only now be starting momentum.
  // Scroll events keep resetting this fallback until inertia has fully ended;
  // browsers with `scrollend` settle immediately through that event instead.
  gestureSettlePending = false
  scheduleTouchReleaseFallback()
}

const activateFromSurface = (event: MouseEvent) => {
  if (
    event.detail
    && performance.now() < suppressClickUntil
  ) return

  const pickedIndex = engine?.pickArticleAt(event.clientX, event.clientY)
  if (pickedIndex === null || pickedIndex === undefined) return
  if (pickedIndex === currentIndex.value && hitVisible.value) {
    activateCurrent(event)
    return
  }
  goToArticleIndex(pickedIndex)
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
  if (
    event.defaultPrevented
    || event.isComposing
    || event.metaKey
    || event.ctrlKey
    || event.altKey
  ) return

  const target = event.target instanceof HTMLElement ? event.target : null
  if (target?.matches('input, textarea, select, [contenteditable="true"]')) return
  const key = event.key.toLowerCase()
  const stageHasFocus = Boolean(target && stage.value?.contains(target))
  if (event.key === 'ArrowLeft' || key === 'a') {
    event.preventDefault()
    goInShelf(-1)
  } else if (event.key === 'ArrowRight' || key === 'd') {
    event.preventDefault()
    goInShelf(1)
  } else if (event.key === 'ArrowUp' || key === 'w') {
    event.preventDefault()
    void goToShelf(currentShelfIndex.value - 1)
  } else if (event.key === 'ArrowDown' || key === 's') {
    event.preventDefault()
    void goToShelf(currentShelfIndex.value + 1)
  } else if (stageHasFocus && event.key === 'Home') {
    event.preventDefault()
    const firstIndex = currentShelfArticleIndices.value[0]
    if (firstIndex !== undefined) goToIndex(firstIndex)
  } else if (stageHasFocus && event.key === 'End') {
    event.preventDefault()
    const lastIndex = currentShelfArticleIndices.value.at(-1)
    if (lastIndex !== undefined) goToIndex(lastIndex)
  } else if (
    stageHasFocus
    && !target?.matches('button, a')
    && (event.key === 'Enter' || event.key === ' ')
  ) {
    event.preventDefault()
    activateCurrent()
  }
}

const focusForOpen = async () => {
  if (!engine) throw new Error('Archive scene is unavailable')
  opening.value = true
  window.clearTimeout(scrollTimer)
  window.clearTimeout(horizontalScrollTimer)
  window.clearTimeout(wheelTimer)
  scrubAnchorIndex = null
  touchContactActive = false
  wheelGestureActive = false
  gestureSettlePending = false
  dragging.value = false
  horizontalScrolling.value = false
  verticalScrolling.value = false
  shelfMoving.value = false
  hovered = false
  shelfTransitionTween?.resolve()
  shelfTransitionTween = null
  cameraFromIndex = currentIndex.value
  cameraToIndex = currentIndex.value
  shelfTransitionProgress = 1
  presentationTween?.resolve()
  presentationTween = null
  presentationIndex = currentIndex.value
  presentationProgress = 1
  displayPosition = currentIndex.value
  targetPosition = currentIndex.value
  springVelocity = 0
  syncWindowScroll(scrollTopForIndex(currentIndex.value))
  syncHorizontalRail(currentIndex.value)
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
  presentationIndex = currentIndex.value
  presentationProgress = 1
  targetPosition = currentIndex.value
  displayPosition = currentIndex.value
  springVelocity = 0
  cameraFromIndex = currentIndex.value
  cameraToIndex = currentIndex.value
  shelfTransitionProgress = 1
  shelfMoving.value = false
  syncWindowScroll(scrollTopForIndex(currentIndex.value))
  syncHorizontalRail(currentIndex.value)
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
  window.clearTimeout(wheelTimer)
  window.cancelAnimationFrame(animationFrame)
  animationFrame = 0
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('scrollend', settleScroll)
  window.removeEventListener('resize', measureTrack)
  window.removeEventListener('keydown', onKeydown)
  document.removeEventListener('visibilitychange', requestDraw)
  dragGesture = null
  scrubAnchorIndex = null
  touchContactActive = false
  wheelGestureActive = false
  gestureSettlePending = false
  expectedProgrammaticScrollTop = null
  expectedHorizontalScrollLeft = null
  lastHorizontalControlPosition = 0
  lastVerticalControlPosition = 0
  activeHitRect = null
  dragging.value = false
  horizontalScrolling.value = false
  verticalScrolling.value = false
  shelfMoving.value = false
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
  presentationTween?.resolve()
  presentationTween = null
  shelfTransitionTween?.resolve()
  shelfTransitionTween = null
  engine?.destroy()
  engine = null
}

onMounted(async () => {
  await nextTick()
  if (
    !stage.value
    || !canvas.value
    || !horizontalRail.value
    || !horizontalRailContent.value
  ) {
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
    // Native framebuffer MSAA is the cheapest useful edge treatment here: it
    // avoids a post-processing pass and remains bounded by the pixel budget.
    antialias: true,
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
  const coreCount = navigator.hardwareConcurrency || 4
  const deviceMemory = nav.deviceMemory
  const lowPower =
    (deviceMemory !== undefined && deviceMemory <= 2)
    || (
      coreCount <= 4
      && (deviceMemory === undefined || deviceMemory <= 4)
    )

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
  currentShelfIndex.value = shelfIndexForArticle(currentIndex.value)
  lastVisitedArticleByShelf.set(currentShelfIndex.value, currentIndex.value)
  announcedIndex.value = currentIndex.value
  targetPosition = currentIndex.value
  displayPosition = currentIndex.value
  cameraFromIndex = currentIndex.value
  cameraToIndex = currentIndex.value
  shelfTransitionProgress = 1
  presentationIndex = currentIndex.value
  presentationProgress = 1
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
  window.addEventListener('scrollend', settleScroll, { passive: true })
  window.addEventListener('resize', measureTrack, { passive: true })
  window.addEventListener('keydown', onKeydown)
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
  touch-action: pan-x pan-y pinch-zoom;
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
.archive-scene--dragging .archive-scene__horizontal-rail,
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

.archive-scene__horizontal-rail {
  position: absolute;
  inset: 0;
  z-index: 2;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-x: none;
  scrollbar-width: none;
  touch-action: pan-x pan-y pinch-zoom;
  -webkit-overflow-scrolling: touch;
  cursor: inherit;
}

.archive-scene__horizontal-rail::-webkit-scrollbar {
  display: none;
}

.archive-scene__horizontal-rail-content {
  min-width: 100%;
  height: 1px;
}

.archive-scene__topline,
.archive-scene__footer,
.archive-scene__arrow,
.archive-scene__hit {
  position: absolute;
  z-index: 3;
}

.archive-scene__topline {
  top: max(4.5rem, calc(env(safe-area-inset-top) + 4rem));
  right: max(1.25rem, env(safe-area-inset-right));
  left: max(1.25rem, env(safe-area-inset-left));
  display: flex;
  justify-content: flex-end;
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
  pointer-events: none;
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
  transition:
    background-color 180ms cubic-bezier(0.25, 1, 0.5, 1),
    color 180ms cubic-bezier(0.25, 1, 0.5, 1),
    opacity 180ms cubic-bezier(0.25, 1, 0.5, 1),
    transform 180ms cubic-bezier(0.25, 1, 0.5, 1);
}

.archive-scene__arrow--previous {
  left: max(1rem, env(safe-area-inset-left));
}

.archive-scene__arrow--next {
  right: max(1rem, env(safe-area-inset-right));
}

.archive-scene__arrow--shelf {
  left: 50%;
  transform: translateX(-50%);
}

.archive-scene__arrow--up {
  top: max(
    calc(var(--site-header-height, 47px) + env(safe-area-inset-top) + 0.75rem),
    3.75rem
  );
}

.archive-scene__arrow--down {
  top: auto;
  bottom: max(
    calc(env(safe-area-inset-bottom) + 2.75rem),
    2.75rem
  );
}

.archive-scene__arrow:hover:not(:disabled) {
  background: var(--color-subtle);
}

.archive-scene__arrow:active:not(:disabled) {
  transform: translateY(-50%) scale(0.96);
}

.archive-scene__arrow--shelf:active:not(:disabled) {
  transform: translateX(-50%) scale(0.96);
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
  .archive-scene__arrow--previous,
  .archive-scene__arrow--next {
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

  .archive-scene__arrow--shelf {
    width: 2.75rem;
    height: 2.75rem;
  }

}

@media (max-height: 36rem) and (orientation: landscape) {
  .archive-scene__topline {
    top: 3.5rem;
  }

  .archive-scene__footer {
    bottom: max(0.5rem, env(safe-area-inset-bottom));
  }

  .archive-scene__arrow--previous,
  .archive-scene__arrow--next {
    top: 52%;
    bottom: auto;
  }

  .archive-scene__arrow--up {
    top: 4rem;
  }

  .archive-scene__arrow--down {
    bottom: 2.5rem;
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
