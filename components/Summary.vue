<template>
  <div class="summary">
    <h2>
      <NuxtLink :to="`/articles/${article.title}`">
        {{ article.title }}
      </NuxtLink>
    </h2>
    <NuxtLink :to="`/articles/${article.title}`">
      {{ article.description }}
    </NuxtLink>
  </div>
</template>


<script setup lang="ts">
import { type ParsedContent } from '@nuxt/content/types'

defineProps<{
  article: ParsedContent
}>()
</script>

<style scoped>
h2 {
  font-size: 2.2rem;
  font-family: 'Noto Serif SC', 'Noto Serif JP', 'PT Serif', "Georgia", "Times New Roman", Times, "Songti SC", "SimSun", sans-serif;
}

h2 a:hover {
  text-decoration: underline;
}

.summary>a {
  padding: 1rem;
  line-height: 2.1;
  display: block;

  &:hover {
    cursor: pointer;
    background-color: #f6f6f6;
  }
}
</style>