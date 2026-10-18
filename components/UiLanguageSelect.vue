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
  font-size: 0.75rem;
  color: var(--color-muted);
}

.ui-language svg {
  position: absolute;
  width: 0.625rem;
  height: 0.625rem;
  stroke-width: 1.5;
  pointer-events: none;
}

.ui-language .ui-language__icon {
  left: 0.25rem;
  width: 0.75rem;
  height: 0.75rem;
}

.ui-language__chevron {
  right: 0.25rem;
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
  padding: 0.5rem 1.25rem;
  border: 1px solid transparent;
  border-radius: 0.3rem;
  font: inherit;
  color: inherit;
  background-color: transparent;
  cursor: pointer;
}

select:hover {
  color: var(--color-text);
}

select:focus-visible {
  outline: 2px solid var(--color-heading);
  outline-offset: 2px;
}
</style>
