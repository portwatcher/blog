import NProgress from 'nprogress'
import 'nprogress/nprogress.css'

NProgress.configure({
  easing: 'ease-in',
  speed: 500,
  showSpinner: false,
  trickleSpeed: 500,
  minimum: 0.01,
})

export default defineNuxtPlugin((): void => {
  useRouter().beforeEach((): void => {
    NProgress.start()
  })

  useRouter().afterEach((): void => {
    NProgress.done()
  })
})
