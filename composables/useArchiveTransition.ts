export type ArchiveTransitionPhase =
  | 'idle'
  | 'opening'
  | 'covered'
  | 'article'
  | 'return-covering'
  | 'returning'

export interface ArchiveTransitionRecord {
  title: string
  routeTitle: string
  date: string
  index: number
  count: number
}

export interface ArchiveTransitionGeometry {
  surfaceRect: DOMRectReadOnly
  titleRect: DOMRectReadOnly
}

interface ArchiveTransitionState {
  phase: ArchiveTransitionPhase
  record: ArchiveTransitionRecord | null
}

interface ArchiveTransitionRuntime {
  operation: number
  layerQueue: Promise<void>
}

export interface ArchiveTransitionLayerController {
  coverFrom: (geometry: ArchiveTransitionGeometry) => Promise<void>
  reveal: (
    titleRect: DOMRectReadOnly,
    onTitleReady?: () => void,
  ) => Promise<void>
  coverFull: (
    titleRect: DOMRectReadOnly,
    onTitleReady?: () => void,
  ) => Promise<void>
  shrinkTo: (geometry: ArchiveTransitionGeometry) => Promise<void>
  reset: () => void
}

let transitionLayer: ArchiveTransitionLayerController | null = null
const layerWaiters = new Set<(controller: ArchiveTransitionLayerController) => void>()
const transitionRuntimes = new WeakMap<object, ArchiveTransitionRuntime>()

const waitForTransitionLayer = () => {
  if (transitionLayer) return Promise.resolve(transitionLayer)

  return new Promise<ArchiveTransitionLayerController>((resolve) => {
    layerWaiters.add(resolve)
  })
}

export const registerArchiveTransitionLayer = (controller: ArchiveTransitionLayerController) => {
  transitionLayer = controller
  layerWaiters.forEach((resolve) => resolve(controller))
  layerWaiters.clear()

  return () => {
    if (transitionLayer === controller) transitionLayer = null
  }
}

export const useArchiveTransition = () => {
  const state = useState<ArchiveTransitionState>('archive-transition', () => ({
    phase: 'idle',
    record: null,
  }))
  const nuxtApp = useNuxtApp()
  let runtime = transitionRuntimes.get(nuxtApp)

  if (!runtime) {
    runtime = {
      operation: 0,
      layerQueue: Promise.resolve(),
    }
    transitionRuntimes.set(nuxtApp, runtime)
  }

  const beginOperation = () => ++runtime.operation
  const isCurrentOperation = (operation: number) => runtime.operation === operation
  const recordMatches = (routeTitle: string) =>
    state.value.record?.routeTitle === routeTitle

  const runLayerOperation = <T>(
    operation: number,
    run: (layer: ArchiveTransitionLayerController) => Promise<T> | T,
  ) => {
    // Layer controller methods deliberately cancel their current Web Animation.
    // Serializing calls also lets that canceled method finish its own cleanup
    // before the next method makes the layer visible again.
    const scheduled = runtime.layerQueue.then(async () => {
      if (!isCurrentOperation(operation)) return undefined

      const layer = await waitForTransitionLayer()
      if (!isCurrentOperation(operation)) return undefined

      return await run(layer)
    })

    runtime.layerQueue = scheduled.then(
      () => undefined,
      () => undefined,
    )

    return scheduled
  }

  const resetState = () => {
    state.value.phase = 'idle'
    state.value.record = null
  }

  const cancel = async (geometry?: ArchiveTransitionGeometry) => {
    const operation = beginOperation()

    await runLayerOperation(operation, async (layer) => {
      if (geometry) {
        await layer.shrinkTo(geometry)
      } else {
        layer.reset()
      }
    })
    if (isCurrentOperation(operation)) resetState()
  }

  const coverFromShelf = async (
    record: ArchiveTransitionRecord,
    geometry: ArchiveTransitionGeometry,
  ) => {
    const operation = beginOperation()
    state.value.record = record
    state.value.phase = 'opening'

    await runLayerOperation(operation, (layer) => layer.coverFrom(geometry))
    if (!isCurrentOperation(operation) || !recordMatches(record.routeTitle)) return

    state.value.phase = 'covered'
  }

  const revealArticle = async (
    routeTitle: string,
    titleRect: DOMRectReadOnly,
    title: string,
    onTitleReady?: () => void,
  ) => {
    if (!recordMatches(routeTitle)) {
      if (state.value.record || state.value.phase !== 'idle') await cancel()
      return false
    }
    if (state.value.phase !== 'covered') return false
    if (state.value.record) state.value.record.title = title

    const operation = beginOperation()
    await runLayerOperation(operation, (layer) => layer.reveal(
      titleRect,
      onTitleReady,
    ))
    if (!isCurrentOperation(operation) || !recordMatches(routeTitle)) return false

    state.value.phase = 'article'
    return true
  }

  const coverArticleForReturn = async (
    routeTitle: string,
    titleRect: DOMRectReadOnly,
    title: string,
    onTitleReady?: () => void,
  ) => {
    if (!recordMatches(routeTitle)) {
      if (state.value.record || state.value.phase !== 'idle') await cancel()
      return false
    }
    if (state.value.phase !== 'article' && state.value.phase !== 'covered') return false
    if (state.value.record) state.value.record.title = title

    const operation = beginOperation()
    state.value.phase = 'return-covering'
    await runLayerOperation(operation, (layer) => layer.coverFull(
      titleRect,
      onTitleReady,
    ))
    if (!isCurrentOperation(operation) || !recordMatches(routeTitle)) return false

    state.value.phase = 'returning'
    return true
  }

  const revealShelf = async (geometry: ArchiveTransitionGeometry) => {
    if (state.value.phase !== 'returning') return false

    const operation = beginOperation()
    await runLayerOperation(operation, (layer) => layer.shrinkTo(geometry))
    if (!isCurrentOperation(operation)) return false

    return true
  }

  const completeReturn = () => {
    beginOperation()
    resetState()
  }

  return {
    state: readonly(state),
    coverFromShelf,
    revealArticle,
    coverArticleForReturn,
    revealShelf,
    completeReturn,
    cancel,
  }
}

const prefetchedArticles = new Map<string, Promise<Article | null>>()

const articlePrefetchKey = (title: string, lang?: string) =>
  `${String(title).trim()}::${String(lang || '').trim().toLowerCase()}`

export const primeArchiveArticle = (title: string, lang?: string) => {
  const key = articlePrefetchKey(title, lang)
  const existing = prefetchedArticles.get(key)
  if (existing) return existing

  const request = $fetch<Article[]>('/api/articles', {
    method: 'GET',
    query: {
      title,
      lang: lang || undefined,
    },
  })
    .then((articles) => articles[0] || null)
    .catch(() => null)

  prefetchedArticles.set(key, request)
  return request
}

export const takePrimedArchiveArticle = async (title: string, lang?: string) => {
  const key = articlePrefetchKey(title, lang)
  const request = prefetchedArticles.get(key)
  if (!request) return null

  prefetchedArticles.delete(key)
  return await request
}
