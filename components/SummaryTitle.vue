<template>
  <div class="summary-title">
    <NuxtLink :to="`/articles/${getArticleRouteTitle(article)}`">
      {{ article.title }}
    </NuxtLink>
    <span>{{ $d(new Date(article.date), 'short') }}</span>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  article: Article
}>()
</script>

<style scoped>
.summary-title {
  display: flex;
  width: 100%;
  font-size: 16px;
  align-items: flex-start;
  gap: 1rem;
}

a {
  min-width: 0;
  overflow-wrap: anywhere;
  color: #333;
}

a:hover {
  text-decoration: underline;
}

span {
  margin-left: auto;
  text-align: right;
  min-width: 6rem;
  flex-shrink: 0;
}
</style>
