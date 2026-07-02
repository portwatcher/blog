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

const automationChoices = [
  {
    value: 'content',
    label: 'Content only',
    description: 'Markdown, categories, media, and translations folders; no GitHub Actions workflow.',
  },
  {
    value: 'translate',
    label: 'Generated translations',
    description: 'Adds a workflow and script that generate translations when an API key is configured.',
  },
  {
    value: 'build',
    label: 'Translations + image build',
    description: 'Also dispatches the app repo image workflow after content changes.',
  },
  {
    value: 'deploy',
    label: 'Translations + build + deploy',
    description: 'Also updates a GitOps manifest or rolls out a Kubernetes deployment.',
  },
]

const deployModeChoices = [
  {
    value: 'gitops',
    label: 'GitOps / Argo CD',
    description: 'Updates an image tag in a separate deployment repo.',
  },
  {
    value: 'kubectl',
    label: 'Direct kubectl',
    description: 'Uses a kubeconfig secret to update the running deployment directly.',
  },
  {
    value: 'either',
    label: 'GitOps with fallback',
    description: 'Uses GitOps when configured, otherwise falls back to kubectl.',
  },
]

const visibilityChoices = [
  {
    value: 'private',
    label: 'Private',
    description: 'Recommended for personal content, drafts, deployment variables, and generated translations.',
  },
  {
    value: 'public',
    label: 'Public',
    description: 'Use only when the content repo should be visible to everyone.',
  },
  {
    value: 'internal',
    label: 'Internal',
    description: 'For GitHub Enterprise organizations that support internal repositories.',
  },
]

const usage = `Usage: pnpm content:init [options]

Scaffold a blog content repository from templates/content-repo.

Interactive usage:
  pnpm content:init

Non-interactive usage:
  pnpm content:init --yes --target ../my-blog-content --app-repo owner/blog --content-repo owner/blog-content

Options:
  --target <path>             Output directory. Defaults to ../blog-content.
  --app-repo <owner/repo>     Public app repository. Defaults to git origin.
  --content-repo <owner/repo> Content repository name. Defaults to <owner>/blog-content.
  --branch <name>             Content branch. Defaults to main.
  --title <title>             Initial post title. Defaults to Welcome to my blog.
  --automation <mode>         content, translate, build, or deploy. Defaults to content.
  --deploy-mode <mode>        gitops, kubectl, or either. Used with --automation deploy.
  --app-image <image>         Container image name. Defaults to ghcr.io/<app-repo>.
  --github                    Create or connect the GitHub repo with gh and push.
  --no-github                 Do not create or push a GitHub repo. Default for --yes.
  --visibility <visibility>   private, public, or internal. Used with --github.
  --force                     Allow writing into a non-empty target directory.
  --no-git                    Do not initialize a git repository.
  --yes                       Accept defaults and do not prompt.
  --help                      Show this help.
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

const hasFlag = (name) => args.includes(name)

if (hasFlag('--help') || hasFlag('-h')) {
  console.log(usage)
  process.exit(0)
}

const normalizeChoice = (value, aliases = {}) => {
  const normalized = String(value || '').trim().toLowerCase()
  return aliases[normalized] || normalized
}

const normalizeAutomation = (value) =>
  normalizeChoice(value, {
    none: 'content',
    'content-only': 'content',
    translation: 'translate',
    translations: 'translate',
    image: 'build',
    dispatch: 'build',
    deployment: 'deploy',
  })

const normalizeDeployMode = (value) =>
  normalizeChoice(value, {
    argocd: 'gitops',
    argo: 'gitops',
    git: 'gitops',
    kube: 'kubectl',
    kubernetes: 'kubectl',
    fallback: 'either',
    both: 'either',
  })

const normalizeVisibility = (value) => normalizeChoice(value)

const options = {
  target: readOption('--target'),
  appRepo: readOption('--app-repo'),
  contentRepo: readOption('--content-repo'),
  branch: readOption('--branch'),
  title: readOption('--title'),
  automation: readOption('--automation'),
  deployMode: readOption('--deploy-mode'),
  appImage: readOption('--app-image'),
  github:
    hasFlag('--github') ? true :
      hasFlag('--no-github') ? false :
        undefined,
  visibility: readOption('--visibility'),
  yes: hasFlag('--yes') || hasFlag('-y'),
  force: hasFlag('--force'),
  git: !hasFlag('--no-git'),
}

const run = (command, commandArgs, cwd = projectRoot) =>
  execFileSync(command, commandArgs, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()

const runInherit = (command, commandArgs, cwd = projectRoot) =>
  execFileSync(command, commandArgs, {
    cwd,
    stdio: 'inherit',
  })

const commandExists = (command) => {
  try {
    run(command, ['--version'])
    return true
  } catch {
    return false
  }
}

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

const assertChoice = (value, choices, label) => {
  const validValues = new Set(choices.map((choice) => choice.value))
  if (!validValues.has(value)) {
    throw new Error(`${label} must be one of: ${Array.from(validValues).join(', ')}`)
  }
}

const ask = async (rl, label, fallback) => {
  if (options.yes || !process.stdin.isTTY) return fallback
  const answer = await rl.question(`${label} [${fallback}]: `)
  return answer.trim() || fallback
}

const confirm = async (rl, label, fallback = false) => {
  if (options.yes || !process.stdin.isTTY) return fallback
  const suffix = fallback ? '[Y/n]' : '[y/N]'

  while (true) {
    const answer = (await rl.question(`${label} ${suffix}: `)).trim().toLowerCase()
    if (!answer) return fallback
    if (['y', 'yes'].includes(answer)) return true
    if (['n', 'no'].includes(answer)) return false
    console.log('Please answer yes or no.')
  }
}

const select = async (rl, label, choices, fallback) => {
  assertChoice(fallback, choices, label)

  if (options.yes || !process.stdin.isTTY) return fallback

  console.log(`\n${label}:`)
  choices.forEach((choice, index) => {
    const defaultMarker = choice.value === fallback ? ' (default)' : ''
    console.log(`  ${index + 1}. ${choice.label}${defaultMarker}`)
    console.log(`     ${choice.description}`)
  })

  while (true) {
    const answer = (await rl.question(`Choose 1-${choices.length} [${choices.findIndex((choice) => choice.value === fallback) + 1}]: `)).trim()
    if (!answer) return fallback

    const asIndex = Number(answer)
    if (Number.isInteger(asIndex) && asIndex >= 1 && asIndex <= choices.length) {
      return choices[asIndex - 1].value
    }

    const normalized = normalizeChoice(answer)
    const matchingChoice = choices.find((choice) => choice.value === normalized)
    if (matchingChoice) return matchingChoice.value

    console.log(`Please choose a number from 1-${choices.length}.`)
  }
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

const automationFileModes = new Map([
  ['.github/workflows/deploy-blog.yml', new Set(['translate', 'build', 'deploy'])],
  ['scripts/translate-posts.mjs', new Set(['translate', 'build', 'deploy'])],
])

const shouldCopyTemplateFile = (relativePath, automation) => {
  const allowedModes = automationFileModes.get(relativePath.replaceAll(path.sep, '/'))
  return !allowedModes || allowedModes.has(automation)
}

const copyTemplate = async (target, placeholders, automation) => {
  await fs.mkdir(target, { recursive: true })
  const files = await walkTemplate(templateDir)

  for (const source of files) {
    const relativePath = path.relative(templateDir, source)
    if (!shouldCopyTemplateFile(relativePath, automation)) continue

    const targetPath = path.join(target, relativePath)
    const contents = await fs.readFile(source, 'utf8')

    await fs.mkdir(path.dirname(targetPath), { recursive: true })
    await fs.writeFile(targetPath, applyPlaceholders(contents, placeholders))
  }
}

const gitHasRepository = async (target) => {
  try {
    await fs.access(path.join(target, '.git'))
    return true
  } catch {
    return false
  }
}

const hasStagedChanges = (target) => {
  try {
    run('git', ['diff', '--cached', '--quiet'], target)
    return false
  } catch {
    return true
  }
}

const initGit = async (target, branch) => {
  if (await gitHasRepository(target)) {
    console.log('Existing git repository detected; leaving commit creation to you.')
    return
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

  if (hasStagedChanges(target)) {
    run('git', ['commit', '-m', 'Initial blog content'], target)
  }
}

const repoExistsOnGitHub = (contentRepo) => {
  try {
    run('gh', ['repo', 'view', contentRepo, '--json', 'nameWithOwner', '--jq', '.nameWithOwner'])
    return true
  } catch {
    return false
  }
}

const setOriginIfMissing = (target, contentRepo) => {
  const existingOrigin = readGitConfig('remote.origin.url', target)
  if (existingOrigin) return
  run('git', ['remote', 'add', 'origin', `https://github.com/${contentRepo}.git`], target)
}

const createOrPushGitHubRepo = ({ target, contentRepo, branch, visibility }) => {
  if (!commandExists('gh')) {
    throw new Error('The GitHub CLI is not installed. Install gh or rerun without --github.')
  }

  if (!commandExists('git')) {
    throw new Error('git is not installed. Install git or rerun without --github.')
  }

  if (!(repoExistsOnGitHub(contentRepo))) {
    const visibilityFlag = visibility === 'public' ? '--public' : visibility === 'internal' ? '--internal' : '--private'
    runInherit('gh', ['repo', 'create', contentRepo, visibilityFlag, '--source', '.', '--remote', 'origin', '--push'], target)
    return
  }

  console.log(`GitHub repository ${contentRepo} already exists; adding origin if needed and pushing ${branch}.`)
  setOriginIfMissing(target, contentRepo)
  runInherit('git', ['push', '-u', 'origin', branch], target)
}

const printAutomationNextSteps = ({ automation, deployMode, appRepo, appImage }) => {
  if (automation === 'content') return ''

  const lines = [
    '',
    'Content repo automation:',
    `  BLOG_AUTOMATION_MODE=${automation}`,
    `  BLOG_APP_REPOSITORY=${appRepo}`,
    '  BLOG_APP_WORKFLOW_FILE=build-image.yml',
    '  BLOG_DISPATCH_EVENT=blog-content-updated',
    `  BLOG_IMAGE=${appImage}`,
    '  TRANSLATION_LANGUAGES=zh,en,ja',
    '  TRANSLATION_SOURCE_LANG=zh',
    '  TRANSLATION_SOURCE_LANGUAGE=Chinese',
    '',
    'Optional runtime refresh variables/secrets:',
    '  BLOG_REFRESH_URL=https://your-blog.example.com/api/cms/content/refresh',
    '  BLOG_REFRESH_TOKEN=<blog CMS admin token>',
    '',
    'Optional translation secrets:',
    '  TRANSLATION_OPENAI_API_KEY=<openai-compatible-api-key>',
    '  TRANSLATION_OPENAI_BASE_URL=https://api.openai.com/v1',
  ]

  if (automation === 'build' || automation === 'deploy') {
    lines.push(
      '',
      'Required build dispatch secret:',
      `  BLOG_DEPLOY_DISPATCH_TOKEN=<token that can dispatch ${appRepo} and read its workflow runs>`,
    )
  }

  if (automation === 'deploy') {
    lines.push('', `Deployment mode: ${deployMode}`)

    if (deployMode === 'gitops' || deployMode === 'either') {
      lines.push(
        '',
        'GitOps deployment variables/secrets:',
        '  ARGOCD_REPO_TOKEN=<token with write access to the deployment repo>',
        '  ARGOCD_REPO=owner/infra',
        '  ARGOCD_BRANCH=main',
        '  ARGOCD_BLOG_DEPLOYMENT=path/to/deployment.yaml',
      )
    }

    if (deployMode === 'kubectl' || deployMode === 'either') {
      lines.push(
        '',
        'Direct kubectl deployment variables/secrets:',
        '  KUBE_CONFIG=<plain or base64 kubeconfig>',
        '  KUBE_NAMESPACE=default',
        '  KUBE_DEPLOYMENT=blog',
        '  KUBE_CONTAINER=blog',
      )
    }
  }

  return `${lines.join('\n')}\n`
}

const printNextSteps = ({ target, appRepo, contentRepo, branch, automation, deployMode, appImage, githubCreated }) => {
  const repoStep = githubCreated
    ? `GitHub repository is connected and pushed:
  ${contentRepo}`
    : `Create the private GitHub repository:
  cd ${target}
  gh repo create ${contentRepo} --private --source . --remote origin --push`

  console.log(`
Content repo scaffolded at:
  ${target}

${repoStep}

Configure the app runtime, not the public app image build:
  NUXT_PUBLIC_CMS_CONTENT_REPO=${contentRepo}
  NUXT_PUBLIC_CMS_CONTENT_BRANCH=${branch}
  BLOG_CONTENT_AUTH_TOKEN=<token with read access to ${contentRepo}>
  BLOG_CONTENT_CACHE_TTL_MS=60000

Local app development:
  cd ${projectRoot}
  NUXT_PUBLIC_CMS_CONTENT_REPO=${contentRepo} NUXT_PUBLIC_CMS_CONTENT_BRANCH=${branch} BLOG_CONTENT_AUTH_TOKEN=<token> pnpm dev
${printAutomationNextSteps({ automation, deployMode, appRepo, appImage })}`)
}

await assertTemplateExists()

const detectedAppRepo = options.appRepo || detectAppRepo() || 'owner/blog'
const detectedOwner = detectedAppRepo.split('/')[0] || 'owner'
const defaultContentRepo = options.contentRepo || `${detectedOwner}/blog-content`
const defaultAutomation = normalizeAutomation(options.automation || 'content')
const defaultDeployMode = normalizeDeployMode(options.deployMode || 'gitops')
const defaultVisibility = normalizeVisibility(options.visibility || 'private')
const ghAvailable = commandExists('gh')
const rl = createInterface({ input, output })

try {
  assertChoice(defaultAutomation, automationChoices, 'Automation mode')
  assertChoice(defaultDeployMode, deployModeChoices, 'Deploy mode')
  assertChoice(defaultVisibility, visibilityChoices, 'GitHub visibility')

  const target = path.resolve(await ask(rl, 'Target directory', options.target || defaultTargetDir))
  const appRepo = await ask(rl, 'Public app repository', detectedAppRepo)
  const contentRepo = await ask(rl, 'Private content repository', defaultContentRepo)
  const branch = await ask(rl, 'Content branch', options.branch || 'main')
  const title = await ask(rl, 'Initial post title', options.title || 'Welcome to my blog')
  const automation = await select(rl, 'Automation to include', automationChoices, defaultAutomation)
  const deployMode = automation === 'deploy'
    ? await select(rl, 'Deployment style', deployModeChoices, defaultDeployMode)
    : 'none'
  const defaultAppImage = options.appImage || `ghcr.io/${appRepo}`
  const appImage = automation === 'build' || automation === 'deploy'
    ? await ask(rl, 'Container image', defaultAppImage)
    : defaultAppImage
  const shouldPromptForGithub = options.github === undefined && ghAvailable
  const githubCreate = options.github ?? (
    shouldPromptForGithub
      ? await confirm(rl, 'Create and push the GitHub repo now with gh', false)
      : false
  )
  const visibility = githubCreate
    ? await select(rl, 'GitHub repository visibility', visibilityChoices, defaultVisibility)
    : defaultVisibility
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
    BLOG_AUTOMATION_MODE: automation,
    BLOG_DEPLOY_MODE: deployMode,
    BLOG_IMAGE: appImage,
    POST_TITLE: title,
    POST_DATE: `${today} 09:00`,
  }, automation)

  if (options.git || githubCreate) {
    await initGit(target, branch)
  }

  if (githubCreate) {
    createOrPushGitHubRepo({ target, contentRepo, branch, visibility })
  }

  printNextSteps({
    target,
    appRepo,
    contentRepo,
    branch,
    automation,
    deployMode,
    appImage,
    githubCreated: githubCreate,
  })
} finally {
  rl.close()
}
