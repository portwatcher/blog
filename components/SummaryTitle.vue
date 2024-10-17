<template>
  <div class="summary-title">
    <NuxtLink :to="`/articles/${article.title}`">
      {{ article.title }}
    </NuxtLink>
    <span>{{ new Date(article.date).toLocaleDateString() }}</span>
  </div>
</template>

<script setup lang="ts">
import { type ParsedContent } from '@nuxt/content/types'


defineProps<{
  article: ParsedContent
}>()
</script>

<style scoped>
.summary-title {
  display: flex;
  width: 100%;
  font-size: 16px;
  align-items: flex-start;
}

a {
  color: #333;
}

a:hover {
  text-decoration: underline;
}

span {
  margin-left: auto;
  text-align: right;
  min-width: 6rem;
}
</style>