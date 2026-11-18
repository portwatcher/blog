export const friendLinksFile = 'links/friends.md'

export interface FriendLink {
  name: string
  url: string
  description: string
  avatar: string
}

export interface FriendLinksDocument {
  title: string
  description: string
  links: FriendLink[]
}

export const emptyFriendLinks: FriendLinksDocument = {
  title: '',
  description: '',
  links: [],
}

const readText = (value: unknown) => typeof value === 'string' ? value.trim() : ''

const isHttpUrl = (value: string) => {
  try {
    const { protocol } = new URL(value)
    return protocol === 'http:' || protocol === 'https:'
  } catch (_error) {
    return false
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const normalizeFriendLink = (value: unknown): FriendLink | undefined => {
  if (!isRecord(value)) {
    return undefined
  }

  const name = readText(value.name)
  const url = readText(value.url)
  if (!name || !isHttpUrl(url)) {
    return undefined
  }

  const avatar = readText(value.avatar)

  return {
    name,
    url,
    description: readText(value.description),
    avatar: isHttpUrl(avatar) ? avatar : '',
  }
}

export const normalizeFriendLinks = (data: unknown): FriendLinksDocument => {
  if (!isRecord(data)) {
    return emptyFriendLinks
  }

  const links = Array.isArray(data.links)
    ? data.links
      .map(normalizeFriendLink)
      .filter((link): link is FriendLink => Boolean(link))
    : []

  return {
    title: readText(data.title),
    description: readText(data.description),
    links,
  }
}
