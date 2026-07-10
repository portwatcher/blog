<template>
  <div
    v-show="visible"
    class="archive-transition"
    :data-transition-phase="state.phase"
    aria-hidden="true"
  >
    <div ref="surface" class="archive-transition__surface"></div>

    <div ref="metadata" class="archive-transition__metadata">
      <span class="archive-transition__eyebrow">
        {{ t('archiveScene.transitionRecord', {
          index: record ? String(record.index + 1).padStart(2, '0') : '00',
        }) }}
      </span>
      <time>{{ formattedDate }}</time>
    </div>

    <div class="archive-transition__title-stage">
      <strong ref="sharedTitle" class="archive-transition__title">
        {{ record?.title }}
      </strong>
    </div>
  </div>
</template>

<script setup lang="ts">
import type {
  ArchiveTransitionGeometry,
  ArchiveTransitionLayerController,
} from '~/composables/useArchiveTransition'

const { state } = useArchiveTransition()
const { locale, t } = useI18n()
const surface = ref<HTMLElement | null>(null)
const metadata = ref<HTMLElement | null>(null)
const sharedTitle = ref<HTMLElement | null>(null)
const visible = ref(false)
const record = computed(() => state.value.record)
const formattedDate = computed(() => {
  const value = record.value?.date
  if (!value) return ''

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat(locale.value, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(date)
})

let activeAnimations: Animation[] = []

const reducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

const nextPaint = () => new Promise<void>((resolve) => {
  requestAnimationFrame(() => resolve())
})

const setPageInert = (value: boolean) => {
  const elements = [
    document.getElementById('main-content'),
    document.querySelector<HTMLElement>('.site-header'),
    document.querySelector<HTMLElement>('.skip-link'),
  ]
  elements.forEach((element) => {
    if (element) element.inert = value
  })
}

const cancelAnimations = () => {
  activeAnimations.forEach((animation) => animation.cancel())
  activeAnimations = []
}

const animateElement = async (
  element: HTMLElement | null,
  keyframes: Keyframe[],
  duration: number,
) => {
  if (!element) return false

  const animation = element.animate(keyframes, {
    duration: reducedMotion() ? 1 : duration,
    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    fill: 'both',
  })
  activeAnimations.push(animation)

  try {
    await animation.finished
    const finalFrame = keyframes[keyframes.length - 1]
    if (typeof finalFrame?.transform === 'string') {
      element.style.transform = finalFrame.transform
    }
    if (finalFrame?.opacity !== undefined) {
      element.style.opacity = String(finalFrame.opacity)
    }
    animation.cancel()
    return true
  } catch {
    return false
  } finally {
    activeAnimations = activeAnimations.filter((item) => item !== animation)
  }
}

const surfaceTransform = (rect: DOMRectReadOnly) => {
  const element = surface.value
  const width = Math.max(1, element?.clientWidth || window.innerWidth)
  const height = Math.max(1, element?.clientHeight || window.innerHeight)
  const scaleX = Math.max(0.001, rect.width / width)
  const scaleY = Math.max(0.001, rect.height / height)

  return `translate3d(${rect.left}px, ${rect.top}px, 0) scale(${scaleX}, ${scaleY})`
}

const titleTransform = (rect: DOMRectReadOnly) => {
  const element = sharedTitle.value
  if (!element || rect.width <= 0 || rect.height <= 0) return 'none'

  element.style.transform = 'none'
  const base = element.getBoundingClientRect()
  if (base.width <= 0 || base.height <= 0) return 'none'

  const scale = Math.max(0.001, Math.min(
    rect.width / base.width,
    rect.height / base.height,
  ))
  const scaledWidth = base.width * scale
  const scaledHeight = base.height * scale
  const left = rect.left + (rect.width - scaledWidth) / 2
  const top = rect.top + (rect.height - scaledHeight) / 2

  return `translate3d(${left - base.left}px, ${top - base.top}px, 0) scale(${scale})`
}

const visibleTitleRect = (rect: DOMRectReadOnly) => {
  if (rect.bottom < 0 || rect.top > window.innerHeight) {
    return sharedTitle.value?.getBoundingClientRect() || rect
  }
  return rect
}

const prepare = async () => {
  cancelAnimations()
  setPageInert(true)
  visible.value = true
  await nextTick()

  if (surface.value) {
    surface.value.style.opacity = '1'
    surface.value.style.transform = 'none'
  }
  if (sharedTitle.value) {
    sharedTitle.value.style.opacity = '1'
    sharedTitle.value.style.transform = 'none'
  }
  if (metadata.value) metadata.value.style.opacity = '1'
}

const controller: ArchiveTransitionLayerController = {
  async coverFrom(geometry: ArchiveTransitionGeometry) {
    await prepare()

    const fromSurface = surfaceTransform(geometry.surfaceRect)
    const fromTitle = titleTransform(geometry.titleRect)
    await Promise.all([
      animateElement(surface.value, [
        { transform: fromSurface, opacity: 1 },
        { transform: 'none', opacity: 1 },
      ], 460),
      animateElement(sharedTitle.value, [
        { transform: fromTitle, opacity: 1 },
        { transform: 'none', opacity: 1 },
      ], 430),
      animateElement(metadata.value, [
        { opacity: 0, offset: 0 },
        { opacity: 0, offset: 0.35 },
        { opacity: 1, offset: 1 },
      ], 420),
    ])

    if (surface.value) surface.value.style.transform = 'none'
    if (sharedTitle.value) sharedTitle.value.style.transform = 'none'
  },

  async reveal(
    titleRect: DOMRectReadOnly,
    onTitleReady?: () => void,
  ) {
    await nextTick()
    const element = sharedTitle.value
    if (!surface.value || !element || !visible.value) {
      onTitleReady?.()
      setPageInert(false)
      return
    }

    cancelAnimations()
    element.style.transform = 'none'
    const toTitle = titleTransform(visibleTitleRect(titleRect))
    await Promise.all([
      animateElement(surface.value, [
        { opacity: 1 },
        { opacity: 1, offset: 0.18 },
        { opacity: 0 },
      ], 360),
      animateElement(element, [
        { transform: 'none', opacity: 1 },
        { transform: toTitle, opacity: 1 },
      ], 350),
      animateElement(metadata.value, [
        { opacity: 1 },
        { opacity: 0, offset: 0.55 },
        { opacity: 0 },
      ], 240),
    ])

    onTitleReady?.()
    await nextTick()
    await nextPaint()
    visible.value = false
    setPageInert(false)
    element.style.transform = 'none'
    surface.value.style.opacity = '1'
  },

  async coverFull(
    titleRect: DOMRectReadOnly,
    onTitleReady?: () => void,
  ) {
    await prepare()

    const element = sharedTitle.value
    const fromTitle = titleTransform(visibleTitleRect(titleRect))
    if (surface.value) surface.value.style.opacity = '0'
    if (element) element.style.transform = fromTitle
    if (metadata.value) metadata.value.style.opacity = '0'
    await nextPaint()
    onTitleReady?.()
    await nextTick()
    await Promise.all([
      animateElement(surface.value, [
        { opacity: 0 },
        { opacity: 1 },
      ], 300),
      animateElement(element, [
        { transform: fromTitle, opacity: 1 },
        { transform: 'none', opacity: 1 },
      ], 320),
      animateElement(metadata.value, [
        { opacity: 0 },
        { opacity: 1 },
      ], 260),
    ])

    if (element) element.style.transform = 'none'
  },

  async shrinkTo(geometry: ArchiveTransitionGeometry) {
    if (!visible.value) await prepare()
    cancelAnimations()

    const toSurface = surfaceTransform(geometry.surfaceRect)
    const toTitle = titleTransform(geometry.titleRect)
    await Promise.all([
      animateElement(surface.value, [
        { transform: 'none', opacity: 1 },
        { transform: toSurface, opacity: 1 },
      ], 440),
      animateElement(sharedTitle.value, [
        { transform: 'none', opacity: 1 },
        { transform: toTitle, opacity: 1 },
      ], 420),
      animateElement(metadata.value, [
        { opacity: 1 },
        { opacity: 0, offset: 0.65 },
        { opacity: 0 },
      ], 300),
    ])

    visible.value = false
    setPageInert(false)
    if (surface.value) surface.value.style.transform = 'none'
    if (sharedTitle.value) sharedTitle.value.style.transform = 'none'
  },

  reset() {
    cancelAnimations()
    visible.value = false
    setPageInert(false)
    if (surface.value) {
      surface.value.style.opacity = '1'
      surface.value.style.transform = 'none'
    }
    if (sharedTitle.value) {
      sharedTitle.value.style.opacity = '1'
      sharedTitle.value.style.transform = 'none'
    }
    if (metadata.value) metadata.value.style.opacity = '1'
  },
}

let unregister: (() => void) | undefined

onMounted(() => {
  unregister = registerArchiveTransitionLayer(controller)
})

onBeforeUnmount(() => {
  cancelAnimations()
  setPageInert(false)
  unregister?.()
})
</script>

<style scoped>
.archive-transition {
  position: fixed;
  inset: 0;
  z-index: 2000;
  width: 100vw;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  color: var(--color-heading);
  contain: strict;
  pointer-events: auto;
}

.archive-transition__surface,
.archive-transition__metadata,
.archive-transition__title-stage {
  position: absolute;
  inset: 0;
}

.archive-transition__surface {
  border: 1px solid var(--color-soft-border);
  box-sizing: border-box;
  background: var(--color-surface);
  transform-origin: 0 0;
}

.archive-transition__metadata,
.archive-transition__title-stage {
  display: grid;
  place-items: center;
  pointer-events: none;
}

.archive-transition__metadata > * {
  grid-area: 1 / 1;
}

.archive-transition__eyebrow,
.archive-transition time {
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.archive-transition__eyebrow {
  transform: translateY(-6.75rem);
}

.archive-transition time {
  transform: translateY(6.75rem);
}

.archive-transition__title {
  display: block;
  width: max-content;
  max-width: min(calc(100vw - 2rem), 44rem);
  margin: 0;
  color: var(--color-heading);
  font-family: var(--font-serif);
  font-size: clamp(2rem, 1.72rem + 1.15vw, 2.75rem);
  font-weight: 720;
  line-height: 1.2;
  overflow-wrap: anywhere;
  text-align: center;
  text-wrap: balance;
  transform-origin: 0 0;
}

@media (max-width: 40rem) {
  .archive-transition__eyebrow {
    transform: translateY(-6rem);
  }

  .archive-transition time {
    transform: translateY(6rem);
  }

  .archive-transition__title {
    font-size: 1.9rem;
    text-align: left;
  }
}

@media (prefers-reduced-motion: reduce) {
  .archive-transition__metadata {
    display: none;
  }
}
</style>
