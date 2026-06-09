<template>
  <div>
    <div
      v-for="[year, articles] in yearGroups"
      :key="year"
    >
      <h1>{{ year }}</h1>
      <SummaryTitleList :articles="articles">
      </SummaryTitleList>
    </div>
  </div>
</template>

<script setup lang="ts">
const config = useRuntimeConfig()
const { locale, t } = useI18n()

const { data } = await useFetch<Article[]>('/api/articles', {
  query: computed(() => ({
    only: ['title', 'date', '_dir'],
    lang: locale.value,
  })),
})

const yearGroups = computed(() => {
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

  return Array.from(yearGroupMap.entries())
})

useSeoMeta({
  title: () => t('archive'),
  ogUrl: new URL('/archive', config.public.host).toString(),
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
