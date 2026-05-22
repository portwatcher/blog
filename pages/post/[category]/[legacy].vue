<template>
  <NotFound v-if="!article"></NotFound>
</template>

<script setup lang="ts">
const route = useRoute()
const slug = route.params.legacy
const path = `/${route.params.category}/${slug}`


const { data: articles } = await useFetch<Article[]>('/api/articles', {
  query: {
    path,
    category: route.params.category,
  },
})

const article = computed(() => articles.value?.[0])


if (article.value && article.value.title) {
  const location = `/articles/${article.value.title}`
  await navigateTo(location)
}
</script>
