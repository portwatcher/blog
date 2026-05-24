<template>
  <div
    v-if="article"
    class="post"
  >
    <header class="article-header">
      <h1 class="title">{{ article.title }}</h1>

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
const route = useRoute()
const router = useRouter()
const config = useRuntimeConfig()
const password = ref<string | null>(null)
const article = ref<Article | null>(null)
const languageLabels: Record<string, string> = {
  zh: '中文',
  en: 'English',
  ja: '日本語',
}

const configuredTranslationLanguages = computed(() =>
  String(config.public.translationLanguages || 'zh,en,ja')
    .split(',')
    .map((lang) => lang.trim())
    .filter(Boolean),
)

const currentLang = computed(() => String(route.query.lang || ''))
const sourceLang = computed(() => String(article.value?.sourceLang || config.public.originalLanguage || 'zh'))
const availableTranslations = computed(() => article.value?.availableTranslations ?? [])
const autoLanguageSelectionAttempted = ref(Boolean(currentLang.value))
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

const getBrowserPreferredLanguage = () => {
  if (!import.meta.client) return ''

  const browserLanguages = navigator.languages?.length
    ? navigator.languages
    : [navigator.language].filter(Boolean)

  for (const browserLanguage of browserLanguages) {
    const match = availableLanguageCodes.value.find((lang) => languagesAlign(lang, browserLanguage))
    if (match) return match
  }

  return ''
}

const applyBrowserLanguagePreference = async () => {
  if (autoLanguageSelectionAttempted.value || currentLang.value || languageTabs.value.length <= 1) {
    return
  }

  autoLanguageSelectionAttempted.value = true
  const preferredLang = getBrowserPreferredLanguage()

  if (!preferredLang || languagesAlign(preferredLang, sourceLang.value)) {
    return
  }

  await router.replace(languageRoute(preferredLang))
}

const loadArticle = async () => {
  const articles = await $fetch<Article[]>('/api/articles', {
    method: 'GET',
    query: getArticleQuery(),
  })

  article.value = articles[0] as Article | null
}

await loadArticle()

const languageTabs = computed(() =>
  availableLanguageCodes.value.map((lang) => ({
    lang,
    label: getLanguageLabel(lang),
    active: languagesAlign(activeLang.value, lang),
    to: languageRoute(lang),
  })),
)

onMounted(() => {
  void applyBrowserLanguagePreference()
})

watch(
  () => [String(route.params.title || ''), String(route.query.lang || '')],
  ([title], [previousTitle]) => {
    if (title !== previousTitle) {
      autoLanguageSelectionAttempted.value = Boolean(currentLang.value)
    }

    void (async () => {
      await loadArticle()
      await applyBrowserLanguagePreference()
    })()
  },
)

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
  border-bottom: 1px solid #eee;
  margin: 1em 0 2.75em;
  padding-top: 0.5em;
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
  color: #777;
  text-decoration: none;
}

.language-tab:hover,
.language-tab.active {
  color: #111;
}

.language-tab.active {
  border-bottom-color: #111;
}

.date {
  color: #999;
  font-size: 90%;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  border-top: 1px solid #eee;
  border-bottom: 1px solid #eee;
  padding: 1em 0;
  margin: 3rem 0;
}
</style>

<style>
.post p {
  line-height: 1.75;
  margin-bottom: 0.6em;
  overflow-x: auto;
}

.post {
  font-size: 19px;
  line-height: 1.8em;
  color: #222;
}

.post .title {
  color: #000;
  font-size: 2.3em;
  padding: 0.5em 0 1.15em 0;
  margin: 0;
  text-align: center;
  line-height: 1.2;
}

.post p:has(> img),
.post p:has(> video) {
  display: flex;
  justify-content: center;
  padding: 1em 0;
}

.post video {
  margin: 1rem;
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
  margin: 1rem;
}

.post img {
  max-width: 100%;
}

.post code {
  background-color: #eee;
  padding: 0.2em 0.3em;
  border-radius: 0.35rem;
  margin: 0 0.2em;
  font-size: 16px;
}

.post pre code {
  background-color: inherit;
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
  color: #555;
}

.post .content .info .tags a:hover {
  color: #111;
}

.post .content .info .date {
  font-size: 90%;
  padding: 1em 0;
  color: #999;
  text-align: right;
  border-top: 1px solid #eee;
  border-bottom: 1px solid #eee;
}

.post .content p img {
  margin-left: -2em;
}

.post .content .refer p img {
  margin-left: 0;
}

.post a {
  text-decoration: underline;
}

.markdown .toc {
  line-height: 2.1;
  border: 1px solid #eee;
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
  border-left-color: #16b0ff;
  border-left-style: solid;
  border-left-width: 5px;
  padding: 0.1rem 1rem;
  font-style: italic;
  background-color: #eee;
  border-top-right-radius: 0.5rem;
  border-bottom-right-radius: 0.5rem;
  margin-top: 3em;
  margin-bottom: 3em;
}

.markdown pre {
  border: 1px solid #e6e6e6;
  margin-top: 1.2em;
  margin-bottom: 2.2em;
  padding: 15px 20px;
  display: block;
  overflow: auto;
  background: #fdfdfd;
}

.markdown h1 {
  margin: 2.5em 0 1.5em 0;
  line-height: 1.2;
}

.markdown h2 {
  margin: 2em 0 1em 0;
}

.markdown h3 {
  font-size: 1.3em;
  margin: 2em 0 1em 0;
  color: #333;
}

.markdown table {
  margin: 2em 0 3em 0;
}

.markdown strong,
.markdown b {
  color: #000;
}

.markdown hr {
  border-top: 1px dotted #efefef;
}

.markdown ul,
.markdown ol {
  line-height: 1.75;
  margin: 0.8em 0;
  max-width: 100%;
  overflow-x: auto;
}
</style>
