<template>
  <div>
    <div v-for="year in Array.from(yearGroupMap.keys()).sort(() => 1)">
      <h1>{{ year }}</h1>
      <SummaryTitleList :articles="yearGroupMap.get(year)!">
      </SummaryTitleList>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ParsedContent } from '@nuxt/content/types'

const config = useRuntimeConfig()

const { data } = await useFetch<ParsedContent[]>('/api/articles')

const yearGroupMap: YearGroupMap = new Map()

data.value?.forEach((article) => {
  const year = new Date(article.date).getFullYear()
  if (isNaN(year)) {
    return
  }
  if (!yearGroupMap.has(year)) {
    yearGroupMap.set(year, [article])
  } else {
    yearGroupMap.get(year)?.push(article)
  }
})

useSeoMeta({
  title: 'Archive',
  ogUrl: `${config.public.host}/archive`,
  twitterCard: 'summary',
})
</script>


<style scoped>
h1 {
  font-size: 2em;
  margin: 4em 0;
  width: 100%;
  text-align: center;
}
</style>