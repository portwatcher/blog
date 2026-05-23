<template>
  <div
    v-if="article"
    class="post"
  >
    <h1 class="title">{{ article.title }}</h1>

    <nav
      v-if="translationLinks.length > 1"
      class="translation-links"
      aria-label="Article translations"
    >
      <NuxtLink
        v-for="link in translationLinks"
        :key="link.lang || 'original'"
        :to="link.to"
        :class="{ active: link.active }"
      >
        {{ link.label }}
      </NuxtLink>
    </nav>

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

    <Comment></Comment>
  </div>
  <NotFound v-else></NotFound>
</template>

<script setup lang="ts">
const route = useRoute()
const config = useRuntimeConfig()
const password = ref<string | null>(null)
const article = ref<Article | null>(null)
const languageLabels: Record<string, string> = {
  zh: '中文',
  en: 'English',
  ja: '日本語',
}

const configuredTranslationLanguages = computed(() =>
  String(config.public.translationLanguages || 'en,ja')
    .split(',')
    .map((lang) => lang.trim())
    .filter(Boolean),
)

const currentLang = computed(() => String(route.query.lang || ''))
const originalLang = computed(() => String(config.public.originalLanguage || 'zh'))
const availableTranslations = computed(() => article.value?.availableTranslations ?? [])

const getArticleQuery = () => ({
  title: route.params.title,
  lang: currentLang.value || undefined,
  password: password.value || undefined,
})

const loadArticle = async () => {
  const articles = await $fetch<Article[]>('/api/articles', {
    method: 'GET',
    query: getArticleQuery(),
  })

  article.value = articles[0] as Article | null
}

await loadArticle()

const translationLinks = computed(() => {
  const langs = configuredTranslationLanguages.value.filter((lang) =>
    availableTranslations.value.includes(lang),
  )

  return [
    {
      lang: '',
      label: languageLabels[originalLang.value] || originalLang.value.toUpperCase(),
      active: !currentLang.value,
      to: {
        path: route.path,
      },
    },
    ...langs.map((lang) => ({
      lang,
      label: languageLabels[lang] || lang.toUpperCase(),
      active: currentLang.value === lang,
      to: {
        path: route.path,
        query: {
          lang,
        },
      },
    })),
  ]
})

watch(() => route.query.lang, () => {
  void loadArticle()
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
.translation-links {
  display: flex;
  justify-content: center;
  gap: 0.75rem;
  margin: -2.5rem 0 2.5rem;
  font-size: 0.9rem;
}

.translation-links a {
  color: #777;
  text-decoration: none;
}

.translation-links a:hover,
.translation-links a.active {
  color: #111;
  text-decoration: underline;
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
  padding: 0.5em 0 1.5em 0;
  margin: 1em 0 2em 0;
  border-bottom: 1px solid #eee;
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
