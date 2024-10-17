<template>
  <div class="titles">
    <SummaryTitle
      v-for="article in articles"
      :article="article"
    >
    </SummaryTitle>
  </div>
</template>


<script setup lang="ts">
import type { ParsedContent } from '@nuxt/content/types'

defineProps<{
  articles: ParsedContent[]
}>()
</script>

<style scoped>
.titles {
  display: flex;
  flex-direction: column;
  gap: 3rem;
  width: 100%;
}
</style>