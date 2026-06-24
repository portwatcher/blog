<template>
  <figure
    v-if="src"
    class="s3-video-frame"
  >
    <video
      class="s3-video"
      :src="src"
      :poster="posterSrc || undefined"
      controls
      preload="metadata"
      playsinline
      :aria-label="description || undefined"
    ></video>
    <figcaption v-if="description">
      {{ description }}
    </figcaption>
  </figure>
  <code
    v-else
    class="s3-media-missing"
  >{{ objectKey }}</code>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  objectKey?: string
  posterKey?: string
  description?: string
}>(), {
  objectKey: '',
  posterKey: '',
  description: '',
})

const mediaUrl = (key: string) => {
  const normalizedKey = key.trim()

  return normalizedKey ? `/api/cms/media/object?key=${encodeURIComponent(normalizedKey)}` : ''
}

const src = computed(() => mediaUrl(props.objectKey))
const posterSrc = computed(() => mediaUrl(props.posterKey))
</script>

<style scoped>
.s3-video-frame {
  margin: 2rem auto;
}

.s3-video {
  display: block;
  width: 100%;
  max-width: 100%;
  max-height: 40rem;
  margin: 0 auto;
}

figcaption {
  margin-top: 0.6rem;
  color: var(--color-muted);
  font-size: 0.9rem;
  line-height: 1.5;
  text-align: center;
}

.s3-media-missing {
  display: block;
  margin: 1rem 0;
  overflow-wrap: anywhere;
}
</style>
