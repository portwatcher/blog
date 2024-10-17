<template>
  <div
    v-if="article"
    class="post"
  >
    <ContentRenderer :value="article">
      <h1 class="title">{{ article.title }}</h1>

      <ContentRendererMarkdown
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
    </ContentRenderer>

    <div class="date">
      @{{ article.date }}
    </div>

    <Comment></Comment>
  </div>
  <NotFound v-else></NotFound>
</template>

<script setup lang="ts">
import type { ParsedContent } from '@nuxt/content/types'

const route = useRoute()
const config = useRuntimeConfig()
const password = ref<string | null>(null)
const article = ref<ParsedContent | null>(null)

const { data: articles } = await useFetch<ParsedContent[]>('/api/articles', {
  query: {
    title: route.params.title,
  },
})

article.value = articles.value?.[0] ?? null

if (article.value) {
  useSeoMeta({
    title: article.value.title,
    description: article.value.description,
    ogDescription: article.value.description,
    ogUrl: `${config.public.host}/articles/${article.value.title}`,
    ogTitle: article.value.title,
    twitterCard: 'summary',
  })
}

const unlock = async function () {
  const articles = await $fetch('/api/articles', {
    method: 'GET',
    query: {
      title: route.params.title,
      password: password.value,
    },
  })

  article.value = articles[0] as ParsedContent | null
}
</script>

<style scoped>
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
  margin-left: auto;
  margin-right: auto;
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