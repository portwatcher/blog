<template>
  <NuxtLayout>
    <NuxtPage></NuxtPage>
  </NuxtLayout>
</template>

<script setup lang="ts">
const { setLocale } = useI18n()

if (import.meta.client) {
  const locale = navigator.language.slice(0, 2).toLowerCase()
  setLocale(locale)
}
</script>

<style>
a,
a:visited,
a:hover,
a:active {
  color: inherit;
  text-decoration: none;
}

body {
  margin: 0;
  font-size: 14px;
  font-family: 'Noto Sans', 'PT Sans', "HelveticaNeue", "Helvetica Neue", Helvetica, Arial, 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
}

h1,
h2,
h3 {
  font-family: 'Noto Serif SC', 'Noto Serif JP', 'PT Serif', "Georgia", "Times New Roman", Times, "Songti SC", "SimSun", serif;
}

#nprogress .bar {
  height: 4px !important;
  background-color: rgba(0, 0, 0, 0.48) !important;
}
</style>