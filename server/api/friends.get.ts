import { getRuntimeContent } from '../utils/runtime-content'

export default defineEventHandler(async (event) => {
  const { friendLinks } = await getRuntimeContent(event)
  return friendLinks
})
