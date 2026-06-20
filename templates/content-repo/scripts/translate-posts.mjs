import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..')

const languageNames = new Map([
  ['en', 'English'],
  ['ja', 'Japanese'],
  ['zh', 'Chinese'],
  ['zh-CN', 'Simplified Chinese'],
  ['zh-TW', 'Traditional Chinese'],
])
const normalizedLanguageNames = new Map(
  Array.from(languageNames, ([code, name]) => [code.toLowerCase(), name]),
)

const firstEnv = (...names) => {
  for (const name of names) {
    const value = process.env[name]
    if (value && value.trim()) return value.trim()
  }
  return ''
}

const parseCsv = (value, fallback = []) => {
  const items = String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  return items.length > 0 ? items : fallback
}

const numberEnv = (name, fallback) => {
  const value = Number(process.env[name] || 0)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

const config = {
  apiKey: firstEnv('TRANSLATION_OPENAI_API_KEY', 'OPENAI_API_KEY'),
  baseUrl: firstEnv('TRANSLATION_OPENAI_BASE_URL', 'OPENAI_BASE_URL') || 'https://api.openai.com/v1',
  model: firstEnv('TRANSLATION_OPENAI_MODEL', 'OPENAI_MODEL') || 'gpt-4o-mini',
  languages: parseCsv(process.env.TRANSLATION_LANGUAGES, ['zh', 'en', 'ja']),
  sourceLangCode: process.env.TRANSLATION_SOURCE_LANG || '',
  sourceLanguage: process.env.TRANSLATION_SOURCE_LANGUAGE || 'Chinese',
  postsDir: process.env.TRANSLATION_POSTS_DIR || 'posts',
  outputDir: process.env.TRANSLATION_OUTPUT_DIR || 'translations',
  force: process.env.TRANSLATION_FORCE === 'true' || process.argv.includes('--force'),
  maxArticles: Number(process.env.TRANSLATION_MAX_ARTICLES || 0),
  bodyChunkChars: numberEnv('TRANSLATION_BODY_CHUNK_CHARS', 6000),
  requestTimeoutMs: numberEnv('TRANSLATION_REQUEST_TIMEOUT_MS', 180000),
  maxRetries: numberEnv('TRANSLATION_MAX_RETRIES', 3),
}

const chatCompletionsUrl = (baseUrl) => {
  const trimmed = baseUrl.replace(/\/+$/, '')
  return trimmed.endsWith('/chat/completions') ? trimmed : `${trimmed}/chat/completions`
}

const normalizeLanguage = (lang) => String(lang || '').trim().toLowerCase()
const languageBase = (lang) => normalizeLanguage(lang).split('-')[0]
const languagesAlign = (left, right) => {
  const normalizedLeft = normalizeLanguage(left)
  const normalizedRight = normalizeLanguage(right)

  return normalizedLeft === normalizedRight || languageBase(normalizedLeft) === languageBase(normalizedRight)
}

const getLanguageName = (lang) =>
  normalizedLanguageNames.get(normalizeLanguage(lang)) ||
  normalizedLanguageNames.get(languageBase(lang)) ||
  String(lang || '')

const sha256 = (value) => createHash('sha256').update(value).digest('hex')

const walkMarkdownFiles = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const files = []

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue

    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...await walkMarkdownFiles(path))
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(path)
    }
  }

  return files.sort()
}

const splitFrontmatter = (content, path) => {
  if (!content.startsWith('---\n')) {
    throw new Error(`${path} does not start with YAML frontmatter`)
  }

  const end = content.indexOf('\n---', 4)
  if (end === -1) {
    throw new Error(`${path} has unterminated YAML frontmatter`)
  }

  const closeEnd = content.indexOf('\n', end + 4)
  return {
    frontmatter: content.slice(4, end),
    body: closeEnd === -1 ? '' : content.slice(closeEnd + 1),
  }
}

const parseFrontmatterString = (frontmatter, key) => {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = frontmatter.match(new RegExp(`^${escaped}\\s*:\\s*(.*)$`, 'm'))
  if (!match) return ''

  const value = match[1].trim()
  if (!value) return ''
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}

const yamlString = (value) => JSON.stringify(String(value ?? ''))

const upsertFrontmatterValue = (frontmatter, key, value) => {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const line = `${key}: ${yamlString(value)}`
  const pattern = new RegExp(`^${escaped}\\s*:.*$`, 'm')

  if (pattern.test(frontmatter)) {
    return frontmatter.replace(pattern, line)
  }

  return `${frontmatter.replace(/\s*$/, '')}\n${line}\n`
}

const parseJsonResponse = (content) => {
  const trimmed = String(content || '').trim()
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()

  return JSON.parse(withoutFence)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const isRetryableError = (error) => {
  const status = error?.status || 0
  const code = error?.cause?.code || error?.code || ''

  return (
    status === 429 ||
    status >= 500 ||
    error?.name === 'AbortError' ||
    code === 'UND_ERR_HEADERS_TIMEOUT' ||
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    code === 'UND_ERR_SOCKET' ||
    /fetch failed|timeout|terminated/i.test(String(error?.message || ''))
  )
}

const fetchChatCompletion = async (requestBody) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs)

  try {
    return await fetch(chatCompletionsUrl(config.baseUrl), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

const requestTranslationOnce = async (
  { lang, sourceLanguage = config.sourceLanguage, title, description, body },
  useResponseFormat = true,
) => {
  const targetLanguage = getLanguageName(lang) || lang
  const requestBody = {
    model: config.model,
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content: [
          'You translate blog articles while preserving Markdown, MDC, HTML, math, code fences, inline code, URLs, image links, video tags, and component syntax.',
          'Translate prose only. Do not translate code identifiers, URLs, file paths, or frontmatter keys.',
          'Return only strict JSON with string fields: title, description, body.',
        ].join(' '),
      },
      {
        role: 'user',
        content: JSON.stringify({
          sourceLanguage,
          targetLanguage,
          targetLanguageCode: lang,
          title,
          description,
          body,
        }),
      },
    ],
  }

  if (useResponseFormat) {
    requestBody.response_format = { type: 'json_object' }
  }

  const response = await fetchChatCompletion(requestBody)

  if (!response.ok) {
    const errorText = await response.text()

    if (useResponseFormat && [400, 404, 422].includes(response.status)) {
      return requestTranslation({ lang, sourceLanguage, title, description, body }, false)
    }

    const error = new Error(`Translation request failed: ${response.status} ${errorText}`)
    error.status = response.status
    throw error
  }

  const payload = await response.json()
  const content = payload?.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('Translation response did not include choices[0].message.content')
  }

  const translated = parseJsonResponse(content)
  return {
    title: String(translated.title || title),
    description: String(translated.description || description || ''),
    body: String(translated.body || body || ''),
  }
}

const requestTranslation = async (input, useResponseFormat = true) => {
  let lastError

  for (let attempt = 1; attempt <= config.maxRetries; attempt += 1) {
    try {
      return await requestTranslationOnce(input, useResponseFormat)
    } catch (error) {
      lastError = error

      if (!isRetryableError(error) || attempt === config.maxRetries) {
        throw error
      }

      const delay = attempt * 2000
      console.warn(`Transient translation failure; retrying in ${delay / 1000}s (${attempt}/${config.maxRetries})`)
      await sleep(delay)
    }
  }

  throw lastError
}

const splitLongPart = (part, maxChars) => {
  if (part.length <= maxChars) return [part]

  const chunks = []
  let current = ''

  for (const line of part.split(/(?<=\n)/)) {
    if (line.length > maxChars) {
      if (current) {
        chunks.push(current)
        current = ''
      }

      for (let index = 0; index < line.length; index += maxChars) {
        chunks.push(line.slice(index, index + maxChars))
      }
      continue
    }

    if (current && current.length + line.length > maxChars) {
      chunks.push(current)
      current = line
    } else {
      current += line
    }
  }

  if (current) chunks.push(current)
  return chunks
}

const splitBodyChunks = (body) => {
  if (!body || body.length <= config.bodyChunkChars) return [body || '']

  const parts = body.split(/(\n{2,})/)
  const blocks = []
  for (let index = 0; index < parts.length; index += 2) {
    blocks.push(`${parts[index] || ''}${parts[index + 1] || ''}`)
  }

  const chunks = []
  let current = ''

  for (const block of blocks.flatMap((part) => splitLongPart(part, config.bodyChunkChars))) {
    if (current && current.length + block.length > config.bodyChunkChars) {
      chunks.push(current)
      current = block
    } else {
      current += block
    }
  }

  if (current) chunks.push(current)
  return chunks
}

const translateArticle = async ({ lang, sourceLanguage, title, description, body }) => {
  const bodyChunks = splitBodyChunks(body)
  if (bodyChunks.length === 1) {
    return requestTranslation({ lang, sourceLanguage, title, description, body })
  }

  console.log(`Chunking body into ${bodyChunks.length} requests`)
  const metadata = await requestTranslation({ lang, sourceLanguage, title, description, body: '' })
  const translatedChunks = []

  for (let index = 0; index < bodyChunks.length; index += 1) {
    console.log(`Translating body chunk ${index + 1}/${bodyChunks.length}`)
    const translated = await requestTranslation({
      lang,
      sourceLanguage,
      title,
      description: '',
      body: bodyChunks[index],
    })
    translatedChunks.push(translated.body)
  }

  return {
    title: metadata.title,
    description: metadata.description,
    body: translatedChunks.join('').trim(),
  }
}

const translateFile = async (sourcePath) => {
  const sourceContent = await readFile(sourcePath, 'utf8')
  const sourceHash = sha256(sourceContent)
  const sourceRelativePath = relative(rootDir, sourcePath).replaceAll('\\', '/')
  const postRelativePath = relative(join(rootDir, config.postsDir), sourcePath).replaceAll('\\', '/')
  const { frontmatter, body } = splitFrontmatter(sourceContent, sourceRelativePath)
  const title = parseFrontmatterString(frontmatter, 'title')
  const description = parseFrontmatterString(frontmatter, 'description')
  const sourceLang = parseFrontmatterString(frontmatter, 'lang') || config.sourceLangCode
  const sourceLanguage = sourceLang ? getLanguageName(sourceLang) : config.sourceLanguage
  let changed = false

  if (!title) {
    console.log(`Skipping ${sourceRelativePath}: missing title`)
    return false
  }

  for (const lang of config.languages) {
    const outputPath = join(rootDir, config.outputDir, lang, postRelativePath)
    const existing = await readFile(outputPath, 'utf8').catch(() => '')

    if (sourceLang && languagesAlign(lang, sourceLang)) {
      if (existing) {
        await rm(outputPath)
        console.log(`Removed same-language translation: ${relative(rootDir, outputPath)}`)
        changed = true
      } else {
        console.log(`Skipping ${sourceRelativePath} -> ${lang}: source language is ${sourceLang}`)
      }
      continue
    }

    if (existing && !config.force) {
      const existingFrontmatter = splitFrontmatter(existing, outputPath).frontmatter
      if (parseFrontmatterString(existingFrontmatter, 'sourceHash') === sourceHash) {
        console.log(`Current: ${relative(rootDir, outputPath)}`)
        continue
      }
    }

    console.log(`Translating ${sourceRelativePath} -> ${lang}`)
    const translated = await translateArticle({ lang, sourceLanguage, title, description, body })
    let outputFrontmatter = frontmatter
    outputFrontmatter = upsertFrontmatterValue(outputFrontmatter, 'title', translated.title)
    outputFrontmatter = upsertFrontmatterValue(outputFrontmatter, 'description', translated.description)
    outputFrontmatter = upsertFrontmatterValue(outputFrontmatter, 'lang', lang)
    outputFrontmatter = upsertFrontmatterValue(outputFrontmatter, 'sourcePath', sourceRelativePath)
    outputFrontmatter = upsertFrontmatterValue(outputFrontmatter, 'sourceHash', sourceHash)
    outputFrontmatter = upsertFrontmatterValue(outputFrontmatter, 'originalTitle', title)

    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, `---\n${outputFrontmatter.trim()}\n---\n\n${translated.body.trim()}\n`, 'utf8')
    changed = true
  }

  return changed
}

const main = async () => {
  if (!config.apiKey) {
    console.log('Skipping translation: TRANSLATION_OPENAI_API_KEY is not configured.')
    return
  }

  if (config.languages.length === 0) {
    console.log('Skipping translation: TRANSLATION_LANGUAGES did not include any languages.')
    return
  }

  const postFiles = await walkMarkdownFiles(join(rootDir, config.postsDir))
  const limitedPostFiles = config.maxArticles > 0 ? postFiles.slice(0, config.maxArticles) : postFiles
  let changed = false

  for (const postFile of limitedPostFiles) {
    changed = await translateFile(postFile) || changed
  }

  console.log(changed ? 'Translations updated.' : 'Translations already current.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
