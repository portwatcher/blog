<template>
  <div class="container">
    <h1>{{ capitalize(String(route.params.category)) }}</h1>
    <SummaryTitleList :articles="articles ?? []"></SummaryTitleList>
    <NotFound v-if="!articles || articles.length === 0"></NotFound>
  </div>
</template>

<script setup lang="ts">
import type { ParsedContent } from '@nuxt/content/types'

const route = useRoute()
const page = Number(route.query.page) ?? 1
const config = useRuntimeConfig()

const { data: articles } = await useFetch<ParsedContent[]>('/api/articles', {
  query: {
    category: route.params.category,
    page,
  },
})

useSeoMeta({
  title: String(route.params.category),
  ogUrl: `${config.public.host}/${route.params.category}`,
  twitterCard: 'summary',
})
</script>

<style scoped>
.container {
  padding: 2rem 0;
}

h1 {
  font-size: 2em;
  margin: 0.67em;
  width: 100%;
  text-align: center;
  margin-bottom: 4rem;
}
</style>