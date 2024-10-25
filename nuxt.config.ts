// https://nuxt.com/docs/api/configuration/nuxt-config
import { type GiscusProps } from '@giscus/vue'

export default defineNuxtConfig({
  devtools: { enabled: true },
  modules: [
    '@nuxt/content',
    '@nuxtjs/i18n',
    'v-plausible',
    '@nuxt/image',
    '@nuxtjs/tailwindcss',
    'shadcn-nuxt',
  ],
  css: ['@/public/fonts.css'],
  componentDir: './components/ui',
  devServer: {
    host: '0.0.0.0',
  },
  plugins: [
    {
      src: '~/plugins/router-nprogress.ts',
      mode: 'client',
    },
  ],
  app: {
    head: {
      charset: 'utf-8',
      viewport: 'width=device-width, initial-scale=1, user-scalable=no',
    },
  },
  content: {
    markdown: {
      rehypePlugins: ['rehype-mathjax'],
      remarkPlugins: ['remark-math'],
    },
    highlight: {
      theme: 'github-light',
      langs: [
        'dockerfile',
        'shell',
        'js',
        'ts',
        'gdscript',
        'yaml',
        'json',
        'c++',
        'csharp',
        'java',
        'ruby',
        'rust',
        'python',
        'go',
      ],
    },
  },
  $development: {
    plausible: {
      init: {
        domain: 'localhost',
        apiHost: 'https://plausible.io',
      },
    },
    runtimeConfig: {
      password: 'password',
      neodbKey: '',
      public: {
        title: 'blog',
        description: 'this is my blog',
        host: 'http://localhost:3000',
        giscus: {
          repo: 'giscus/giscus',
          repoId: 'MDEwOlJlcG9zaXRvcnkzNTE5NTgwNTM=',
          categoryId: 'DIC_kwDOFjH-684Cf9nP',
          mapping: 'specific',
          theme: 'preferred_color_scheme',
          strict: '1',
          inputPosition: 'bottom',
          emitMetadata: '0',
          reactionsEnabled: '1',
        } as GiscusProps,
      },
    },
  },
  // make your own $production runtimeConfig
  i18n: {
    vueI18n: './i18n.config.ts',
  },
})
