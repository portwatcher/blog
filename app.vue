<template>
  <NuxtLayout>
    <NuxtPage></NuxtPage>
  </NuxtLayout>
</template>

<script setup lang="ts">
import { isUiLocale, uiLocaleStorageKey } from '~/utils/ui-locale'

const { locale: currentLocale, setLocale } = useI18n()

// Serialize the initial language so server rendering and hydration agree.
const initialLocale = useState('ui-locale', () => {
  const detectedLocale = import.meta.server
    ? useRequestHeaders(['accept-language'])['accept-language']?.slice(0, 2).toLowerCase()
    : navigator.language.slice(0, 2).toLowerCase()

  return isUiLocale(detectedLocale) ? detectedLocale : 'en'
})

if (currentLocale.value !== initialLocale.value) {
  await setLocale(initialLocale.value)
}

onMounted(async () => {
  // Restore only after hydration; storage may be unavailable in private mode.
  let savedLocale: string | null = null
  try {
    savedLocale = localStorage.getItem(uiLocaleStorageKey)
  } catch {
    // Keep the browser language when storage is blocked.
  }

  if (isUiLocale(savedLocale) && currentLocale.value !== savedLocale) {
    await setLocale(savedLocale)
  }
})

watch(currentLocale, (locale) => {
  if (import.meta.client) {
    try {
      localStorage.setItem(uiLocaleStorageKey, locale)
    } catch {
      // Language selection still works for this visit without storage.
    }
  }
})

useHead(() => ({ htmlAttrs: { lang: currentLocale.value } }))
</script>

<style>
:root {
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans",
    "Helvetica Neue", Arial, "PingFang SC", "Hiragino Sans GB",
    "Microsoft YaHei", "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo,
    sans-serif;
  --font-serif: "Noto Serif SC", "Noto Serif JP", "Noto Serif", Georgia,
    "Times New Roman", "Songti SC", SimSun, serif;
  --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Consolas,
    "Liberation Mono", Menlo, monospace;
  --color-text: oklch(24% 0.012 255);
  --color-heading: oklch(18% 0.012 255);
  --color-muted: oklch(50% 0.014 255);
  --color-border: oklch(90% 0.008 255);
  --color-soft-border: oklch(94% 0.006 255);
  --color-surface: oklch(99% 0.002 255);
  --color-subtle: oklch(96.5% 0.004 255);
  --color-link: oklch(48% 0.145 255);
}

html {
  font-size: 16px;
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}

a,
a:visited,
a:hover,
a:active {
  color: inherit;
  text-decoration: none;
}

body {
  margin: 0;
  font-size: 1rem;
  font-family: var(--font-sans);
  color: var(--color-text);
  background: var(--color-surface);
  font-kerning: normal;
  text-rendering: optimizeLegibility;
}

h1,
h2,
h3 {
  font-family: var(--font-serif);
}

#nprogress .bar {
  height: 4px !important;
  background-color: rgba(0, 0, 0, 0.48) !important;
}
</style>
