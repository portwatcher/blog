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
    @wheel="onWheel"
    @click="activateFromSurface"
  >
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
        <span>{{ selectedIndex === null ? '—' : String(currentShelfArticlePosition + 1).padStart(2, '0') }} / {{ String(currentShelfArticleIndices.length).padStart(2, '0') }}</span>
      </div>
      <span class="archive-scene__hint" aria-hidden="true">{{ t('archiveScene.hint') }}</span>
    </div>

    <p class="archive-scene__announcement" aria-live="polite">
      {{ announcementText }}
    </p>
  </div>
</template>

<script setup lang="ts">
import type { ArchiveOpenController, ArchiveReturnController } from '~/composables/useArchiveScene'

const props = withDefaults(defineProps<{
  articles: Article[]
  initialIndex?: number
  returning?: boolean
}>(), { initialIndex: 0, returning: false })
const emit = defineEmits<{
  activate: [article: Article, index: number, controller: ArchiveOpenController]
  mode: [mode: 'webgl' | 'fallback']
  ready: [controller: ArchiveReturnController]
}>()
const { t } = useI18n()
const {
  stage, canvas, hitTarget, ready, fallbackReason, opening, selectedIndex,
  hitVisible, hitStyle, currentArticle, currentShelfIndex, currentYear,
  currentShelfArticleIndices, currentShelfArticlePosition, controlsAvailable,
  canGoPreviousArticle, canGoNextArticle, hasPreviousShelf, hasNextShelf,
  formattedDate, announcementText, setHovered, goInShelf, goToShelf,
  activateCurrent, activateFromSurface, focusForOpen, finishReturnPose, getActiveRects,
  dragging, onPointerDown, onPointerMove, onPointerEnd, onWheel,
} = useArchiveScene(props, {
  activate: (...args) => emit('activate', ...args),
  mode: (mode) => emit('mode', mode),
  ready: (controller) => emit('ready', controller),
})
defineExpose({ focusForOpen, finishReturnPose, getActiveRects })
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
  touch-action: pinch-zoom;
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
  touch-action: pinch-zoom;
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
