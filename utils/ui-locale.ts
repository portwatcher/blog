export const uiLocales = [
  { code: 'en', label: 'English' },
  { code: 'zh', label: '中文' },
  { code: 'ja', label: '日本語' },
] as const

export type UiLocale = typeof uiLocales[number]['code']

export const uiLocaleStorageKey = 'blog-ui-locale'

export const isUiLocale = (value: unknown): value is UiLocale =>
  uiLocales.some(({ code }) => code === value)
