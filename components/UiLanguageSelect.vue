<template>
  <label class="ui-language">
    <Languages class="ui-language__icon" aria-hidden="true" />
    <span class="ui-language__label">{{ $t('uiLanguage') }}</span>
    <select v-model="selectedLocale">
      <option
        v-for="language in uiLocales"
        :key="language.code"
        :value="language.code"
        :lang="language.code"
      >
        {{ language.label }}
      </option>
    </select>
    <ChevronDown class="ui-language__chevron" aria-hidden="true" />
  </label>
</template>

<script setup lang="ts">
import { ChevronDown, Languages } from 'lucide-vue-next'
import { isUiLocale, uiLocales } from '~/utils/ui-locale'

const { locale, setLocale } = useI18n()

const selectedLocale = computed({
  get: () => locale.value,
  set: (value: string) => {
    if (isUiLocale(value)) {
      void setLocale(value)
    }
  },
})
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
  width: 0.875rem;
  height: 0.875rem;
  pointer-events: none;
}

.ui-language__icon {
  left: 0.375rem;
}

.ui-language .ui-language__chevron {
  right: 0.375rem;
  width: 0.75rem;
  height: 0.75rem;
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
  appearance: none;
  min-height: 2.75rem;
  max-width: 100%;
  padding: 0.5rem 1.5rem;
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
