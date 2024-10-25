<template>
  <div>
    <Tabs v-model="currentItemType">
      <TabsList>
        <TabsTrigger
          v-for="type in itemTypes"
          :key="type"
          :value="type"
        >
          {{ type }}
        </TabsTrigger>
      </TabsList>

      <TabsContent
        v-for="type in itemTypes"
        :key="type"
        :value="type"
      >
        <div v-if="shelfData">
          <div class="flex space-x-4 mb-4">
            <Button
              v-for="type in shelfTypes"
              :key="type"
              @click="handleShelfTypeChange(type)"
              :class="[
                'px-3 py-1 rounded',
                shelfType === type ? 'bg-primary text-primary-foreground' : 'bg-secondary',
              ]"
            >
              {{ type }}
            </Button>
          </div>

          <div class="mb-4">
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
            v-for="(items, shelfType) in shelfData.groupedData[type]"
            :key="shelfType"
          >
            <h2 class="text-xl font-semibold mt-4 mb-2">{{ shelfType }}</h2>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div
                v-for="item in items"
                :key="item.item.id"
                class="border p-4 rounded"
              >
                <img
                  :src="item.item.cover_image_url"
                  :alt="item.item.title"
                  class="w-full h-40 object-cover mb-2"
                />
                <h3 class="font-bold">{{ item.item.title }}</h3>
                <p>Rating: {{ item.item.rating || 'N/A' }}</p>
              </div>
            </div>
          </div>

          <Button
            v-if="page < shelfData.totalPages"
            @click="loadMore"
            class="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded"
          >
            Load More
          </Button>
        </div>
      </TabsContent>
    </Tabs>
  </div>
</template>


<script setup lang="ts">
import { Tabs, TabsList, TabsTrigger, TabsContent } from '~/components/ui/tabs'
import { Button } from '~/components/ui/button'

const itemType = ref<ShelfItemType | undefined>(undefined)
const shelfType = ref<ShelfType | undefined>(undefined)
const minRating = ref<number>(0)
const maxRating = ref<number>(5)
const page = ref(1)

const { data: shelfData } = await useFetch('/api/shelves', {
  query: computed(() => ({
    itemType: itemType.value,
    type: shelfType.value,
    minRating: minRating.value,
    maxRating: maxRating.value,
    page: page.value,
  })),
})

const itemTypes = computed(() => Object.keys(shelfData.value?.groupedData || {}) as ShelfItemType[])

const currentItemType = computed({
  get: () => itemType.value || itemTypes.value[0],
  set: (value) => {
    itemType.value = value
    page.value = 1
  },
})

const shelfTypes: ShelfType[] = ['wishlist', 'progress', 'complete']

function handleShelfTypeChange(type: ShelfType) {
  shelfType.value = type === shelfType.value ? undefined : type
  page.value = 1
}

function handleRatingChange(min: number, max: number) {
  minRating.value = min
  maxRating.value = max
  page.value = 1
}

function loadMore() {
  if (page.value < (shelfData.value?.totalPages || 1)) {
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
</style>