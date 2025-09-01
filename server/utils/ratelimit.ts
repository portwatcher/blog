type RateWindow = {
  windowStart: number
  count: number
}

type FailState = {
  count: number
  blockedUntil: number
}

const requestWindows = new Map<string, RateWindow>()
const failStates = new Map<string, FailState>()

const DEFAULTS = {
  // Generic per-IP limit for unlock attempts (requests that include a password)
  maxUnlocksPerMinute: 30,
  // After this many failed attempts, block the IP
  maxFailedBeforeBlock: 10,
  // Block duration in ms
  blockMs: 15 * 60 * 1000,
}

export type RateConfig = Partial<typeof DEFAULTS>

function getConfig(cfg?: RateConfig) {
  return { ...DEFAULTS, ...(cfg || {}) }
}

export function getClientIP(event: any): string {
  const headers = event?.node?.req?.headers || {}
  const xff = (headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
  const xri = headers['x-real-ip'] as string | undefined
  const ra = event?.node?.req?.socket?.remoteAddress as string | undefined
  return xff || xri || ra || '0.0.0.0'
}

export function isBlocked(ip: string, cfg?: RateConfig) {
  const now = Date.now()
  const state = failStates.get(ip)
  if (state && state.blockedUntil > now) {
    return { blocked: true, retryAfterMs: state.blockedUntil - now }
  }
  return { blocked: false, retryAfterMs: 0 }
}

export function noteUnlockRequest(ip: string, cfg?: RateConfig) {
  const { maxUnlocksPerMinute } = getConfig(cfg)
  const now = Date.now()
  let window = requestWindows.get(ip)
  if (!window || now - window.windowStart >= 60_000) {
    window = { windowStart: now, count: 0 }
  }
  window.count += 1
  requestWindows.set(ip, window)
  const remaining = Math.max(0, maxUnlocksPerMinute - window.count)
  return {
    limited: window.count > maxUnlocksPerMinute,
    remaining,
    resetInMs: 60_000 - (now - window.windowStart),
  }
}

export function noteFailedAttempt(ip: string, cfg?: RateConfig) {
  const { maxFailedBeforeBlock, blockMs } = getConfig(cfg)
  const now = Date.now()
  let state = failStates.get(ip)
  if (!state || state.blockedUntil <= now) {
    state = { count: 0, blockedUntil: 0 }
  }
  state.count += 1
  if (state.count >= maxFailedBeforeBlock) {
    state.blockedUntil = now + blockMs
    state.count = 0 // reset counter after blocking to avoid long-term growth
  }
  failStates.set(ip, state)
  return { blocked: state.blockedUntil > now, blockedUntil: state.blockedUntil }
}

export function noteSuccessfulUnlock(ip: string) {
  // On success, clear any fail state and soften request window pressure
  failStates.delete(ip)
}

