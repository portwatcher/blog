<template>
  <div class="giscus"></div>
</template>

<script setup lang="ts">
import { type GiscusProps } from '@giscus/vue'

if (import.meta.client) {
  const giscusConfig = useRuntimeConfig().public.giscus as GiscusProps

  const scriptTag = document.createElement('script')

  if (scriptTag) {
    scriptTag.src = 'https://giscus.app/client.js'
    scriptTag.setAttribute('data-repo', giscusConfig.repo)
    scriptTag.setAttribute('data-repo-id', giscusConfig.repoId)
    scriptTag.setAttribute('data-mapping', giscusConfig.mapping)
    scriptTag.setAttribute('crossorigin', 'anonymous')

    if (giscusConfig.categoryId) {
      scriptTag.setAttribute('data-category-id', giscusConfig.categoryId)
    }
    if (giscusConfig.category) {
      scriptTag.setAttribute('data-category', giscusConfig.category)
    }
    if (giscusConfig.reactionsEnabled) {
      scriptTag.setAttribute('data-reactions-enabled', giscusConfig.reactionsEnabled)
    }
    if (giscusConfig.inputPosition) {
      scriptTag.setAttribute('data-input-position', giscusConfig.inputPosition)
    }
    if (giscusConfig.emitMetadata) {
      scriptTag.setAttribute('data-emit-metadata', giscusConfig.emitMetadata)
    }
    if (giscusConfig.theme) {
      scriptTag.setAttribute('data-theme', giscusConfig.theme)
    }
    if (giscusConfig.lang) {
      scriptTag.setAttribute('data-lang', giscusConfig.lang)
    }
  }

  onMounted(async () => {
    document.head.appendChild(scriptTag)
  })

  onUnmounted(() => {
    scriptTag.remove()
  })
}
</script>