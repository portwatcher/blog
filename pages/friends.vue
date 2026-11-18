<template>
  <section class="friends">
    <header class="friends-header">
      <h1>{{ pageTitle }}</h1>
      <p
        v-if="data?.description"
        class="friends-description"
      >
        {{ data.description }}
      </p>
    </header>

    <ul
      v-if="links.length"
      class="friends-list"
    >
      <li
        v-for="link in links"
        :key="link.url"
      >
        <a
          class="friend"
          :href="link.url"
          target="_blank"
          rel="noopener"
        >
          <img
            v-if="link.avatar"
            class="friend-avatar"
            :src="link.avatar"
            alt=""
            loading="lazy"
            referrerpolicy="no-referrer"
          />
          <span
            v-else
            class="friend-avatar friend-avatar--initial"
            aria-hidden="true"
          >{{ initialOf(link.name) }}</span>
          <span class="friend-text">
            <span class="friend-name">{{ link.name }}</span>
            <span
              v-if="link.description"
              class="friend-summary"
            >{{ link.description }}</span>
            <span class="friend-host">{{ hostOf(link.url) }}</span>
          </span>
        </a>
      </li>
    </ul>

    <p
      v-else
      class="friends-empty"
    >
      {{ $t('friendLinks.empty') }}
    </p>
  </section>
</template>

<script setup lang="ts">
const config = useRuntimeConfig()
const { t } = useI18n()
const { data } = await useFetch('/api/friends')

const links = computed(() => data.value?.links ?? [])
const pageTitle = computed(() => data.value?.title || t('friendLinks.title'))

const initialOf = (name: string) => Array.from(name.trim())[0]?.toUpperCase() ?? ''

const hostOf = (url: string) => {
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch (_error) {
    return url
  }
}

useHead(() => ({
  title: `${pageTitle.value} - ${config.public.title}`,
}))
</script>

<style scoped>
.friends {
  max-width: 48rem;
  margin: 0 auto;
  padding: 2rem 0;
}

.friends-header {
  margin-bottom: 2rem;
}

.friends-header h1 {
  margin: 0;
  color: var(--color-heading);
  font-size: 1.6rem;
  font-weight: normal;
}

.friends-description {
  margin: 0.75rem 0 0;
  color: var(--color-muted);
  line-height: 1.7;
  white-space: pre-line;
}

.friends-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
  gap: 1rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.friend {
  display: flex;
  height: 100%;
  align-items: flex-start;
  gap: 0.875rem;
  padding: 1rem;
  border: 1px solid var(--color-border);
  box-sizing: border-box;
  transition: border-color 160ms ease, box-shadow 160ms ease;
}

.friend:hover {
  border-color: var(--color-muted);
  box-shadow: 0 1px 5px rgba(0, 0, 0, 0.08);
}

.friend:focus-visible {
  outline: 2px solid var(--color-heading);
  outline-offset: 2px;
}

.friend-avatar {
  flex-shrink: 0;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 50%;
  object-fit: cover;
  background: var(--color-subtle);
}

.friend-avatar--initial {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--color-muted);
  font-family: var(--font-serif);
  font-size: 1.1rem;
}

.friend-text {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.3rem;
}

.friend-name {
  color: var(--color-heading);
  font-family: var(--font-serif);
  font-size: 1.05rem;
}

.friend-summary {
  color: var(--color-text);
  font-size: 0.875rem;
  line-height: 1.55;
}

.friend-host {
  overflow: hidden;
  color: var(--color-muted);
  font-size: 0.75rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.friends-empty {
  color: var(--color-muted);
}

@media (prefers-reduced-motion: reduce) {
  .friend {
    transition: none;
  }
}
</style>
