<template>
  <div
    class="site-shell"
    :class="{ 'site-shell--archive': isArchive }"
  >
    <a class="skip-link" href="#main-content">{{ $t('skipToContent') }}</a>

    <header class="site-header">
      <NuxtLink to="/">{{ $t('home') }}</NuxtLink>
      <NuxtLink to="/archive">{{ $t('archive') }}</NuxtLink>
      <NuxtLink
        to="/feed"
        external
      >{{ $t('feed') }}</NuxtLink>
      <NuxtLink to="/shelf">
        {{ $t('shelf') }}
      </NuxtLink>
    </header>

    <main
      id="main-content"
      class="container"
      :class="{ 'container--archive': isArchive }"
    >
      <slot></slot>
    </main>

    <footer></footer>
    <ArchiveTransitionLayer />
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const isArchive = computed(() => route.path === '/archive')
</script>

<style scoped>
.site-shell {
  --site-header-height: 47px;
}

.site-header {
  display: flex;
  width: 100%;
  justify-content: flex-end;
  align-items: center;
  gap: clamp(0.75rem, 3vw, 1.5rem);
  color: var(--color-text);
  font-size: 0.875rem;
  height: calc(var(--site-header-height) + env(safe-area-inset-top));
  padding: env(safe-area-inset-top) max(1rem, env(safe-area-inset-right)) 0 max(1rem, env(safe-area-inset-left));
  box-sizing: border-box;
  border-bottom: 1px solid var(--color-soft-border);
  background: var(--color-surface);
}

.site-header a {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
}

.site-header a:hover,
.site-header a.router-link-exact-active {
  color: var(--color-heading);
}

.site-header a:focus-visible,
.skip-link:focus-visible {
  outline: 2px solid var(--color-heading);
  outline-offset: 3px;
}

.container {
  width: 100%;
  max-width: 1024px;
  margin-left: auto;
  margin-right: auto;
  padding: 1rem;
  padding-bottom: 5rem;
  box-sizing: border-box;
}

.site-shell--archive .site-header {
  position: fixed;
  top: 0;
  right: 0;
  left: 0;
  z-index: 20;
  background: var(--color-surface);
  border-bottom-color: var(--color-soft-border);
}

.container--archive {
  max-width: none;
  min-height: 100vh;
  min-height: 100svh;
  padding: 0;
  overflow: visible;
}

.skip-link {
  position: fixed;
  top: 0.5rem;
  left: 0.5rem;
  z-index: 2100;
  padding: 0.65rem 0.9rem;
  background: var(--color-surface);
  color: var(--color-heading);
  transform: translateY(-150%);
}

.skip-link:focus {
  transform: translateY(0);
}

@media (max-width: 30rem) {
  .site-header {
    justify-content: space-between;
    gap: 0.5rem;
    padding-right: max(0.75rem, env(safe-area-inset-right));
    padding-left: max(0.75rem, env(safe-area-inset-left));
  }
}
</style>
