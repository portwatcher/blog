<template>
  <div
    v-show="visible"
    ref="surface"
    class="archive-transition"
    :data-transition-phase="state.phase"
    aria-hidden="true"
  >
    <div class="archive-transition__label">
      <span class="archive-transition__eyebrow">
        {{ t('archiveScene.transitionRecord', {
          index: record ? String(record.index + 1).padStart(2, '0') : '00',
        }) }}
      </span>
      <strong>{{ record?.title }}</strong>
      <time>{{ formattedDate }}</time>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ArchiveTransitionLayerController } from '~/composables/useArchiveTransition'

const { state } = useArchiveTransition()
const { locale, t } = useI18n()
const surface = ref<HTMLElement | null>(null)
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

let activeAnimation: Animation | null = null

const reducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

const animateSurface = async (
  keyframes: Keyframe[],
  duration: number,
) => {
  const element = surface.value
  if (!element) return

  activeAnimation?.cancel()
  activeAnimation = element.animate(keyframes, {
    duration: reducedMotion() ? 1 : duration,
    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    fill: 'both',
  })

  try {
    await activeAnimation.finished
  } catch {
    // A newer route transition replaced this animation.
  }
}

const rectTransform = (rect: DOMRectReadOnly) => {
  const element = surface.value
  const width = Math.max(1, element?.clientWidth || window.innerWidth)
  const height = Math.max(1, element?.clientHeight || window.innerHeight)
  const scaleX = Math.max(0.001, rect.width / width)
  const scaleY = Math.max(0.001, rect.height / height)

  return `translate3d(${rect.left}px, ${rect.top}px, 0) scale(${scaleX}, ${scaleY})`
}

const controller: ArchiveTransitionLayerController = {
  async coverFrom(rect) {
    visible.value = true
    await nextTick()

    const element = surface.value
    if (!element) return

    const from = rectTransform(rect)
    element.style.opacity = '1'
    element.style.transform = 'none'
    await animateSurface([
      { transform: from, opacity: 1 },
      { transform: 'none', opacity: 1 },
    ], 440)
  },

  async reveal() {
    const element = surface.value
    if (!element || !visible.value) return

    element.style.opacity = '0'
    element.style.transform = 'none'
    await animateSurface([
      { transform: 'none', opacity: 1 },
      { transform: 'none', opacity: 0 },
    ], 220)
    visible.value = false
    element.style.opacity = '1'
  },

  async coverFull() {
    visible.value = true
    await nextTick()

    const element = surface.value
    if (!element) return

    element.style.opacity = '1'
    element.style.transform = 'none'
    await animateSurface([
      { transform: 'none', opacity: 0 },
      { transform: 'none', opacity: 1 },
    ], 180)
  },

  async shrinkTo(rect) {
    const element = surface.value
    if (!element) return

    visible.value = true
    await nextTick()
    const to = rectTransform(rect)
    element.style.opacity = '1'
    element.style.transform = to
    await animateSurface([
      { transform: 'none', opacity: 1 },
      { transform: to, opacity: 1 },
    ], 400)
    visible.value = false
    element.style.transform = 'none'
  },

  reset() {
    activeAnimation?.cancel()
    activeAnimation = null
    visible.value = false
    if (surface.value) {
      surface.value.style.opacity = '1'
      surface.value.style.transform = 'none'
    }
  },
}

let unregister: (() => void) | undefined

onMounted(() => {
  unregister = registerArchiveTransitionLayer(controller)
})

onBeforeUnmount(() => {
  activeAnimation?.cancel()
  unregister?.()
})
</script>

<style scoped>
.archive-transition {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: grid;
  place-items: center;
  width: 100vw;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  box-sizing: border-box;
  background: var(--color-surface);
  color: var(--color-heading);
  transform-origin: 0 0;
  contain: strict;
  pointer-events: auto;
}

.archive-transition__label {
  display: flex;
  width: min(76vw, 42rem);
  align-items: center;
  flex-direction: column;
  gap: 1.25rem;
  text-align: center;
}

.archive-transition__eyebrow,
.archive-transition time {
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.archive-transition strong {
  font-family: var(--font-sans);
  font-size: clamp(2rem, 5vw, 4.5rem);
  font-weight: 650;
  line-height: 1.08;
  text-wrap: balance;
}

@media (prefers-reduced-motion: reduce) {
  .archive-transition__label {
    gap: 0.75rem;
  }
}
</style>
