<template>
  <section
    class="archive"
    :class="`archive--${sceneMode}`"
    aria-labelledby="archive-title"
  >
    <h1 id="archive-title" class="archive__title">{{ t('archive') }}</h1>

    <div v-if="articles.length" class="archive__track" :style="trackStyle">
      <ArchiveScene
        :articles="articles"
        :initial-index="initialIndex"
        :returning="returning"
        @activate="openArticle"
        @mode="setSceneMode"
        @ready="onSceneReady"
      />

      <ol
        class="archive__fallback"
        :aria-label="t('archiveScene.articleList')"
        :aria-hidden="sceneMode === 'webgl' ? 'true' : undefined"
        :inert="sceneMode === 'webgl'"
      >
        <li
          v-for="(article, index) in articles"
          :key="`${getArticleRouteTitle(article)}-${article.date}`"
          class="archive__fallback-item"
        >
          <NuxtLink
            class="archive__fallback-link"
            :to="articleLocation(article)"
          >
            <span class="archive__fallback-index">
              {{ String(index + 1).padStart(2, '0') }} / {{ String(articles.length).padStart(2, '0') }}
            </span>
            <strong>{{ article.title }}</strong>
            <time :datetime="article.date">{{ formatDate(article.date) }}</time>
          </NuxtLink>
        </li>
      </ol>
    </div>

    <p v-else class="archive__empty">{{ t('archiveScene.empty') }}</p>
  </section>
</template>

<script setup lang="ts">
import type { ArchiveSceneRects } from '~/lib/archive-scene'

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

const returning = computed(() =>
  ['return-covering', 'returning'].includes(archiveTransition.state.value.phase)
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
  '--archive-scroll-span': `${Math.max(0, articles.value.length - 1) * 220}px`,
}))

const articleLocation = (article: Article) => ({
  name: 'articles-title',
  params: { title: getArticleRouteTitle(article) },
  state: { archiveOrigin: '/archive' },
})

const formatDate = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat(locale.value, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(date)
}

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

.archive__track {
  position: relative;
  width: 100%;
}

.archive--webgl .archive__track {
  min-height: calc(100vh + var(--archive-scroll-span, 0px));
  min-height: calc(100svh + var(--archive-scroll-span, 0px));
}

.archive:not(.archive--webgl) :deep(.archive-scene) {
  position: absolute;
  width: 1px;
  height: 1px;
  min-height: 0;
  overflow: hidden;
  pointer-events: none;
}

.archive__fallback {
  display: grid;
  width: min(100%, 78rem);
  margin: 0 auto;
  padding: clamp(4rem, 10vw, 8rem) clamp(1rem, 4vw, 3rem);
  box-sizing: border-box;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr));
  gap: clamp(1rem, 3vw, 2rem);
  list-style: none;
}

.archive__fallback-item {
  min-width: 0;
  content-visibility: auto;
  contain-intrinsic-size: 19rem 14rem;
}

.archive__fallback-link {
  display: grid;
  min-height: 17rem;
  border: 1px solid var(--color-border);
  padding: 1.25rem;
  box-sizing: border-box;
  background: var(--color-subtle);
  color: var(--color-text);
  grid-template-rows: auto 1fr auto;
  gap: 1.5rem;
  transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1),
    background-color 180ms cubic-bezier(0.22, 1, 0.36, 1);
}

.archive__fallback-link:hover {
  background: var(--color-soft-border);
  transform: translateY(-0.25rem);
}

.archive__fallback-link:focus-visible {
  outline: 2px solid var(--color-heading);
  outline-offset: 4px;
}

.archive__fallback-link strong {
  align-self: center;
  font-family: var(--font-sans);
  font-size: clamp(1.25rem, 1rem + 1vw, 1.8rem);
  font-weight: 650;
  line-height: 1.22;
  overflow-wrap: anywhere;
  text-wrap: balance;
}

.archive__fallback-index,
.archive__fallback-link time {
  font-size: 0.6875rem;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.archive--webgl .archive__fallback {
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

@media (prefers-reduced-motion: reduce) {
  .archive__fallback-link {
    transition: none;
  }

  .archive__fallback-link:hover {
    transform: none;
  }
}

@media print {
  .archive__fallback {
    grid-template-columns: repeat(2, 1fr);
    padding: 1rem 0;
  }

  .archive__fallback-link {
    min-height: 10rem;
  }
}
</style>
