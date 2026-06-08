export const capitalize = function (str: string) {
  return str.replace(/\w\S*/g, function (txt) {
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
  })
}

export const getArticleRouteTitle = (article: Pick<Article, 'title' | 'originalTitle'>) =>
  article.originalTitle || article.title

export const ITEMS_PER_PAGE = 20
