<template>
  <label class="ui-language">
    <Languages aria-hidden="true" />
    <span class="ui-language__label">{{ $t('uiLanguage') }}</span>
    <select :value="locale" @change="changeLocale">
      <option
        v-for="language in uiLocales"
        :key="language.code"
        :value="language.code"
        :lang="language.code"
      >
        {{ language.label }}
      </option>
    </select>
  </label>
</template>

<script setup lang="ts">
import { Languages } from 'lucide-vue-next'
import { isUiLocale, uiLocales } from '~/utils/ui-locale'

const { locale, setLocale } = useI18n()

const changeLocale = (event: Event) => {
  const target = event.target
  if (target instanceof HTMLSelectElement && isUiLocale(target.value)) {
    void setLocale(target.value)
  }
}
</script>

<style scoped>
.ui-language {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
}

.ui-language svg {
  position: absolute;
  left: 0.5rem;
  width: 1rem;
  height: 1rem;
  pointer-events: none;
}

.ui-language__label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

select {
  min-height: 2.75rem;
  max-width: 100%;
  padding: 0.5rem 0.25rem 0.5rem 1.75rem;
  border: 1px solid transparent;
  border-radius: 0.3rem;
  font: inherit;
  color: inherit;
  background-color: var(--color-surface);
  cursor: pointer;
}

select:hover {
  border-color: var(--color-border);
}

select:focus-visible {
  outline: 2px solid var(--color-heading);
  outline-offset: 2px;
}
</style>
