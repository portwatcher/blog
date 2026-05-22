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
defineProps<{
  articles: Article[]
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
