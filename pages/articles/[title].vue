<template>
  <div
    v-if="article"
    class="post"
    :lang="languageBase(activeLang)"
  >
    <header class="article-header">
      <h1
        ref="articleTitle"
        class="title"
        tabindex="-1"
      >
        <span
          ref="articleTitleText"
          class="article-title-text"
          :class="{ 'article-title-text--transition-owned': titleOwnedByTransition }"
        >
          {{ article.title }}
        </span>
      </h1>

      <nav
        v-if="languageTabs.length > 1"
        class="language-tabs"
        aria-label="Article language"
        role="tablist"
      >
        <NuxtLink
          v-for="tab in languageTabs"
          :key="tab.lang"
          class="language-tab"
          :to="tab.to"
          replace
          :class="{ active: tab.active }"
          :aria-selected="tab.active"
          role="tab"
        >
          {{ tab.label }}
        </NuxtLink>
      </nav>
    </header>

    <ContentRenderer
      v-if="article.status === 'public' || article.authenticated"
      class="markdown"
      :value="article"
    />
    <div
      v-else
      class="password-form"
    >
      <input
        v-model="password"
        type="text"
        placeholder="input password"
      >
      <button @click="unlock">unlock</button>
    </div>

    <div class="date">
      @{{ article.date }}
    </div>

    <Comment
      :key="commentDiscussionTerm"
      :discussion-term="commentDiscussionTerm"
    ></Comment>
  </div>
  <NotFound v-else></NotFound>
</template>

<script setup lang="ts">
// Language tabs only change the query string, so key the page by fullPath to
// keep Nuxt's page-loading lifecycle aligned with the article fetch.
definePageMeta({
  key: (route) => route.fullPath,
})

const route = useRoute()
const config = useRuntimeConfig()
const archiveTransition = useArchiveTransition()
const password = ref<string | null>(null)
const article = ref<Article | null>(null)
const articleTitle = ref<HTMLElement | null>(null)
const articleTitleText = ref<HTMLElement | null>(null)
const titleOwnedByTransition = ref(false)
const languageLabels: Record<string, string> = {
  zh: '中文',
  en: 'English',
  ja: '日本語',
}

const getRouteTitle = (value: unknown) =>
  String(Array.isArray(value) ? value[0] || '' : value || '')
const archivePath = '/archive'
const isArchiveHistoryPath = (value: unknown) => {
  if (!value || !import.meta.client) return false

  try {
    return new URL(String(value), window.location.origin).pathname === archivePath
  } catch {
    return false
  }
}
let openedFromArchive = Boolean(
  archiveTransition.state.value.record?.routeTitle === getRouteTitle(route.params.title),
)

const ensureArchiveReturnEntry = () => {
  if (!import.meta.client || !openedFromArchive) return

  const currentState = window.history.state || {}
  if (isArchiveHistoryPath(currentState.back)) return

  const currentPath = route.fullPath
  const currentPosition = Number.isFinite(Number(currentState.position))
    ? Number(currentState.position)
    : Math.max(0, window.history.length - 1)
  const archiveState: Record<string, unknown> = {
    ...currentState,
    back: currentState.back ?? null,
    current: archivePath,
    forward: currentPath,
    replaced: true,
    position: currentPosition,
    scroll: currentState.scroll ?? null,
  }
  delete archiveState.archiveOrigin

  window.history.replaceState(archiveState, '', archivePath)
  window.history.pushState({
    ...currentState,
    back: archivePath,
    current: currentPath,
    forward: null,
    replaced: false,
    position: currentPosition + 1,
    scroll: null,
    archiveOrigin: archivePath,
  }, '', currentPath)
}

titleOwnedByTransition.value = Boolean(
  archiveTransition.state.value.record?.routeTitle === getRouteTitle(route.params.title)
  && ['opening', 'covered'].includes(archiveTransition.state.value.phase),
)

const configuredTranslationLanguages = computed(() =>
  String(config.public.translationLanguages || 'zh,en,ja')
    .split(',')
    .map((lang) => lang.trim())
    .filter(Boolean),
)

const currentLang = computed(() => String(route.query.lang || ''))
const sourceLang = computed(() => String(article.value?.sourceLang || config.public.originalLanguage || 'zh'))
const availableTranslations = computed(() => article.value?.availableTranslations ?? [])
const commentDiscussionTerm = computed(() =>
  String(article.value?.originalTitle || route.params.title || article.value?.title || '').trim(),
)

const getArticleQuery = () => ({
  title: route.params.title,
  lang: currentLang.value || undefined,
  password: password.value || undefined,
})

const normalizeLanguage = (lang: string) => String(lang || '').trim().toLowerCase()
const languageBase = (lang: string) => normalizeLanguage(lang).split('-')[0]
const languagesAlign = (left: string, right: string) => {
  const normalizedLeft = normalizeLanguage(left)
  const normalizedRight = normalizeLanguage(right)

  return normalizedLeft === normalizedRight || languageBase(normalizedLeft) === languageBase(normalizedRight)
}

const getLanguageLabel = (lang: string) => {
  const label = languageLabels[lang] || languageLabels[languageBase(lang)] || lang.toUpperCase()

  return languagesAlign(lang, sourceLang.value) ? `${label}(original)` : label
}

const availableLanguageCodes = computed(() => {
  const codes = [sourceLang.value]

  for (const lang of configuredTranslationLanguages.value) {
    if (languagesAlign(lang, sourceLang.value)) continue
    if (!availableTranslations.value.some((translationLang) => languagesAlign(translationLang, lang))) continue
    if (codes.some((code) => languagesAlign(code, lang))) continue

    codes.push(lang)
  }

  return codes
})

const activeLang = computed(() => {
  const routeLang = currentLang.value
  if (routeLang && availableLanguageCodes.value.some((lang) => languagesAlign(lang, routeLang))) {
    return availableLanguageCodes.value.find((lang) => languagesAlign(lang, routeLang)) || sourceLang.value
  }

  const articleLang = article.value?.lang
  if (articleLang && availableLanguageCodes.value.some((lang) => languagesAlign(lang, articleLang))) {
    return availableLanguageCodes.value.find((lang) => languagesAlign(lang, articleLang)) || sourceLang.value
  }

  return sourceLang.value
})

const languageRoute = (lang: string) => {
  const query = { ...route.query }

  if (languagesAlign(lang, sourceLang.value)) {
    delete query.lang
  } else {
    query.lang = lang
  }

  return {
    path: route.path,
    query,
  }
}

const applyMarkdownImageLayout = async () => {
  if (!import.meta.client) return

  await nextTick()

  document.querySelectorAll<HTMLIFrameElement>('.markdown iframe').forEach((iframe) => {
    const width = Number.parseFloat(iframe.getAttribute('width') || '')
    const height = Number.parseFloat(iframe.getAttribute('height') || '')

    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      iframe.style.setProperty('--markdown-embed-ratio', `${width} / ${height}`)
    }
  })

  document.querySelectorAll<HTMLImageElement>('.markdown img').forEach((image) => {
    const updateImageOrientation = () => {
      image.classList.toggle('markdown-image-tall', image.naturalHeight > image.naturalWidth)
    }

    if (image.complete && image.naturalWidth && image.naturalHeight) {
      updateImageOrientation()
      return
    }

    image.addEventListener('load', updateImageOrientation, { once: true })
  })
}

const loadArticle = async () => {
  const articles = await $fetch<Article[]>('/api/articles', {
    method: 'GET',
    query: getArticleQuery(),
  })

  article.value = articles[0] as Article | null
}

const articleRequestKey = `article:${String(route.params.title)}:${currentLang.value || 'original'}`
const { data: initialArticle } = await useAsyncData<Article | null>(articleRequestKey, async () => {
  if (import.meta.client) {
    const primed = await takePrimedArchiveArticle(
      String(route.params.title),
      currentLang.value || undefined,
    )
    if (primed) return primed
  }

  const articles = await $fetch<Article[]>('/api/articles', {
    method: 'GET',
    query: getArticleQuery(),
  })
  return articles[0] || null
})
watch(initialArticle, (value) => {
  article.value = value ?? null
}, { immediate: true })

const languageTabs = computed(() =>
  availableLanguageCodes.value.map((lang) => ({
    lang,
    label: getLanguageLabel(lang),
    active: languagesAlign(activeLang.value, lang),
    to: languageRoute(lang),
  })),
)

onMounted(async () => {
  const historyState = window.history.state || {}
  openedFromArchive = openedFromArchive || Boolean(
    historyState.archiveOrigin === archivePath
    || isArchiveHistoryPath(historyState.back),
  )
  ensureArchiveReturnEntry()
  void applyMarkdownImageLayout()
  await nextTick()
  const routeTitle = getRouteTitle(route.params.title)
  if (document.fonts?.status !== 'loaded') {
    await Promise.race([
      document.fonts.ready,
      new Promise<void>((resolve) => window.setTimeout(resolve, 160)),
    ])
  }
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  const titleRect = articleTitleText.value?.getBoundingClientRect()
    || articleTitle.value?.getBoundingClientRect()
    || new DOMRect()
  const revealed = await archiveTransition.revealArticle(
    routeTitle,
    titleRect,
    article.value?.title || '',
    () => {
      titleOwnedByTransition.value = false
    },
  )
  if (
    revealed
    && getRouteTitle(route.params.title) === routeTitle
    && archiveTransition.state.value.phase === 'article'
  ) {
    articleTitle.value?.focus({ preventScroll: true })
  }
})

onBeforeRouteLeave((to) => {
  const routeTitle = getRouteTitle(route.params.title)
  if (to.path === archivePath) {
    const titleRect = articleTitleText.value?.getBoundingClientRect()
      || articleTitle.value?.getBoundingClientRect()
      || new DOMRect()
    void archiveTransition.coverArticleForReturn(
      routeTitle,
      titleRect,
      article.value?.title || '',
      () => {
        titleOwnedByTransition.value = true
      },
    ).catch(async (error) => {
      console.error('[archive] return transition failed', error)
      titleOwnedByTransition.value = false
      await archiveTransition.cancel()
    })
    return
  }

  const destinationTitle = getRouteTitle(to.params.title)
  if (!destinationTitle || destinationTitle !== routeTitle) {
    void archiveTransition.cancel()
  }
})

onBeforeRouteUpdate(async (to) => {
  if (getRouteTitle(to.params.title) !== getRouteTitle(route.params.title)) {
    await archiveTransition.cancel()
  }
})

useSeoMeta({
  title: () => article.value?.title,
  description: () => article.value?.description,
  ogDescription: () => article.value?.description,
  ogUrl: () => `${config.public.host}/articles/${route.params.title}`,
  ogTitle: () => article.value?.title,
  twitterCard: 'summary',
})

const unlock = async function () {
  await loadArticle()
}
</script>

<style scoped>
.article-header {
  text-align: center;
  border-bottom: 1px solid var(--color-border);
  margin: 0 0 2.5rem;
  padding-top: 1.25rem;
}

.language-tabs {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin: 0 0 -1px;
  padding: 0 0.25rem;
  font-size: 0.9rem;
  line-height: 1;
}

.language-tab {
  display: inline-flex;
  align-items: center;
  min-height: 2.75rem;
  padding: 0 0.95rem;
  border-bottom: 2px solid transparent;
  color: var(--color-muted);
  text-decoration: none;
}

.language-tab:hover,
.language-tab.active {
  color: var(--color-heading);
}

.language-tab.active {
  border-bottom-color: var(--color-heading);
}

.date {
  color: var(--color-muted);
  font-size: 0.875rem;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  border-top: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
  padding: 1rem 0;
  margin: 3rem 0;
}

@media (max-width: 640px) {
  .article-header {
    text-align: left;
  }

  .language-tabs {
    justify-content: flex-start;
    padding-left: 0;
  }
}
</style>

<style>
.post {
  width: 100%;
  max-width: 44rem;
  min-width: 0;
  margin: 0 auto;
  box-sizing: border-box;
  color: var(--color-text);
  font-family: var(--font-sans);
  font-size: 1.1875rem;
  line-height: 1.92;
  letter-spacing: 0;
  word-spacing: 0.04em;
  overflow-wrap: break-word;
  word-break: normal;
  line-break: loose;
  hanging-punctuation: first allow-end;
}

.markdown {
  font-size: 1em;
}

.markdown :where(p, blockquote, ul, ol, dl, table, pre, details) {
  margin-top: 0;
  margin-bottom: 1.35em;
}

.markdown :where(p, li, blockquote) {
  line-height: inherit;
}

.markdown p {
  overflow-wrap: break-word;
  word-break: normal;
  hyphens: auto;
}

.post .title {
  color: var(--color-heading);
  font-family: var(--font-serif);
  font-size: clamp(2rem, 1.72rem + 1.15vw, 2.75rem);
  font-weight: 720;
  letter-spacing: 0;
  padding: 0.5rem 0 2rem;
  margin: 0;
  text-align: center;
  line-height: 1.2;
  text-wrap: balance;
  overflow-wrap: anywhere;
}

.post .article-title-text {
  display: inline-block;
  max-width: 100%;
}

.post .article-title-text--transition-owned {
  opacity: 0;
}

.markdown p:has(> img),
.markdown p:has(> video) {
  display: block;
  clear: both;
  padding: 1rem 0;
}

.post video {
  margin-left: auto;
  margin-right: auto;
  max-width: 100%;
  max-height: 40rem;
  display: block;
}

.post audio {
  display: block;
  margin-left: auto;
  margin-right: auto;
  margin-top: 1rem;
  margin-bottom: 1rem;
  max-width: 100%;
}

.markdown :where(iframe, object, embed) {
  display: block;
  max-width: 100%;
  box-sizing: border-box;
  margin: 2rem auto;
}

.markdown iframe {
  aspect-ratio: var(--markdown-embed-ratio, 16 / 9);
  height: auto;
}

.markdown img {
  display: block;
  float: none !important;
  clear: both;
  width: 100% !important;
  max-width: 100% !important;
  height: auto !important;
  margin: 2rem auto;
  object-fit: contain;
  border-radius: 0.375rem;
}

.markdown img.markdown-image-tall {
  width: auto !important;
  max-height: 40vh !important;
}

.post code {
  background-color: color-mix(in oklch, var(--color-subtle) 88%, var(--color-border));
  padding: 0.16em 0.36em;
  border-radius: 0.375rem;
  margin: 0;
  font-family: var(--font-mono);
  font-size: 0.9em;
}

.post pre code {
  background-color: inherit;
  padding: 0;
  border-radius: 0;
  font-size: inherit;
}

.markdown pre code:not([class*="language-"]) {
  white-space: pre-wrap;
  overflow-wrap: break-word;
  word-break: normal;
}

.post .content {
  margin: 0 0 3em 0;
}

.post .content .info {
  margin-top: 3.5em;
}

.post .content .info .tags {
  display: inline;
  float: left;
  padding-top: 1em;
}

.post .content .info .tags a {
  padding: 0 10px;
  color: var(--color-muted);
}

.post .content .info .tags a:hover {
  color: var(--color-heading);
}

.post .content .info .date {
  font-size: 0.875rem;
  padding: 1em 0;
  color: var(--color-muted);
  text-align: right;
  border-top: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
}

.markdown a {
  color: inherit;
  text-decoration: none;
}

.markdown :where(p, li, blockquote, td) a {
  color: var(--color-link);
  text-decoration: underline;
  text-decoration-thickness: 0.08em;
  text-underline-offset: 0.18em;
}

.markdown :where(p, li, blockquote, td) a:hover {
  text-decoration-thickness: 0.12em;
}

.markdown :where(h1, h2, h3, h4, h5, h6) a {
  color: inherit;
  text-decoration: none;
}

.markdown .toc {
  line-height: 1.7;
  border: 1px solid var(--color-border);
  border-radius: 0.375rem;
  padding: 1.1rem 1.25rem;
  background: var(--color-subtle);
}

.markdown .toc li ul {
  margin: 0;
  padding-top: 0;
}

.markdown blockquote .p_part p,
.markdown li .p_part p {
  text-indent: 0 !important;
}

.markdown blockquote {
  color: var(--color-muted);
  font-style: normal;
  background-color: var(--color-subtle);
  border: 1px solid var(--color-border);
  border-radius: 0.375rem;
  margin-top: 2rem;
  margin-bottom: 2rem;
  padding: 1.1rem 1.25rem;
  overflow-wrap: break-word;
}

.markdown pre {
  border: 1px solid var(--color-soft-border);
  border-radius: 0.5rem;
  margin-top: 1.25rem;
  margin-bottom: 2rem;
  padding: 1.1rem 1.25rem;
  display: block;
  overflow: auto;
  background: var(--color-subtle);
  font-family: var(--font-mono);
  font-size: 0.95rem;
  line-height: 1.75;
}

.markdown h1 {
  margin: 3.25rem 0 1.35rem;
  padding-bottom: 0.3rem;
  border-bottom: 1px solid var(--color-border);
  color: var(--color-heading);
  font-family: var(--font-serif);
  font-size: 1.75em;
  font-weight: 680;
  line-height: 1.32;
  text-wrap: pretty;
  overflow-wrap: break-word;
}

.markdown h2 {
  margin: 2.85rem 0 1.15rem;
  padding-bottom: 0.25rem;
  border-bottom: 1px solid var(--color-soft-border);
  color: var(--color-heading);
  font-family: var(--font-serif);
  font-size: 1.45em;
  font-weight: 660;
  line-height: 1.36;
  text-wrap: pretty;
  overflow-wrap: break-word;
}

.markdown h3 {
  font-size: 1.2em;
  margin: 2.4rem 0 1rem;
  color: var(--color-heading);
  font-family: var(--font-serif);
  font-weight: 650;
  line-height: 1.42;
  text-wrap: pretty;
  overflow-wrap: break-word;
}

.markdown table {
  display: block;
  width: max-content;
  max-width: 100%;
  overflow: auto;
  border-spacing: 0;
  border-collapse: collapse;
  margin: 2rem 0 2.6rem;
}

.markdown strong,
.markdown b {
  color: var(--color-heading);
  font-weight: 700;
}

.markdown :where(th, td) {
  padding: 0.45rem 0.75rem;
  border: 1px solid var(--color-border);
}

.markdown th {
  font-weight: 650;
  background: var(--color-subtle);
}

.markdown hr {
  height: 1px;
  border: 0;
  background: var(--color-border);
  margin: 3rem 0;
}

.markdown ul,
.markdown ol {
  line-height: inherit;
  padding-left: 1.45em;
  max-width: 100%;
  overflow-x: auto;
}

.markdown li + li {
  margin-top: 0.45rem;
}

.markdown li > :where(p, ul, ol) {
  margin-top: 0.55rem;
  margin-bottom: 0.55rem;
}

@supports (word-break: auto-phrase) {
  .post:lang(zh) {
    word-break: auto-phrase;
  }

  .post:lang(zh) .markdown :where(h1, h2, h3) {
    word-break: auto-phrase;
  }
}

@media (max-width: 640px) {
  .post {
    width: 100%;
    font-size: 1.125rem;
    line-height: 1.9;
    word-spacing: 0.03em;
  }

  .post .title {
    font-size: 1.9rem;
    text-align: left;
  }

  .markdown h1 {
    font-size: 1.55em;
    line-height: 1.38;
  }

  .markdown h2 {
    font-size: 1.32em;
  }

  .markdown h3 {
    font-size: 1.15em;
  }
}
</style>
