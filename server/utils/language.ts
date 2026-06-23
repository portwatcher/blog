interface ArticleLanguageInput {
  title?: unknown
  description?: unknown
  body?: unknown
}

interface LanguageSignalCounts {
  kana: number
  han: number
  latin: number
}

const maxBodyDetectionChars = 30000

const stripMarkdownNoise = (value: unknown) =>
  String(value || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/~~~[\s\S]*?~~~/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')

const countLanguageSignals = (value: string): LanguageSignalCounts => {
  const counts = {
    kana: 0,
    han: 0,
    latin: 0,
  }

  for (const character of value) {
    if (/^[\u3040-\u309f\u30a0-\u30ff\u31f0-\u31ff]$/u.test(character)) {
      counts.kana += 1
    } else if (/^[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]$/u.test(character)) {
      counts.han += 1
    } else if (/^[A-Za-z]$/.test(character)) {
      counts.latin += 1
    }
  }

  return counts
}

export const detectArticleLanguage = (input: ArticleLanguageInput) => {
  const title = stripMarkdownNoise(input.title)
  const description = stripMarkdownNoise(input.description)
  const body = stripMarkdownNoise(String(input.body || '').slice(0, maxBodyDetectionChars))
  const titleCounts = countLanguageSignals(title)
  const weightedText = [
    title,
    title,
    title,
    title,
    title,
    description,
    description,
    description,
    body,
  ].join('\n')
  const counts = countLanguageSignals(weightedText)
  const cjkCount = counts.kana + counts.han
  const kanaRatio = counts.kana / Math.max(1, cjkCount)

  if (titleCounts.kana >= 2 && counts.kana >= 3) return 'ja'
  if (counts.kana >= 80 && kanaRatio >= 0.2) return 'ja'
  if (counts.kana >= 20 && kanaRatio >= 0.35) return 'ja'
  if (counts.han >= 8 && counts.han >= counts.latin * 0.35) return 'zh'
  if (counts.latin >= 20 && counts.latin >= cjkCount * 1.5) return 'en'

  return ''
}
