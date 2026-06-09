import NProgress from 'nprogress'
import 'nprogress/nprogress.css'

NProgress.configure({
  easing: 'ease-in',
  speed: 250,
  showSpinner: false,
  trickleSpeed: 300,
  minimum: 0.03,
})

export default defineNuxtPlugin((nuxtApp): void => {
  let pendingPageLoads = 0

  const start = (): void => {
    pendingPageLoads++
    if (!NProgress.isStarted()) {
      NProgress.start()
    }
  }

  const finish = (): void => {
    pendingPageLoads = Math.max(0, pendingPageLoads - 1)
    if (pendingPageLoads === 0) {
      NProgress.done()
    }
  }

  const abort = (): void => {
    pendingPageLoads = 0
    NProgress.done()
  }

  nuxtApp.hook('page:loading:start', start)
  nuxtApp.hook('page:loading:end', finish)
  nuxtApp.hook('vue:error', abort)
})
