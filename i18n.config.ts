export default defineI18nConfig(() => ({
  datetimeFormats: {
    en: {
      short: {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      },
      long: {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        weekday: 'short',
        hour: 'numeric',
        minute: 'numeric',
      },
    },
    ja: {
      short: {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      },
      long: {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        weekday: 'short',
        hour: 'numeric',
        minute: 'numeric',
        hour12: true,
      },
    },
    zh: {
      short: {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      },
    },
  },
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
      book: 'Books',
      tv: 'Dramas',
      movie: 'Movies',
      loadMore: 'Load More',
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
      book: '书',
      tv: '剧',
      movie: '影',
      loadMore: '更多',
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
      book: '本',
      tv: '番組',
      movie: '映画',
      loadMore: 'さらに',
    },
  },
  fallbackLocale: 'en',
}))
