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
                v-if="total && total > itemsPerPage"
                :first="(page - 1) * itemsPerPage"
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
const itemTypes = ['book', 'tv', 'movie'] as const
const shelfTypes: ShelfType[] = ['complete', 'progress', 'wishlist']

type ItemType = typeof itemTypes[number]

interface ShelfQueryState {
  category: ItemType
  type: ShelfType
  rating: number
  page: number
}

const defaultShelfQuery: ShelfQueryState = {
  category: itemTypes[0],
  type: shelfTypes[0],
  rating: 5,
  page: 1,
}

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const config = useRuntimeConfig()

const firstQueryValue = (value: unknown) => {
  return Array.isArray(value) ? value[0] : value
}

const normalizeItemType = (value: unknown): ItemType => {
  const queryValue = firstQueryValue(value)

  return typeof queryValue === 'string' && itemTypes.includes(queryValue as ItemType)
    ? queryValue as ItemType
    : defaultShelfQuery.category
}

const normalizeShelfType = (value: unknown): ShelfType => {
  const queryValue = firstQueryValue(value)

  return typeof queryValue === 'string' && shelfTypes.includes(queryValue as ShelfType)
    ? queryValue as ShelfType
    : defaultShelfQuery.type
}

const normalizeRating = (value: unknown): number => {
  const ratingValue = Number(firstQueryValue(value))

  return Number.isInteger(ratingValue) && ratingValue >= 1 && ratingValue <= 5
    ? ratingValue
    : defaultShelfQuery.rating
}

const normalizePage = (value: unknown): number => {
  const pageValue = Number(firstQueryValue(value))

  return Number.isInteger(pageValue) && pageValue >= 1
    ? pageValue
    : defaultShelfQuery.page
}

const shelfQuery = computed<ShelfQueryState>(() => ({
  category: normalizeItemType(route.query.category),
  type: normalizeShelfType(route.query.type),
  rating: normalizeRating(route.query.rating),
  page: normalizePage(route.query.page),
}))

const updateShelfQuery = (query: Partial<ShelfQueryState>) => {
  const nextQuery = {
    ...shelfQuery.value,
    ...query,
  }
  const {
    category: _category,
    type: _type,
    rating: _rating,
    page: _page,
    minRating: _minRating,
    maxRating: _maxRating,
    ...remainingQuery
  } = route.query

  router.replace({
    query: {
      ...remainingQuery,
      category: nextQuery.category,
      type: nextQuery.type,
      rating: String(nextQuery.rating),
      page: String(nextQuery.page),
    },
  })
}

const itemType = computed<ItemType>({
  get: () => shelfQuery.value.category,
  set: category => updateShelfQuery({
    category: normalizeItemType(category),
    type: defaultShelfQuery.type,
    page: defaultShelfQuery.page,
  }),
})
const shelfType = computed<ShelfType>({
  get: () => shelfQuery.value.type,
  set: type => updateShelfQuery({
    type: normalizeShelfType(type),
    page: defaultShelfQuery.page,
  }),
})
const rating = computed<number>({
  get: () => shelfQuery.value.rating,
  set: rating => updateShelfQuery({
    rating: normalizeRating(rating),
  }),
})
const page = computed<number>({
  get: () => shelfQuery.value.page,
  set: page => updateShelfQuery({
    page: normalizePage(page),
  }),
})
const minRating = computed(() => rating.value * 2 - 1)
const maxRating = computed(() => rating.value * 2)

useSeoMeta({
  title: t('shelf'),
  ogUrl: new URL('/shelf', config.public.host).toString(),
  twitterCard: 'summary',
})

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
  flex-direction: column;
  justify-content: center;
  gap: 2rem;
  margin-bottom: 3rem;
  margin-top: 1rem;
}

@media only screen and (min-width: 600px) {
  .option-container {
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
  }
}

.radios {
  display: flex;
  gap: 1rem;
}

.radios>div {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.radios label {
  white-space: nowrap;
}
</style>
