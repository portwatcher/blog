<template>
  <div
    ref="commentContainer"
    class="giscus"
  ></div>
</template>

<script setup lang="ts">
import { type GiscusProps } from '@giscus/vue'

const props = defineProps<{
  discussionTerm?: string
}>()

const commentContainer = ref<HTMLElement | null>(null)
let scriptTag: HTMLScriptElement | null = null

const createGiscusScript = () => {
  const giscusConfig = useRuntimeConfig().public.giscus as GiscusProps

  const tag = document.createElement('script')

  tag.src = 'https://giscus.app/client.js'
  tag.setAttribute('data-repo', giscusConfig.repo)
  tag.setAttribute('data-repo-id', giscusConfig.repoId)
  tag.setAttribute('data-mapping', props.discussionTerm ? 'specific' : giscusConfig.mapping)
  tag.setAttribute('crossorigin', 'anonymous')

  if (props.discussionTerm) {
    tag.setAttribute('data-term', props.discussionTerm)
  }
  if (giscusConfig.categoryId) {
    tag.setAttribute('data-category-id', giscusConfig.categoryId)
  }
  if (giscusConfig.category) {
    tag.setAttribute('data-category', giscusConfig.category)
  }
  if (giscusConfig.reactionsEnabled) {
    tag.setAttribute('data-reactions-enabled', giscusConfig.reactionsEnabled)
  }
  if (giscusConfig.inputPosition) {
    tag.setAttribute('data-input-position', giscusConfig.inputPosition)
  }
  if (giscusConfig.emitMetadata) {
    tag.setAttribute('data-emit-metadata', giscusConfig.emitMetadata)
  }
  if (giscusConfig.theme) {
    tag.setAttribute('data-theme', giscusConfig.theme)
  }
  if (giscusConfig.lang) {
    tag.setAttribute('data-lang', giscusConfig.lang)
  }

  return tag
}

if (import.meta.client) {

  onMounted(() => {
    if (!commentContainer.value) return

    scriptTag = createGiscusScript()
    commentContainer.value.appendChild(scriptTag)
  })

  onUnmounted(() => {
    scriptTag?.remove()
  })
}
</script>
