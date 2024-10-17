<template>
  <div>
    <div
      v-for="(shelf, index) in shelves"
      :key="index"
      class="shelf-container"
    >
      <h1>{{ $t(`neodb.${shelf.type}`) }}</h1>
      <div class="shelf">
        <div v-for="data in shelf.data">
          <NuxtLink
            class="item"
            :to="`https://neodb.social${data.item.url}`"
            target="_blank"
          >
            <NuxtImg :src="data.item.cover_image_url">
            </NuxtImg>

            <h3>{{ data.item.title }}</h3>
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>


<script setup lang="ts">
interface ShelfResponse {
  data: ShelfData[]
  type: ShelfType
  pages: number
  count: number
}

const shelves = ref<ShelfResponse[]>([])

const getShelf = async function (type: ShelfType, page: number = 1): Promise<ShelfResponse> {
  const shelf = await $fetch<Shelf>('/api/shelves', {
    query: {
      type,
      page,
    },
  })

  return {
    ...shelf,
    type,
  }
}

const initShelfs = async function () {
  const types = ['progress', 'complete', 'wishlist'] as ShelfType[]
  shelves.value = await Promise.all(
    types.map((type) => {
      return getShelf(type, 1)
    })
  )
}

await initShelfs()
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