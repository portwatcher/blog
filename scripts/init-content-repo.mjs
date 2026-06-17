#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { constants as fsConstants } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDir, '..')
const templateDir = path.join(projectRoot, 'templates', 'content-repo')
const defaultTargetDir = path.resolve(projectRoot, '..', 'blog-content')

const usage = `Usage: pnpm content:init [options]

Scaffold a private blog content repository from templates/content-repo.

Options:
  --target <path>          Output directory. Defaults to ../blog-content.
  --app-repo <owner/repo>  Public app repository. Defaults to git origin.
  --content-repo <owner/repo>
                           Content repository name. Defaults to <owner>/blog-content.
  --branch <name>          Content branch. Defaults to main.
  --title <title>          Initial post title. Defaults to Welcome to my blog.
  --yes                    Accept defaults and do not prompt.
  --force                  Allow writing into a non-empty target directory.
  --no-git                 Do not initialize a git repository.
  --help                   Show this help.
`

const args = process.argv.slice(2)

const readOption = (name) => {
  const index = args.indexOf(name)
  if (index === -1) return undefined
  const value = args[index + 1]
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value`)
  }
  return value
}

if (args.includes('--help') || args.includes('-h')) {
  console.log(usage)
  process.exit(0)
}

const options = {
  target: readOption('--target'),
  appRepo: readOption('--app-repo'),
  contentRepo: readOption('--content-repo'),
  branch: readOption('--branch'),
  title: readOption('--title'),
  yes: args.includes('--yes') || args.includes('-y'),
  force: args.includes('--force'),
  git: !args.includes('--no-git'),
}

const run = (command, commandArgs, cwd = projectRoot) =>
  execFileSync(command, commandArgs, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()

const readGitConfig = (key, cwd = projectRoot) => {
  try {
    return run('git', ['config', '--get', key], cwd)
  } catch {
    return ''
  }
}

const parseGitHubRepo = (remote) => {
  const match = remote.match(/github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?$/)
  return match ? `${match[1]}/${match[2]}` : undefined
}

const detectAppRepo = () => {
  try {
    return parseGitHubRepo(run('git', ['config', '--get', 'remote.origin.url']))
  } catch {
    return undefined
  }
}

const isRepoName = (value) => /^[^/\s]+\/[^/\s]+$/.test(value)

const ask = async (rl, label, fallback) => {
  if (options.yes || !process.stdin.isTTY) return fallback
  const answer = await rl.question(`${label} [${fallback}]: `)
  return answer.trim() || fallback
}

const assertTemplateExists = async () => {
  try {
    await fs.access(templateDir, fsConstants.R_OK)
  } catch {
    throw new Error(`Template directory not found: ${templateDir}`)
  }
}

const assertTargetWritable = async (target) => {
  const entries = await fs.readdir(target).catch((error) => {
    if (error.code === 'ENOENT') return undefined
    throw error
  })

  if (entries && entries.length > 0 && !options.force) {
    throw new Error(`Target directory is not empty: ${target}\nChoose another --target or pass --force.`)
  }
}

const walkTemplate = async (dir) => {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...await walkTemplate(absolutePath))
    } else if (entry.isFile()) {
      files.push(absolutePath)
    }
  }

  return files
}

const applyPlaceholders = (value, placeholders) =>
  Object.entries(placeholders).reduce(
    (next, [key, replacement]) => next.replaceAll(`{{${key}}}`, replacement),
    value,
  )

const copyTemplate = async (target, placeholders) => {
  await fs.mkdir(target, { recursive: true })
  const files = await walkTemplate(templateDir)

  for (const source of files) {
    const relativePath = path.relative(templateDir, source)
    const targetPath = path.join(target, relativePath)
    const contents = await fs.readFile(source, 'utf8')

    await fs.mkdir(path.dirname(targetPath), { recursive: true })
    await fs.writeFile(targetPath, applyPlaceholders(contents, placeholders))
  }
}

const initGit = async (target, branch) => {
  try {
    await fs.access(path.join(target, '.git'))
    return
  } catch {
    // Continue with git init.
  }

  try {
    run('git', ['init', '-b', branch], target)
  } catch {
    run('git', ['init'], target)
    run('git', ['checkout', '-B', branch], target)
  }

  const userName = readGitConfig('user.name', target) || 'Blog Content Template'
  const userEmail = readGitConfig('user.email', target) || 'blog-content-template@example.invalid'

  run('git', ['config', 'user.name', userName], target)
  run('git', ['config', 'user.email', userEmail], target)
  run('git', ['add', '.'], target)
  run('git', ['commit', '-m', 'Initial blog content'], target)
}

const printNextSteps = ({ target, appRepo, contentRepo, branch }) => {
  console.log(`
Content repo scaffolded at:
  ${target}

Next steps:
  cd ${target}
  gh repo create ${contentRepo} --private --source . --remote origin --push

Configure the app runtime, not the public app image build:
  NUXT_PUBLIC_CMS_CONTENT_REPO=${contentRepo}
  NUXT_PUBLIC_CMS_CONTENT_BRANCH=${branch}
  BLOG_CONTENT_AUTH_TOKEN=<token with read access to ${contentRepo}>

Local app development:
  cd ${projectRoot}
  NUXT_PUBLIC_CMS_CONTENT_REPO=${contentRepo} NUXT_PUBLIC_CMS_CONTENT_BRANCH=${branch} BLOG_CONTENT_AUTH_TOKEN=<token> pnpm dev
`)
}

await assertTemplateExists()

const detectedAppRepo = options.appRepo || detectAppRepo() || 'owner/blog'
const detectedOwner = detectedAppRepo.split('/')[0] || 'owner'
const defaultContentRepo = options.contentRepo || `${detectedOwner}/blog-content`
const rl = createInterface({ input, output })

try {
  const target = path.resolve(await ask(rl, 'Target directory', options.target || defaultTargetDir))
  const appRepo = await ask(rl, 'Public app repository', detectedAppRepo)
  const contentRepo = await ask(rl, 'Private content repository', defaultContentRepo)
  const branch = await ask(rl, 'Content branch', options.branch || 'main')
  const title = await ask(rl, 'Initial post title', options.title || 'Welcome to my blog')
  const today = new Date().toISOString().slice(0, 10)

  if (!isRepoName(appRepo)) {
    throw new Error(`App repository must use owner/repo format: ${appRepo}`)
  }

  if (!isRepoName(contentRepo)) {
    throw new Error(`Content repository must use owner/repo format: ${contentRepo}`)
  }

  await assertTargetWritable(target)
  await copyTemplate(target, {
    BLOG_APP_REPOSITORY: appRepo,
    BLOG_CONTENT_REPOSITORY: contentRepo,
    BLOG_CONTENT_BRANCH: branch,
    POST_TITLE: title,
    POST_DATE: `${today} 09:00`,
  })

  if (options.git) {
    await initGit(target, branch)
  }

  printNextSteps({ target, appRepo, contentRepo, branch })
} finally {
  rl.close()
}
