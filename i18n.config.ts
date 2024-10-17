export default defineI18nConfig(() => ({
  messages: {
    en: {
      home: 'Home',
      archive: 'Archive',
      feed: 'Feed',
      neodb: {
        complete: 'Enjoyed',
        wishlist: 'Plan to Try',
        progress: 'Enjoying',
      },
      shelf: 'Shelf',
    },
    zh: {
      home: '首页',
      archive: '归档',
      feed: '订阅',
      neodb: {
        complete: '已看过',
        wishlist: '准备看',
        progress: '正在看',
      },
      shelf: '书单',
    },
    ja: {
      home: 'トップ',
      archive: 'アーカイブ',
      feed: 'フィード',
      neodb: {
        complete: '観たことある',
        wishlist: '観るつもり',
        progress: '観てる',
      },
      shelf: '本棚',
    },
  },
  fallbackLocale: 'en',
}))
