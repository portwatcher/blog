// https://nuxt.com/docs/api/configuration/nuxt-config
import { type GiscusProps } from '@giscus/vue'
import Aura from '@primevue/themes/aura'
import { definePreset } from '@primevue/themes'

const BlogPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '{neutral.50}',
      100: '{neutral.100}',
      200: '{neutral.200}',
      300: '{neutral.300}',
      400: '{neutral.400}',
      500: '{neutral.500}',
      600: '{neutral.600}',
      700: '{neutral.700}',
      800: '{neutral.800}',
      900: '{neutral.900}',
      950: '{neutral.950}',
    },
  },
})

export default defineNuxtConfig({
  devtools: { enabled: true },
  modules: [
    '@nuxt/content',
    '@nuxtjs/i18n',
    '@nuxt/image',
    '@primevue/nuxt-module',
  ],
  css: ['@/public/fonts.css'],
  primevue: {
    options: {
      theme: {
        preset: BlogPreset,
        options: {
          prefix: 'p',
          darkModeSelector: 'none',
        },
      },
    },
  },
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
      viewport: 'width=device-width, initial-scale=1',
    },
  },
  content: {
    build: {
      markdown: {
        rehypePlugins: {
          'rehype-mathjax': {},
        },
        remarkPlugins: {
          'remark-math': {},
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
            'cpp',
            'csharp',
            'java',
            'ruby',
            'rust',
            'python',
            'go',
          ],
        },
      },
    },
  },
  runtimeConfig: {
    password: '',
    neodbKey: '',
    cmsUploadToken: '',
    s3Bucket: '',
    s3Region: 'us-east-1',
    s3Endpoint: '',
    s3AccessKeyId: '',
    s3SecretAccessKey: '',
    s3ForcePathStyle: false,
    s3KeyPrefix: 'blog-media',
    s3MultipartPartSizeMb: 10,
    s3MaxUploadMb: 2048,
    s3AllowedContentTypes: 'image/,video/',
    cmsLfsBackupEnabled: false,
    cmsLfsRepository: '',
    cmsLfsBranch: '',
    cmsLfsMediaDir: 'media',
    cmsLfsAuthUsername: '',
    cmsLfsAuthToken: '',
    cmsLfsAuthorName: 'Blog CMS',
    cmsLfsAuthorEmail: 'blog-cms@example.invalid',
    cmsLfsCommitMessagePrefix: 'Backup media',
    cmsAdminToken: '',
    cmsGithubAuthToken: '',
    cmsGithubOAuthClientId: '',
    cmsGithubOAuthClientSecret: '',
    cmsGithubOAuthScope: 'repo',
    public: {
      mediaBaseUrl: '',
      cmsAuthMode: 'proxy-token',
      cmsBackendName: 'github',
      cmsContentRepo: '',
      cmsContentBranch: 'main',
      cmsBaseUrl: '',
      cmsAuthEndpoint: '',
      cmsApiRoot: '',
      cmsLocalBackend: false,
      translationLanguages: 'zh,en,ja',
      originalLanguage: 'zh',
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
  $development: {
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
    locales: ['en', 'zh', 'ja'],
    defaultLocale: 'en',
    strategy: 'no_prefix',
    detectBrowserLanguage: false,
    vueI18n: 'i18n.config.ts',
  },
  compatibilityDate: '2024-10-28',
})
