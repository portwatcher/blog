<template>
  <div>
    <Tabs v-model:value="itemType">
      <TabList>
        <Tab
          v-for="type in itemTypes"
          :key="type"
          :value="type"
        >
          {{ $t(`${type}`) }}
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
            <div class="option-container">
              <Rating v-model="rating"></Rating>

              <div class="radios">
                <div
                  v-for="iterShelfType in shelfTypes"
                  :key="iterShelfType"
                >
                  <RadioButton
                    v-model="shelfType"
                    :value="iterShelfType"
                  />
                  <label :for="iterShelfType">{{ $t(`neodb.${iterShelfType}`) }}</label>
                </div>
              </div>
            </div>

            <div style="display: flex; flex-direction: column; gap: 1rem;">
              <div
                v-for="(items, shelfType) in shelfData?.[type]"
                :key="shelfType"
              >
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
                    <span>{{ $d(new Date(item.created_time), 'short') }}</span>
                  </a>
                </div>
              </div>

              <Paginator
                v-if="total > itemsPerPage"
                :rows="itemsPerPage"
                :total-records="total"
                @page="$event => page = $event.page + 1"
              />
            </div>
          </div>
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>


<script setup lang="ts">
const itemTypes = ['book', 'tv', 'movie']
const shelfTypes: ShelfType[] = ['complete', 'progress', 'wishlist']

const itemType = ref<string>(itemTypes[0])
const shelfType = ref<ShelfType>(shelfTypes[0])
const rating = ref<number>(5)
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
const itemsPerPage = ITEMS_PER_PAGE

watch(itemType, () => {
  page.value = 1
  shelfType.value = shelfTypes[0]
})

watch(shelfType, () => {
  page.value = 1
})

watch(rating, () => {
  minRating.value = rating.value * 2 - 1
  maxRating.value = rating.value * 2
})
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

.item span {
  font-size: 0.8rem;
  margin-top: -0.5rem;
}

h2 {
  font-size: 1.25rem;
  font-weight: 600;
  margin-top: 1rem;
  margin-bottom: 0.5rem;
}

.option-container {
  display: flex;
  gap: 1rem;
  align-items: center;
  margin-bottom: 3rem;
  margin-top: 1rem;
}

.radios {
  display: flex;
  gap: 0.7rem;
}

.radios>div {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.radios label {
  white-space: nowrap;
}

@media only screen and (min-width: 600px) {
  .option-container {
    gap: 1.5rem;
  }

  .radios {
    gap: 1rem;
  }

  .radios>div {
    gap: 0.5rem;
  }
}
</style>
