<template>
  <section
    class="archive"
    :class="{
      'archive--3d': archiveView === '3d',
      'archive--webgl': sceneActive,
    }"
    aria-labelledby="archive-title"
  >
    <h1 id="archive-title" class="archive__title">{{ t('archive') }}</h1>

    <div
      class="archive__view-switch"
      role="group"
      :aria-label="t('archiveView.label')"
    >
      <button
        type="button"
        :aria-label="t('archiveView.list')"
        :title="t('archiveView.list')"
        :aria-pressed="archiveView === 'list'"
        @click="archiveView = 'list'"
      >
        <ListIcon aria-hidden="true" />
      </button>
      <button
        type="button"
        :aria-label="t('archiveView.threeD')"
        :title="t('archiveView.threeD')"
        :aria-pressed="archiveView === '3d'"
        @click="archiveView = '3d'"
      >
        <ListIcon class="archive__view-icon--3d" aria-hidden="true" />
      </button>
    </div>

    <div v-if="articles.length" class="archive__track" :style="trackStyle">
      <ArchiveScene
        v-if="archiveView === '3d'"
        :articles="articles"
        :initial-index="initialIndex"
        :returning="returning"
        @activate="openArticle"
        @mode="setSceneMode"
        @ready="onSceneReady"
      />

      <div
        class="archive__list"
        :aria-label="t('archiveScene.articleList')"
        :aria-hidden="sceneActive ? 'true' : undefined"
        :inert="sceneActive"
      >
        <section
          v-for="[year, yearArticles] in yearGroups"
          :key="year"
          class="archive__year"
        >
          <h2>{{ year }}</h2>
          <SummaryTitleList :articles="yearArticles" />
        </section>
      </div>
    </div>

    <p v-else class="archive__empty">{{ t('archiveScene.empty') }}</p>
  </section>
</template>

<script setup lang="ts">
import { List as ListIcon } from 'lucide-vue-next'
import type { ArchiveSceneRects } from '~/lib/archive-scene'

type ArchiveView = 'list' | '3d'

const config = useRuntimeConfig()
const { locale, t } = useI18n()
const router = useRouter()
const route = useRoute()
const archiveTransition = useArchiveTransition()

interface ArchiveSceneController {
  focusForOpen: () => Promise<ArchiveSceneRects>
  finishReturnPose: () => Promise<void>
}

interface ArchiveReturnController {
  getActiveRects: () => ArchiveSceneRects
  finishReturnPose: () => Promise<void>
}

let openOperation = 0
let expectedDestination: string | null = null
let activeOpenController: ArchiveSceneController | null = null
let activeOpenGeometry: ArchiveSceneRects | undefined
let returnController: ArchiveReturnController | null = null
let returnOperation = 0

const { data } = await useFetch<Article[]>('/api/articles', {
  query: computed(() => ({
    only: ['title', 'date', '_dir', 'originalTitle'],
    lang: locale.value,
  })),
})

const articles = computed(() => data.value || [])
const sceneMode = ref<'pending' | 'webgl' | 'fallback'>('pending')
const archiveView = useRouteQueryState<ArchiveView>({
  key: 'view',
  defaultValue: 'list',
  parse(value, defaultValue) {
    return value === 'list' || value === '3d' ? value : defaultValue
  },
  serialize(value) {
    return value
  },
})
const sceneActive = computed(() =>
  archiveView.value === '3d' && sceneMode.value === 'webgl',
)
const yearGroups = computed(() => {
  const groups: YearGroupMap = new Map()

  articles.value.forEach((article) => {
    const year = new Date(article.date).getFullYear()
    if (Number.isNaN(year)) return

    const group = groups.get(year)
    if (group) {
      group.push(article)
    } else {
      groups.set(year, [article])
    }
  })

  return Array.from(groups.entries())
})

const returning = computed(() =>
  archiveView.value === '3d'
  && ['return-covering', 'returning'].includes(archiveTransition.state.value.phase)
  && Boolean(archiveTransition.state.value.record),
)
const initialIndex = computed(() => {
  const index = returning.value
    ? archiveTransition.state.value.record?.index
    : 0
  return Math.min(
    Math.max(0, Number(index) || 0),
    Math.max(0, articles.value.length - 1),
  )
})
const trackStyle = computed(() => ({
  '--archive-scroll-span': `${Math.max(0, yearGroups.value.length - 1) * 320}px`,
}))

const articleLocation = (article: Article) => ({
  name: 'articles-title',
  params: { title: getArticleRouteTitle(article) },
  state: { archiveOrigin: '/archive' },
})

const setSceneMode = async (mode: 'webgl' | 'fallback') => {
  sceneMode.value = mode
  if (mode === 'fallback' && returning.value) {
    await archiveTransition.cancel()
  }
}

const finishReturn = async () => {
  if (
    route.path !== '/archive'
    || archiveTransition.state.value.phase !== 'returning'
    || !returnController
  ) return

  const operation = ++returnOperation
  const controller = returnController
  returnController = null

  const geometry = controller.getActiveRects()
  const revealed = await archiveTransition.revealShelf(geometry)
  if (!revealed || operation !== returnOperation || route.path !== '/archive') return

  await controller.finishReturnPose()
  if (operation !== returnOperation || route.path !== '/archive') return
  archiveTransition.completeReturn()
}

const onSceneReady = (controller: ArchiveReturnController) => {
  if (!returning.value) return

  returnController = controller
  void finishReturn()
}

watch(
  () => archiveTransition.state.value.phase,
  (phase) => {
    if (phase === 'returning') void finishReturn()
  },
)

watch(archiveView, async (view) => {
  ++openOperation
  ++returnOperation
  activeOpenController = null
  activeOpenGeometry = undefined
  expectedDestination = null
  returnController = null
  sceneMode.value = 'pending'

  if (import.meta.client) {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }

  if (
    view === 'list'
    && archiveTransition.state.value.phase !== 'idle'
  ) {
    await archiveTransition.cancel()
  }
})

onMounted(() => {
  if (
    archiveView.value === 'list'
    && archiveTransition.state.value.phase !== 'idle'
  ) {
    void archiveTransition.cancel()
  }
})

const openArticle = async (
  article: Article,
  index: number,
  controller: ArchiveSceneController,
) => {
  const operation = ++openOperation
  const routeTitle = getArticleRouteTitle(article)
  const destination = router.resolve(articleLocation(article)).fullPath
  activeOpenController = controller
  activeOpenGeometry = undefined
  expectedDestination = null
  const record: ArchiveTransitionRecord = {
    title: article.title,
    routeTitle,
    date: article.date,
    index,
    count: articles.value.length,
  }

  void primeArchiveArticle(routeTitle)
  try {
    void preloadRouteComponents(destination).catch(() => undefined)
  } catch {
    // Preloading is opportunistic; navigation remains fully functional without it.
  }

  let geometry: ArchiveSceneRects | undefined
  try {
    geometry = await controller.focusForOpen()
    if (operation !== openOperation || route.path !== '/archive') return
    activeOpenGeometry = geometry
    await archiveTransition.coverFromShelf(record, geometry)
    if (operation !== openOperation || route.path !== '/archive') return
    expectedDestination = destination
    await router.push(articleLocation(article))
    const currentRoute = router.currentRoute.value
    const currentRouteTitle = String(
      Array.isArray(currentRoute.params.title)
        ? currentRoute.params.title[0] || ''
        : currentRoute.params.title || '',
    )
    if (
      operation === openOperation
      && (
        currentRoute.name !== 'articles-title'
        || currentRouteTitle !== routeTitle
      )
    ) {
      throw new Error('Article navigation did not reach its destination')
    }
  } catch (error) {
    if (operation !== openOperation) return
    console.error('[archive] article transition failed', error)
    await archiveTransition.cancel(geometry)
    await controller.finishReturnPose()
  } finally {
    if (operation === openOperation) {
      activeOpenController = null
      activeOpenGeometry = undefined
      expectedDestination = null
    }
  }
}

onBeforeRouteLeave(async (to) => {
  ++returnOperation
  returnController = null
  if (expectedDestination && to.fullPath === expectedDestination) return
  if (!activeOpenController) return

  ++openOperation
  const controller = activeOpenController
  const geometry = activeOpenGeometry
  activeOpenController = null
  activeOpenGeometry = undefined
  expectedDestination = null
  await archiveTransition.cancel(geometry)
  await controller.finishReturnPose()
})

useSeoMeta({
  title: () => t('archive'),
  ogUrl: new URL('/archive', config.public.host).toString(),
  twitterCard: 'summary',
})
</script>

<style scoped>
.archive {
  width: 100%;
  min-height: calc(100vh - var(--site-header-height, 47px));
  min-height: calc(100svh - var(--site-header-height, 47px));
  background: var(--color-surface);
  color: var(--color-text);
}

.archive__title {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  font-family: var(--font-sans);
  white-space: nowrap;
}

.archive__view-switch {
  position: fixed;
  top: calc(var(--site-header-height, 47px) + env(safe-area-inset-top) + 0.75rem);
  left: max(1rem, env(safe-area-inset-left));
  z-index: 30;
  display: grid;
  grid-template-columns: repeat(2, 2rem);
  border: 1px solid var(--color-border);
  border-radius: 0.3rem;
  overflow: hidden;
  background: var(--color-surface);
  color: var(--color-muted);
}

.archive__view-switch button {
  display: grid;
  width: 2rem;
  height: 2rem;
  border: 0;
  padding: 0;
  place-items: center;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.archive__view-switch button + button {
  border-left: 1px solid var(--color-border);
}

.archive__view-switch button:hover:not([aria-pressed='true']) {
  background: var(--color-subtle);
  color: var(--color-heading);
}

.archive__view-switch button[aria-pressed='true'] {
  background: var(--color-muted);
  color: var(--color-surface);
}

.archive__view-switch button:focus-visible {
  position: relative;
  z-index: 1;
  outline: 2px solid var(--color-heading);
  outline-offset: -3px;
}

.archive__view-switch svg {
  width: 1rem;
  height: 1rem;
  stroke-width: 1.75;
}

.archive__view-icon--3d {
  transform: rotate(90deg);
  transform-origin: center;
}

.archive__track {
  position: relative;
  width: 100%;
}

.archive--webgl .archive__track {
  min-height: calc(100vh + var(--archive-scroll-span, 0px));
  min-height: calc(100svh + var(--archive-scroll-span, 0px));
}

.archive--3d:not(.archive--webgl) :deep(.archive-scene) {
  position: absolute;
  width: 1px;
  height: 1px;
  min-height: 0;
  overflow: hidden;
  pointer-events: none;
}

.archive__list {
  width: 100%;
  max-width: 64rem;
  margin: 0 auto;
  padding: var(--site-header-height, 47px) 1rem 6rem;
  box-sizing: border-box;
}

.archive__year h2 {
  width: 100%;
  margin: 4em 0;
  font-size: 2em;
  text-align: center;
}

.archive--webgl .archive__list {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  margin: -1px;
  padding: 0;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}

.archive__empty {
  display: grid;
  min-height: calc(100vh - var(--site-header-height, 47px));
  min-height: calc(100svh - var(--site-header-height, 47px));
  margin: 0;
  padding: 2rem;
  box-sizing: border-box;
  place-items: center;
  color: var(--color-muted);
}

@media print {
  .archive__view-switch,
  :deep(.archive-scene) {
    display: none;
  }

  .archive--webgl .archive__list {
    position: static;
    width: 100%;
    height: auto;
    overflow: visible;
    margin: 0 auto;
    padding: 0;
    clip: auto;
    clip-path: none;
    white-space: normal;
  }
}
</style>
