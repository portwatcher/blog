<template>
  <img
    v-if="normalizedSrc"
    v-bind="$attrs"
    :src="normalizedSrc"
    :alt="alt || ''"
    :title="title || undefined"
    :width="width || undefined"
    :height="height || undefined"
    loading="lazy"
    decoding="async"
  >
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  src?: string
  alt?: string
  title?: string
  width?: string | number
  height?: string | number
}>(), {
  src: '',
  alt: '',
  title: '',
  width: undefined,
  height: undefined,
})

const config = useRuntimeConfig()

const normalizeManagedMediaKey = (value: string) => {
  try {
    return value
      .split(/[?#]/)[0]
      .split('/')
      .map(decodeURIComponent)
      .join('/')
  } catch (_error) {
    return value.split(/[?#]/)[0]
  }
}

const normalizedSrc = computed(() => {
  const src = props.src.trim()
  const mediaBaseUrl = String(config.public.mediaBaseUrl || '').replace(/\/+$/, '')

  if (!src || !mediaBaseUrl || !src.startsWith(`${mediaBaseUrl}/`)) return src

  const key = normalizeManagedMediaKey(src.slice(mediaBaseUrl.length + 1))
  return key ? `/api/cms/media/object?key=${encodeURIComponent(key)}` : src
})
</script>

<style scoped>
img {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 2rem auto;
  border-radius: 0.375rem;
}
</style>
