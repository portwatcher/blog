<template>
  <img
    v-if="src"
    class="s3-image"
    :src="src"
    :alt="alt || ''"
    :width="normalizedWidth"
    :height="normalizedHeight"
    loading="lazy"
    decoding="async"
  >
  <code
    v-else
    class="s3-media-missing"
  >{{ objectKey }}</code>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  objectKey?: string
  alt?: string
  width?: string | number
  height?: string | number
}>(), {
  objectKey: '',
  alt: '',
  width: undefined,
  height: undefined,
})

const config = useRuntimeConfig()

const encodeObjectKey = (key: string) =>
  key.split('/').map(encodeURIComponent).join('/')

const normalizeDimension = (value: string | number | undefined) => {
  const number = Number(value)

  return Number.isFinite(number) && number > 0 ? Math.round(number) : undefined
}

const src = computed(() => {
  const baseUrl = String(config.public.mediaBaseUrl || '').replace(/\/+$/, '')
  const key = props.objectKey.trim()

  return baseUrl && key ? `${baseUrl}/${encodeObjectKey(key)}` : ''
})
const normalizedWidth = computed(() => normalizeDimension(props.width))
const normalizedHeight = computed(() => normalizeDimension(props.height))
</script>

<style scoped>
.s3-image {
  display: block;
  width: 100%;
  max-width: 100%;
  height: auto;
  margin: 2rem auto;
  object-fit: contain;
  border-radius: 0.375rem;
}

.s3-media-missing {
  display: block;
  margin: 1rem 0;
  overflow-wrap: anywhere;
}
</style>
