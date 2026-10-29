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
import { fetchNew, fetchBody, testConnection, failMessage } from './mail.js'

export const name = 'dsh-inbox'

const SYNC_MS = 3 * 60 * 1000
const INITIAL_DELAY_MS = 9_000
const MAX_SNAPSHOT = 800
const BODY_CACHE_MAX = 60

const sync = {
  running: false,
  lastSyncAt: null,
  byAccount: {}, // id -> { running, lastSyncAt, lastError }
}

const bodyCache = new Map() // key -> { value, at }

function rememberBody(key, value) {
  bodyCache.set(key, { value, at: Date.now() })
  while (bodyCache.size > BODY_CACHE_MAX) {
    const oldest = bodyCache.keys().next().value
    bodyCache.delete(oldest)
  }
}

function json(payload) {
  return new Response(JSON.stringify(payload), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

function ok(value) { return json({ ok: true, value }) }
function err(message) { return json({ ok: false, error: { code: 'dsh-inbox/failed', message } }) }

async function snapshot() {
  const [accounts, messages] = await Promise.all([readAccounts(), readMessages()])
  const unreadCount = messages.reduce((n, m) => n + (m.seen ? 0 : 1), 0)
  return {
    accounts: accounts.map(publicAccount),
    messages: messages.slice(0, MAX_SNAPSHOT),
    total: messages.length,
    unreadCount,
    sync: {
      running: sync.running,
      lastSyncAt: sync.lastSyncAt,
      byAccount: sync.byAccount,
    },
  }
}

async function syncAccount(ctx, account) {
  const current = sync.byAccount[account.id] || {}
  if (current.running) return
  sync.byAccount[account.id] = { ...current, running: true }
  let newCount = 0
  try {
    const password = await readPassword(account.id)
    if (!password) throw new Error('未设置应用专用密码，请在设置中填写')
    const cursors = await readCursors()
    const result = await fetchNew(account, password, cursors[account.id] || null)
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
    sync.byAccount[account.id] = { running: false, lastSyncAt: Date.now(), lastError: null }
    sync.lastSyncAt = Date.now()
    if (newCount > 0) {
      try { ctx.logger?.info?.(`[dsh-inbox] ${account.label}: +${newCount} new`) } catch {}
    }
  } catch (error) {
    const detail = failMessage(error)
    sync.byAccount[account.id] = {
      running: false,
      lastSyncAt: current.lastSyncAt || null,
      lastError: detail,
    }
    try { ctx.logger?.warn?.(`[dsh-inbox] sync ${account.label} failed: ${detail}`) } catch {}
    try {
      await withLock(async () => {
        const accounts = await readAccounts()
        const target = accounts.find((a) => a.id === account.id)
        if (target) { target.lastError = detail; await writeAccounts(accounts) }
      })
    } catch {}
  }
}

async function syncAll(ctx) {
  if (sync.running) return
  sync.running = true
  try {
    const accounts = (await readAccounts()).filter((a) => a.enabled)
    for (const account of accounts) {
      await syncAccount(ctx, account)
    }
  } finally {
    sync.running = false
  }
}

function makeHandler(ctx) {
  return async function handleState(request) {
    let body = null
    try { body = await request.json() } catch { body = null }
    const op = body && typeof body === 'object' ? body.op : undefined
    try {
      if (op === 'get') {
        return ok(await snapshot())
      }

      if (op === 'refresh') {
        await syncAll(ctx)
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
        const result = await testConnection(account, password)
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
        const value = await fetchBody(account, password, uid)
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
}

export function apply(ctx) {
  try { ctx.logger?.info?.('[dsh-inbox] host active · email aggregator v0.1.0 · bundled') } catch {}

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
    const handle = makeHandler(ctx)
    scope.effect(
      () => register({
        path: '/api/dsh-inbox/state',
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: handle,
      }),
      'dsh-inbox: state route',
    )
  })

  ctx.effect(() => {
    let stopped = false
    const timer = setInterval(() => { if (!stopped) syncAll(ctx).catch(() => {}) }, SYNC_MS)
    const first = setTimeout(() => { if (!stopped) syncAll(ctx).catch(() => {}) }, INITIAL_DELAY_MS)
    return () => { stopped = true; clearInterval(timer); clearTimeout(first) }
  }, 'dsh-inbox: sync scheduler')
}
