import type { ArchiveSceneEngine, ArchiveSceneFrame, ArchiveSceneRects } from '~/lib/archive-scene'
import { createArchiveNavigation } from '~/lib/archive-navigation'

interface ArchiveSceneProps {
  articles: Article[]
  initialIndex: number
  returning: boolean
}

export interface ArchiveOpenController {
  focusForOpen: () => Promise<ArchiveSceneRects>
  finishReturnPose: () => Promise<void>
}

export interface ArchiveReturnController {
  getActiveRects: () => ArchiveSceneRects
  finishReturnPose: () => Promise<void>
}

interface ArchiveSceneEvents {
  activate: (article: Article, index: number, controller: ArchiveOpenController) => void
  mode: (mode: 'webgl' | 'fallback') => void
  ready: (controller: ArchiveReturnController) => void
}

export const useArchiveScene = (props: ArchiveSceneProps, events: ArchiveSceneEvents) => {
  const { locale, t } = useI18n()
  const stage = ref<HTMLElement | null>(null)
  const canvas = ref<HTMLCanvasElement | null>(null)
  const hitTarget = ref<HTMLButtonElement | null>(null)
  const ready = ref(false)
  const fallbackReason = ref('')
  const opening = ref(false)
  const currentShelfIndex = ref(0)
  const selectedIndex = ref<number | null>(null)
  const currentIndex = ref(0)
  const navigationPosition = ref(-0.5)
  const hitVisible = ref(false)
  const hitStyle = ref<Record<string, string>>({})
  const yearShelves = computed(() => {
    const shelves: Array<{ year: string; articleIndices: number[] }> = []
    const byYear = new Map<string, number>()
    props.articles.forEach((article, index) => {
      const year = String(new Date(article.date).getFullYear())
      let shelf = byYear.get(year)
      if (shelf === undefined) {
        shelf = shelves.length
        byYear.set(year, shelf)
        shelves.push({ year, articleIndices: [] })
      }
      shelves[shelf].articleIndices.push(index)
    })
    return shelves
  })
  const currentShelf = computed(() => yearShelves.value[currentShelfIndex.value])
  const currentYear = computed(() => currentShelf.value?.year || '')
  const currentShelfArticleIndices = computed(() => currentShelf.value?.articleIndices || [])
  const currentShelfArticlePosition = computed(() =>
    currentShelfArticleIndices.value.indexOf(currentIndex.value))
  const currentArticle = computed(() => selectedIndex.value === null
    ? undefined : props.articles[selectedIndex.value])
  const controlsAvailable = computed(() => ready.value && !opening.value)
  const canGoPreviousArticle = computed(() => controlsAvailable.value
    && navigationPosition.value > (currentShelfArticleIndices.value[0] ?? 0) + 0.0001)
  const canGoNextArticle = computed(() => controlsAvailable.value
    && navigationPosition.value < (currentShelfArticleIndices.value.at(-1) ?? 0) - 0.0001)
  const hasPreviousShelf = computed(() => currentShelfIndex.value > 0)
  const hasNextShelf = computed(() => currentShelfIndex.value < yearShelves.value.length - 1)
  const formatDate = (value?: string) => {
    if (!value) {
      return ''
    }
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale.value, {
      year: 'numeric', month: 'short', day: '2-digit',
    }).format(date)
  }
  const formattedDate = computed(() => formatDate(currentArticle.value?.date))
  const announcedIndex = ref<number | null>(null)
  const announcementText = computed(() => announcedIndex.value === null ? ''
    : t('archiveScene.announcement', {
      title: props.articles[announcedIndex.value]?.title || '',
      date: formatDate(props.articles[announcedIndex.value]?.date),
      index: announcedIndex.value + 1,
      count: props.articles.length,
    }))
  const navigation = createArchiveNavigation(0, Math.max(0, props.articles.length - 1))
  const lastVisitedByShelf = new Map<number, number>()
  const sceneFrame: ArchiveSceneFrame = {
    position: -0.5, selectedIndex: null, firstIndex: 0,
    lastIndex: Math.max(0, props.articles.length - 1), deltaSeconds: 1 / 60,
    selectionProgress: 0, hovered: false,
  }
  let engine: ArchiveSceneEngine | null = null
  let resizeObserver: ResizeObserver | null = null
  let animationFrame = 0
  let lastFrameTime = 0
  let disposed = false
  let activeHitRect: DOMRect | null = null
  let selectionTween: {
    from: number; to: number; startedAt: number; duration: number; resolve: () => void
  } | null = null

  const requestDraw = () => {
    if (!animationFrame && !document.hidden && !disposed) {
      animationFrame = requestAnimationFrame(frame)
    }
  }

  const updateHitTarget = (cameraMoving: boolean) => {
    hitVisible.value = false
    activeHitRect = null
    if (!engine || !stage.value || opening.value || selectedIndex.value === null
      || input.dragging.value || cameraMoving) {
      return
    }
    const rect = engine.getActiveRects().surfaceRect
    const host = stage.value.getBoundingClientRect()
    activeHitRect = rect
    hitStyle.value = {
      width: `${Math.max(44, rect.width)}px`,
      height: `${Math.max(44, rect.height)}px`,
      transform: `translate3d(${rect.left - host.left}px, ${rect.top - host.top}px, 0)`,
    }
    hitVisible.value = true
  }

  const draw = (deltaSeconds = 1 / 60) => {
    sceneFrame.position = navigation.position
    navigationPosition.value = navigation.destination ?? navigation.position
    sceneFrame.selectedIndex = navigation.selectedIndex
    sceneFrame.deltaSeconds = deltaSeconds
    selectedIndex.value = navigation.selectedIndex
    const nearest = Math.min(sceneFrame.lastIndex, Math.max(sceneFrame.firstIndex,
      Math.round(navigation.position)))
    currentIndex.value = Math.min(sceneFrame.lastIndex, Math.max(sceneFrame.firstIndex,
      Math.round(navigation.destination ?? nearest)))
    const moving = engine?.draw(sceneFrame) ?? false
    updateHitTarget(moving)
    return moving
  }

  const frame = (now: number) => {
    animationFrame = 0
    const seconds = Math.min(0.05, Math.max(0.001, (now - (lastFrameTime || now - 16.67)) / 1000))
    lastFrameTime = now
    const moving = navigation.advance(seconds)
    if (selectionTween) {
      const progress = Math.min(1, (now - selectionTween.startedAt) / selectionTween.duration)
      sceneFrame.selectionProgress = selectionTween.from
        + (selectionTween.to - selectionTween.from) * progress
      if (progress === 1) {
        selectionTween.resolve()
        selectionTween = null
      }
    }
    const cameraMoving = draw(seconds)
    if (moving || cameraMoving || selectionTween) {
      requestDraw()
    } else {
      lastFrameTime = 0
      announcedIndex.value = selectedIndex.value
    }
  }

  const setHovered = (value: boolean) => {
    if (sceneFrame.hovered !== value && !opening.value) {
      sceneFrame.hovered = value
      requestDraw()
    }
  }

  const goToIndex = (index: number) => {
    if (!controlsAvailable.value) {
      return
    }
    input.cancel()
    navigation.goTo(index)
    currentIndex.value = navigation.destination ?? currentIndex.value
    sceneFrame.hovered = false
    requestDraw()
  }

  const goInShelf = (direction: -1 | 1) => {
    const position = navigation.destination ?? navigation.position
    const next = direction === 1 ? Math.floor(position + 0.0001) + 1
      : Math.ceil(position - 0.0001) - 1
    goToIndex(next)
  }

  const goToShelf = (index: number, preferred?: number) => {
    if (!controlsAvailable.value) {
      return
    }
    const shelfIndex = Math.min(yearShelves.value.length - 1, Math.max(0, index))
    if (shelfIndex === currentShelfIndex.value) {
      if (preferred !== undefined) {
        goToIndex(preferred)
      }
      return
    }
    input.cancel()
    lastVisitedByShelf.set(currentShelfIndex.value, navigation.position)
    currentShelfIndex.value = shelfIndex
    const indices = currentShelfArticleIndices.value
    sceneFrame.firstIndex = indices[0]
    sceneFrame.lastIndex = indices[indices.length - 1]
    navigation.setRange(sceneFrame.firstIndex, sceneFrame.lastIndex,
      preferred ?? lastVisitedByShelf.get(shelfIndex))
    sceneFrame.hovered = false
    currentIndex.value = Math.max(indices[0], Math.round(navigation.position))
    requestDraw()
  }

  const animateSelection = (to: number, duration: number) => {
    selectionTween?.resolve()
    return new Promise<void>((resolve) => {
      selectionTween = {
        from: sceneFrame.selectionProgress, to, startedAt: performance.now(), duration, resolve,
      }
      requestDraw()
    })
  }

  const focusForOpen = async () => {
    if (!engine || selectedIndex.value === null) {
      throw new Error('No archive article is selected')
    }
    opening.value = true
    input.cancel()
    navigation.hold(selectedIndex.value)
    sceneFrame.hovered = false
    await animateSelection(1, 300)
    if (disposed || !engine) {
      throw new Error('Archive scene was disposed during transition')
    }
    draw()
    return engine.getActiveRects()
  }

  const finishReturnPose = async () => {
    if (!engine) {
      return
    }
    await animateSelection(0, 320)
    if (disposed || !engine) {
      return
    }
    opening.value = false
    requestDraw()
    await nextTick()
    stage.value?.focus({ preventScroll: true })
  }

  const getActiveRects = (): ArchiveSceneRects => engine?.getActiveRects() || {
    surfaceRect: new DOMRect(), titleRect: new DOMRect(),
  }

  const activateCurrent = (event?: MouseEvent) => {
    if (event?.detail && !input.canClick()) {
      return
    }
    if (currentArticle.value && selectedIndex.value !== null && hitVisible.value && controlsAvailable.value) {
      events.activate(currentArticle.value, selectedIndex.value, { focusForOpen, finishReturnPose })
    }
  }

  const activateFromSurface = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target : null
    if (!input.canClick() || target?.closest('button, a') || !controlsAvailable.value) {
      return
    }
    const index = engine?.pickArticleAt(event.clientX, event.clientY)
    if (index === null || index === undefined) {
      return
    }
    if (index === selectedIndex.value && hitVisible.value) {
      activateCurrent(event)
    } else {
      const shelf = yearShelves.value.findIndex((item) => item.articleIndices.includes(index))
      if (shelf === currentShelfIndex.value) {
        goToIndex(index)
      } else {
        goToShelf(shelf, index)
      }
    }
  }

  const input = useArchiveInput({
    stage,
    available: () => controlsAvailable.value,
    move(delta) {
      navigation.moveBy(delta)
      sceneFrame.hovered = false
      if (delta !== 0) {
        hitVisible.value = false
      }
      requestDraw()
    },
    release(velocity) {
      navigation.release(velocity)
      requestDraw()
    },
    hover(x, y) {
      setHovered(Boolean(activeHitRect && x >= activeHitRect.left && x <= activeHitRect.right
        && y >= activeHitRect.top && y <= activeHitRect.bottom))
    },
    activate: () => activateCurrent(),
    navigate(key) {
      if (key === 'arrowleft' || key === 'a') {
        goInShelf(-1)
      } else if (key === 'arrowright' || key === 'd') {
        goInShelf(1)
      } else if (key === 'arrowup' || key === 'w') {
        goToShelf(currentShelfIndex.value - 1)
      } else if (key === 'arrowdown' || key === 's') {
        goToShelf(currentShelfIndex.value + 1)
      } else if (key === 'home') {
        goToIndex(sceneFrame.firstIndex)
      } else if (key === 'end') {
        goToIndex(sceneFrame.lastIndex)
      } else if (key === 'escape') {
        navigation.deselect()
        requestDraw()
      }
    },
  })

  const useFallback = (reason: string) => {
    ready.value = false
    hitVisible.value = false
    fallbackReason.value = reason
    events.mode('fallback')
  }

  const resize = () => {
    engine?.resize()
    requestDraw()
  }

  const teardown = () => {
    input.cancel()
    cancelAnimationFrame(animationFrame)
    animationFrame = 0
    resizeObserver?.disconnect()
    resizeObserver = null
    window.removeEventListener('keydown', input.onKeydown)
    window.removeEventListener('blur', onBlur)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    canvas.value?.removeEventListener('webglcontextlost', onContextLost)
    selectionTween?.resolve()
    selectionTween = null
    document.documentElement.classList.remove('archive-scene-active')
    engine?.destroy()
    engine = null
  }
  const onContextLost = () => {
    teardown()
    useFallback('context-lost')
  }
  const onBlur = () => {
    input.cancel()
    navigation.release(0)
    requestDraw()
  }
  const onVisibilityChange = () => {
    if (document.hidden) {
      onBlur()
      cancelAnimationFrame(animationFrame)
      animationFrame = 0
      lastFrameTime = 0
    } else {
      requestDraw()
    }
  }

  onMounted(async () => {
    await nextTick()
    if (!stage.value || !canvas.value || !props.articles.length) {
      useFallback('missing-content-or-stage')
      return
    }
    const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number }
    if (matchMedia('(prefers-reduced-motion: reduce)').matches
      || matchMedia('(forced-colors: active)').matches || nav.connection?.saveData) {
      useFallback('preference-or-save-data')
      return
    }
    const context = canvas.value.getContext('webgl2', {
      alpha: false, antialias: true, depth: true, stencil: false,
      preserveDrawingBuffer: false, powerPreference: 'low-power', failIfMajorPerformanceCaveat: true,
    })
    if (!context) {
      useFallback('webgl2-unavailable')
      return
    }
    try {
      const { createArchiveScene } = await import('~/lib/archive-scene')
      if (disposed || !stage.value || !canvas.value) {
        context.getExtension('WEBGL_lose_context')?.loseContext()
        return
      }
      const styles = getComputedStyle(stage.value)
      engine = createArchiveScene({
        canvas: canvas.value, context, host: stage.value, articles: props.articles,
        lowPower: (nav.deviceMemory ?? 8) <= 2 || (navigator.hardwareConcurrency || 4) <= 4,
        locale: locale.value, archiveLabel: t('archive'),
        titleFontFamily: styles.getPropertyValue('--font-serif').trim() || 'sans-serif',
        backgroundColor: cssColorToNumber(styles.backgroundColor),
        theme: {
          surface: cssColorToNumber(styles.getPropertyValue('--color-surface')),
          subtle: cssColorToNumber(styles.getPropertyValue('--color-subtle')),
          heading: cssColorToNumber(styles.getPropertyValue('--color-heading')),
          muted: cssColorToNumber(styles.getPropertyValue('--color-muted')),
          border: cssColorToNumber(styles.getPropertyValue('--color-border')),
        },
      })
      void document.fonts.ready.then(() => {
        engine?.refreshTypography()
        requestDraw()
      })
    } catch (error) {
      console.error('[archive] scene initialization failed', error)
      context.getExtension('WEBGL_lose_context')?.loseContext()
      useFallback('initialization-failed')
      return
    }
    const initial = Math.min(props.articles.length - 1, Math.max(0, props.initialIndex))
    currentShelfIndex.value = Math.max(0,
      yearShelves.value.findIndex((shelf) => shelf.articleIndices.includes(initial)))
    sceneFrame.firstIndex = currentShelfArticleIndices.value[0]
    sceneFrame.lastIndex = currentShelfArticleIndices.value.at(-1) ?? initial
    navigation.setRange(sceneFrame.firstIndex, sceneFrame.lastIndex, props.returning ? initial : initial - 0.5)
    sceneFrame.selectionProgress = props.returning ? 1 : 0
    opening.value = props.returning
    ready.value = true
    events.mode('webgl')
    await nextTick()
    if (disposed || !engine || !stage.value) {
      return
    }
    engine.resize()
    draw(1)
    resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(stage.value)
    canvas.value?.addEventListener('webglcontextlost', onContextLost, { once: true })
    window.addEventListener('keydown', input.onKeydown)
    window.addEventListener('blur', onBlur)
    document.addEventListener('visibilitychange', onVisibilityChange)
    document.documentElement.classList.add('archive-scene-active')
    events.ready({ getActiveRects, finishReturnPose })
    requestDraw()
  })

  onBeforeUnmount(() => {
    disposed = true
    teardown()
  })

  return {
    stage, canvas, hitTarget, ready, fallbackReason, opening, selectedIndex,
    hitVisible, hitStyle, currentArticle, currentShelfIndex, currentYear,
    currentShelfArticleIndices, currentShelfArticlePosition, controlsAvailable,
    canGoPreviousArticle, canGoNextArticle, hasPreviousShelf, hasNextShelf,
    formattedDate, announcementText, setHovered, goInShelf, goToShelf,
    activateCurrent, activateFromSurface, focusForOpen, finishReturnPose, getActiveRects,
    dragging: input.dragging, onPointerDown: input.onPointerDown,
    onPointerMove: input.onPointerMove, onPointerEnd: input.onPointerEnd, onWheel: input.onWheel,
  }
}

const cssColorToNumber = (value: string) => {
  const probe = document.createElement('canvas')
  probe.width = probe.height = 1
  const context = probe.getContext('2d', { alpha: false })
  if (!context) {
    return 0xfbfcfd
  }
  context.fillStyle = value
  context.fillRect(0, 0, 1, 1)
  const [red, green, blue] = context.getImageData(0, 0, 1, 1).data
  return (red << 16) | (green << 8) | blue
}
