/**
 * dsh-inbox — host half.
 *
 * Aggregates personal email (Gmail / QQ邮箱) into one inbox for the browser
 * half: a background IMAP sync loop stores message summaries, and a POST route
 * serves snapshots, account CRUD, connection tests and on-demand message bodies.
 *
 * Browser API (POST /api/dsh-inbox/state):
 *   { op: 'get' }                                     -> { ok, value: snapshot }
 *   { op: 'refresh' }                                 -> sync now, then snapshot
 *   { op: 'saveAccount', account, password? }         -> snapshot
 *   { op: 'deleteAccount', id }                       -> snapshot
 *   { op: 'testAccount', account, password? }         -> { ok, value: { ok, exists|detail } }
 *   { op: 'body', accountId, uid, uidValidity }       -> { ok, value: { text, html, ... } }
 *   { op: 'mark', id, read }                          -> snapshot
 *
 * Robustness contract (added after the 2026-10-30 host crash):
 *   - every IMAP client carries an `error` listener, so a socket reset can no
 *     longer escape as an uncaughtException (see mail.js);
 *   - a single sync pass is capped by `withTimeout`, so a hung socket cannot
 *     wedge the loop for hours;
 *   - a watchdog clears `running` flags older than `stuckMs`, so the periodic
 *     tick always makes progress again.
 */
import {
  withLock,
  readAccounts,
  writeAccounts,
  publicAccount,
  normalizeAccount,
  readMessages,
  mergeMessages,
  writeMessages,
  readPassword,
  writeSecret,
  deleteSecret,
  readCursors,
  writeCursor,
} from './store.js'
import {
  fetchNew,
  fetchBody,
  testConnection,
  closeAllClients,
  failMessage,
  setErrorSink,
} from './mail.js'

export const name = 'dsh-inbox'

const SYNC_MS = 3 * 60 * 1000
const INITIAL_DELAY_MS = 9_000
const MAX_SNAPSHOT = 800
const BODY_CACHE_MAX = 60
/** Upper bound for one account sync; mail.js kills the leaked socket later. */
const SYNC_TIMEOUT_MS = 90_000
/** A pass/account that stayed `running` longer than this is considered wedged. */
const STUCK_MS = 5 * 60 * 1000

function json(payload) {
  return new Response(JSON.stringify(payload), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

function ok(value) { return json({ ok: true, value }) }
function err(message) { return json({ ok: false, error: { code: 'dsh-inbox/failed', message } }) }

function minutesSince(then) {
  return Math.max(1, Math.round((Date.now() - then) / 60000))
}

/**
 * Reject `promise` once `ms` elapses.
 *
 * The losing branch keeps a rejection handler of its own: a late rejection from
 * the original promise must not surface as an unhandledRejection, because DSH
 * treats those as fatal too.
 */
export function withTimeout(promise, ms, label) {
  let timer
  // Deliberately not unref'd: the bound must fire even if this timer is the last
  // thing keeping the event loop alive.
  const guard = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${formatMs(ms)}`)), ms)
  })
  promise.catch(() => {})
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer))
}

function formatMs(ms) {
  return ms >= 1000 ? `${Math.round(ms / 1000)}s` : `${ms}ms`
}

/** True when a `runningSince` timestamp is old enough to be treated as wedged. */
export function isStuck(since, now, limitMs) {
  return typeof since === 'number' && since > 0 && Number.isFinite(now) && now - since > limitMs
}

/**
 * Build one inbox engine (state, route handler, scheduler).
 *
 * Dependencies are injectable so the sync loop can be exercised offline with a
 * fake IMAP implementation instead of the network.
 */
export function createInboxEngine(ctx, options = {}) {
  const deps = {
    fetchNew: options.fetchNew || fetchNew,
    fetchBody: options.fetchBody || fetchBody,
    testConnection: options.testConnection || testConnection,
  }
  const settings = {
    syncMs: options.syncMs || SYNC_MS,
    initialDelayMs: options.initialDelayMs === undefined ? INITIAL_DELAY_MS : options.initialDelayMs,
    syncTimeoutMs: options.syncTimeoutMs || SYNC_TIMEOUT_MS,
    stuckMs: options.stuckMs || STUCK_MS,
    maxSnapshot: options.maxSnapshot || MAX_SNAPSHOT,
    bodyCacheMax: options.bodyCacheMax || BODY_CACHE_MAX,
    logger: options.logger || (ctx && ctx.logger) || null,
  }

  const sync = { running: false, runningSince: null, token: null, lastSyncAt: null, byAccount: {} }
  const bodyCache = new Map()
  let seq = 0

  function info(message) { try { settings.logger?.info?.(message) } catch {} }
  function warn(message) { try { settings.logger?.warn?.(message) } catch {} }

  function rememberBody(key, value) {
    bodyCache.set(key, { value, at: Date.now() })
    while (bodyCache.size > settings.bodyCacheMax) {
      const oldest = bodyCache.keys().next().value
      bodyCache.delete(oldest)
    }
  }

  async function snapshot() {
    const [accounts, messages] = await Promise.all([readAccounts(), readMessages()])
    const unreadCount = messages.reduce((n, m) => n + (m.seen ? 0 : 1), 0)
    return {
      accounts: accounts.map(publicAccount),
      messages: messages.slice(0, settings.maxSnapshot),
      total: messages.length,
      unreadCount,
      sync: {
        running: sync.running,
        lastSyncAt: sync.lastSyncAt,
        byAccount: sync.byAccount,
      },
    }
  }

  async function syncAccount(account) {
    const current = sync.byAccount[account.id] || {}
    if (current.running) {
      if (!isStuck(current.runningSince, Date.now(), settings.stuckMs)) return 0
      warn(`[dsh-inbox] ${account.label}: previous sync stuck ${minutesSince(current.runningSince)}m, resetting`)
    }

    const token = ++seq
    const startedAt = Date.now()
    sync.byAccount[account.id] = { ...current, running: true, runningSince: startedAt, token }
    // A newer attempt for the same account owns the state from now on; a stale
    // attempt must not overwrite it when it finally settles.
    const settle = (patch) => {
      const state = sync.byAccount[account.id]
      if (!state || state.token !== token) return
      sync.byAccount[account.id] = { ...patch, running: false, runningSince: null, token }
    }

    let newCount = 0
    try {
      const password = await readPassword(account.id)
      if (!password) throw new Error('未设置应用专用密码，请在设置中填写')
      const cursors = await readCursors()
      const result = await withTimeout(
        deps.fetchNew(account, password, cursors[account.id] || null),
        settings.syncTimeoutMs,
        `imap sync ${account.label}`,
      )
      newCount = result.messages.length
      if (newCount > 0) {
        await withLock(async () => {
          const existing = await readMessages()
          await writeMessages(mergeMessages(existing, result.messages))
        })
      }
      await withLock(async () => {
        const accounts = await readAccounts()
        const target = accounts.find((a) => a.id === account.id)
        if (target) { target.lastSyncAt = Date.now(); target.lastError = null; await writeAccounts(accounts) }
      })
      await withLock(() => writeCursor(account.id, { uidValidity: result.uidValidity, lastUid: result.maxUid }))
      settle({ lastSyncAt: Date.now(), lastError: null })
      sync.lastSyncAt = Date.now()
      if (newCount > 0) info(`[dsh-inbox] ${account.label}: +${newCount} new`)
      return newCount
    } catch (error) {
      const detail = failMessage(error)
      const state = sync.byAccount[account.id]
      const stillOwner = Boolean(state && state.token === token)
      settle({ lastSyncAt: current.lastSyncAt || null, lastError: detail })
      // A watchdog may already have handed this account to a newer attempt; an
      // old failure must not overwrite that attempt's freshly persisted state.
      if (stillOwner) {
        warn(`[dsh-inbox] sync ${account.label} failed: ${detail}`)
        try {
          await withLock(async () => {
            const accounts = await readAccounts()
            const target = accounts.find((a) => a.id === account.id)
            if (target) { target.lastError = detail; await writeAccounts(accounts) }
          })
        } catch {}
      }
      return 0
    }
  }

  async function syncAll() {
    if (sync.running) {
      if (!isStuck(sync.runningSince, Date.now(), settings.stuckMs)) return false
      warn(`[dsh-inbox] sync watchdog: pass stuck ${minutesSince(sync.runningSince)}m, resetting`)
    }

    const token = ++seq
    sync.running = true
    sync.runningSince = Date.now()
    sync.token = token
    try {
      const accounts = (await readAccounts()).filter((a) => a.enabled)
      for (const account of accounts) {
        await syncAccount(account)
      }
      return true
    } finally {
      // Only the pass that still owns the flag may clear it.
      if (sync.token === token) {
        sync.running = false
        sync.runningSince = null
        sync.token = null
      }
    }
  }

  async function handle(request) {
    let body = null
    try { body = await request.json() } catch { body = null }
    const op = body && typeof body === 'object' ? body.op : undefined
    try {
      if (op === 'get') {
        return ok(await snapshot())
      }

      if (op === 'refresh') {
        await syncAll()
        return ok(await snapshot())
      }

      if (op === 'saveAccount') {
        const raw = body.account
        const existingId = raw && typeof raw === 'object' ? raw.id : undefined
        const account = normalizeAccount(raw)
        if (account === null) return err('账号信息不合法：请填写有效的邮箱与渠道（Gmail / QQ邮箱）')
        await withLock(async () => {
          const accounts = await readAccounts()
          const idx = accounts.findIndex((a) => a.id === account.id)
          if (idx >= 0) {
            account.createdAt = accounts[idx].createdAt
            accounts[idx] = account
          } else if (existingId && accounts.some((a) => a.id === existingId)) {
            // id supplied but normalizer kept it; fallback guard (unreachable in practice)
            accounts.push(account)
          } else {
            accounts.push(account)
          }
          await writeAccounts(accounts)
        })
        if (typeof body.password === 'string' && body.password.trim() !== '') {
          await writeSecret(account.id, body.password.trim())
        }
        return ok(await snapshot())
      }

      if (op === 'deleteAccount') {
        const id = typeof body.id === 'string' ? body.id : ''
        if (!id) return err('缺少账号 id')
        await withLock(async () => {
          const accounts = await readAccounts()
          await writeAccounts(accounts.filter((a) => a.id !== id))
          const messages = await readMessages()
          await writeMessages(messages.filter((m) => m.accountId !== id))
        })
        await deleteSecret(id)
        delete sync.byAccount[id]
        return ok(await snapshot())
      }

      if (op === 'testAccount') {
        const account = normalizeAccount(body.account)
        if (account === null) return ok({ ok: false, detail: '账号信息不合法' })
        let password = typeof body.password === 'string' ? body.password.trim() : ''
        if (!password && body.account && typeof body.account.id === 'string') {
          password = await readPassword(body.account.id)
        }
        if (!password) return ok({ ok: false, detail: '请先填写应用专用密码 / 授权码' })
        const result = await withTimeout(
          deps.testConnection(account, password),
          settings.syncTimeoutMs,
          'imap test',
        )
        return ok(result)
      }

      if (op === 'body') {
        const accountId = typeof body.accountId === 'string' ? body.accountId : ''
        const uid = typeof body.uid === 'number' ? body.uid : null
        const uidValidity = body.uidValidity === undefined || body.uidValidity === null ? '' : String(body.uidValidity)
        if (!accountId || uid === null) return err('缺少账号或邮件 UID')
        const accounts = await readAccounts()
        const account = accounts.find((a) => a.id === accountId)
        if (!account) return err('账号不存在')
        const key = `${accountId}:${uidValidity}:${uid}`
        const cached = bodyCache.get(key)
        if (cached) return ok(cached.value)
        const password = await readPassword(accountId)
        if (!password) return err('未设置应用专用密码')
        const value = await withTimeout(
          deps.fetchBody(account, password, uid),
          settings.syncTimeoutMs * 2,
          'imap body',
        )
        rememberBody(key, value)
        return ok(value)
      }

      if (op === 'mark') {
        const id = typeof body.id === 'string' ? body.id : ''
        const read = body.read === true
        if (!id) return err('缺少消息 id')
        await withLock(async () => {
          const messages = await readMessages()
          const target = messages.find((m) => m.id === id)
          if (target) { target.seen = read; await writeMessages(messages) }
        })
        return ok(await snapshot())
      }

      return err('未知操作: ' + String(op))
    } catch (error) {
      return err(failMessage(error))
    }
  }

  /** Start the background loop; returns the disposer. */
  function start() {
    let stopped = false
    const tick = () => {
      if (stopped) return
      syncAll().catch((error) => warn(`[dsh-inbox] sync pass failed: ${failMessage(error)}`))
    }
    const timer = setInterval(tick, settings.syncMs)
    const first = setTimeout(tick, settings.initialDelayMs)
    return () => {
      stopped = true
      clearInterval(timer)
      clearTimeout(first)
      closeAllClients()
    }
  }

  return { sync, snapshot, syncAll, handle, start }
}

export function apply(ctx) {
  try {
    setErrorSink((detail) => {
      try { ctx.logger?.warn?.(`[dsh-inbox] IMAP client error: ${detail}`) } catch {}
    })
  } catch {}

  const engine = createInboxEngine(ctx)

  try { ctx.logger?.info?.('[dsh-inbox] host active · email aggregator v0.1.1 · hardened imap-guard') } catch {}

  ctx.inject(['connection'], (scope) => {
    let connection
    try { connection = scope.get('connection') } catch { connection = undefined }
    const register = connection && connection.fetch && typeof connection.fetch.register === 'function'
      ? connection.fetch.register.bind(connection.fetch)
      : undefined
    if (register === undefined) {
      try { ctx.logger?.warn?.('[dsh-inbox] connection.fetch.register unavailable; route not registered') } catch {}
      return
    }
    scope.effect(
      () => register({
        path: '/api/dsh-inbox/state',
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: engine.handle,
      }),
      'dsh-inbox: state route',
    )
  })

  ctx.effect(() => engine.start(), 'dsh-inbox: sync scheduler')
}
