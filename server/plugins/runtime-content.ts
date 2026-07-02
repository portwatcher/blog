import { warmRuntimeContent } from '../utils/runtime-content'

export default defineNitroPlugin(() => {
  void warmRuntimeContent()
})
