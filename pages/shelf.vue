<template>
  <div>
    <Tabs v-model:value="itemType">
      <TabList>
        <Tab
          v-for="type in itemTypes"
          :key="type"
          :value="type"
        >
          {{ type }}
        </Tab>
      </TabList>

      <TabPanels>
        <TabPanel
          v-for="type in itemTypes"
          :key="type"
          :value="type"
        >
          <div
            v-if="shelfData"
            class="shelf-container"
          >
            <div class="shelf-type-buttons">
              <Button
                v-for="type in shelfTypes"
                :key="type"
                @click="shelfType = type"
                :class="[
                  shelfType === type ? 'active' : '',
                ]"
              >
                {{ type }}
              </Button>
            </div>

            <div class="rating-slider">
              <label>Rating: </label>
              <input
                type="range"
                min="0"
                max="5"
                step="0.5"
                v-model="minRating"
                @change="handleRatingChange(minRating, maxRating)"
              />
              <input
                type="range"
                min="0"
                max="5"
                step="0.5"
                v-model="maxRating"
                @change="handleRatingChange(minRating, maxRating)"
              />
              <span>{{ minRating }} - {{ maxRating }}</span>
            </div>

            <div
              v-for="(items, shelfType) in shelfData?.[type]"
              :key="shelfType"
            >
              <h2>{{ shelfType }}</h2>
              <div class="shelf">
                <a
                  v-for="item in items"
                  :key="item.item.uuid"
                  class="item"
                  :href="item.item.id"
                  target="_blank"
                >
                  <img
                    :src="item.item.cover_image_url"
                    :alt="item.item.title"
                  />
                  <h3>{{ item.item.title }}</h3>
                </a>
              </div>
            </div>

            <Button
              v-if="page < totalPages"
              @click="loadMore"
              class="load-more-button"
            >
              Load More
            </Button>
          </div>
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>


<script setup lang="ts">
const itemTypes = ['book', 'tv', 'movie']
const shelfTypes: ShelfType[] = ['complete', 'progress']

const itemType = ref<string>(itemTypes[0])
const shelfType = ref<ShelfType>(shelfTypes[0])
const minRating = ref<number>(9)
const maxRating = ref<number>(10)
const page = ref(1)

const { data } = await useFetch('/api/shelves', {
  query: computed(() => ({
    type: shelfType.value,
    category: itemType.value,
    minRating: minRating.value,
    maxRating: maxRating.value,
    page: page.value,
  })),
})

const shelfData = computed(() => data.value?.groupedData)
const total = computed(() => data.value?.total)
const totalPages = computed(() => Math.ceil(total.value ?? 0 / ITEMS_PER_PAGE))

watch(itemType, () => {
  page.value = 1
})

watch(shelfType, () => {
  page.value = 1
})

const handleRatingChange = (min: number, max: number) => {
  minRating.value = min
  maxRating.value = max
  page.value = 1
}

const loadMore = () => {
  if (page.value < totalPages.value) {
    page.value++
  }
}
</script>

<style scoped>
.shelf-container {
  margin-bottom: 4rem;
}

.shelf-container h1 {
  margin-bottom: 2rem;
}

.shelf {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 2rem;
}

@media only screen and (min-width: 600px) {
  .shelf {
    grid-template-columns: repeat(5, 1fr);
  }
}

.item {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.item:hover {
  cursor: pointer;
}

.item img {
  height: 16rem;
  width: 100%;
  border: 1px solid #e2e8f0;
  object-fit: cover;
}

.item h3 {
  overflow: hidden;
  text-overflow: ellipsis;
  line-clamp: 3;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  -moz-line-clamp: 3;
  -moz-box-orient: vertical;
}

.shelf-type-buttons {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
}

.shelf-type-buttons .active {
  background-color: var(--primary-color);
  color: var(--primary-foreground-color);
}

.rating-slider {
  margin-bottom: 1rem;
}

.load-more-button {
  margin-top: 1rem;
  padding: 0.5rem 1rem;
  background-color: var(--primary-color);
  color: var(--primary-foreground-color);
  border-radius: 0.25rem;
}

h2 {
  font-size: 1.25rem;
  font-weight: 600;
  margin-top: 1rem;
  margin-bottom: 0.5rem;
}
</style>
