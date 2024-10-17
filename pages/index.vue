<template>
  <div class="latest-articles">
    <Summary
      v-if="latestArticle"
      :article="latestArticle"
    ></Summary>
  </div>

  <Divider></Divider>

  <div class="categories">
    <NuxtLink
      v-for="category in categories"
      :to="`/category/${category.title}`"
    >
      <div class="category-info">
        <h3>
          {{ capitalize(category.title) }}
        </h3>
        <span>{{ category.count }} posts</span>
      </div>
    </NuxtLink>
  </div>
</template>

<script setup lang="ts">
import type { ParsedContent } from '@nuxt/content/types'

const config = useRuntimeConfig()

const { data } = await useFetch<ParsedContent[]>('/api/articles', {
  query: {
    only: ['title', '_dir', 'description']
  },
})

const latestArticle = data.value?.[0]

const categories = data.value?.reduce((acc: CategoryInfo[], article: ParsedContent) => {
  const category = acc.find((c) => c.title === article._dir)
  if (category) {
    category.count++
  } else {
    acc.push({
      title: article._dir,
      count: 1
    })
  }

  return acc
}, []) ?? []

useHead(() => ({
  title: config.public.title,
  meta: [
    {
      hid: 'description',
      name: 'description',
      content: config.public.description
    }
  ]
}))
</script>

<style scoped>
.categories {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 2rem 0;
}

.categories>a {
  padding: 0.5rem 1rem;
  border: 1px solid #c8c8c8;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'FreeSans', 'Arimo', "Droid Sans", Helvetica, Arial, sans-serif;
  font-size: 16px;
  position: relative;
  margin: 20px 40px;
  height: 200px;
  width: 160px;
  padding: 60px 30px;

  &:hover {
    box-shadow: 0 1px 5px rgba(0, 0, 0, 0.2);
  }
}

.category-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  width: 100%;
  gap: 1rem;

  h3 {
    color: #333;
    font-size: 1.2rem;
    font-weight: normal;
    font-family: 'Noto Serif SC', 'Noto Serif JP', 'PT Serif', "Georgia", "Times New Roman", Times, "Songti SC", "SimSun", sans-serif;
  }

  span {
    font-size: 0.8rem;
    color: #999;
  }
}
</style>