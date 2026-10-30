/**
 * Offline self-test for dsh-inbox host half.
 *
 * Runs entirely against a throwaway DSH_HOME and a fake IMAP layer: no network,
 * no real user data. Usage: `node tests/self-test.mjs` (or `npm test`).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const LIB = new URL('../lib/', import.meta.url)
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-inbox-home-'))
process.env.DSH_HOME = home

const problems = []
process.on('unhandledRejection', (error) => {
  console.error('\nFAIL  unhandledRejection:', error)
  process.exit(1)
})
process.on('uncaughtException', (error) => {
  console.error('\nFAIL  uncaughtException:', error)
  process.exit(1)
})

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const passed = []
function pass(label) { passed.push(label); console.log('PASS  ' + label) }

const log = { info: [], warn: [] }
const logger = {
  info: (message) => log.info.push(String(message)),
  warn: (message) => log.warn.push(String(message)),
}

const inbox = await import(new URL('index.js', LIB).href)
const mail = await import(new URL('mail.js', LIB).href)
const store = await import(new URL('store.js', LIB).href)

// ---------------------------------------------------------------------------
// 1. withTimeout never leaves a rejection unhandled
// ---------------------------------------------------------------------------
await assert.rejects(
  inbox.withTimeout(new Promise(() => {}), 40, 'probe'),
  /probe timed out/,
  'hung promise must reject by timeout',
)
pass('withTimeout rejects a hung promise')

const lateReject = new Promise((_, reject) => setTimeout(() => reject(new Error('late boom')), 60))
await assert.rejects(inbox.withTimeout(lateReject, 10, 'late'), /late timed out/)
await sleep(120)
assert.equal(problems.length, 0, 'late rejection must be swallowed, not unhandled')
pass('withTimeout swallows the losing promise rejection')

await assert.rejects(inbox.withTimeout(Promise.reject(new Error('fast boom')), 500, 'fast'), /fast boom/)
pass('withTimeout passes through early rejection')

// ---------------------------------------------------------------------------
// 2. stuck detection
// ---------------------------------------------------------------------------
const now = Date.now()
assert.equal(inbox.isStuck(now - 1000, now, 5000), false)
assert.equal(inbox.isStuck(now - 9000, now, 5000), true)
assert.equal(inbox.isStuck(null, now, 5000), false)
assert.equal(inbox.isStuck(0, now, 5000), false)
pass('isStuck boundaries')

// ---------------------------------------------------------------------------
// 3. regression: IMAP client errors must not become exceptions
// ---------------------------------------------------------------------------
let sinkDetail = null
mail.setErrorSink((detail) => { sinkDetail = detail })
const client = mail.makeClient({
  id: 'test-account',
  channel: 'gmail',
  email: 'probe@example.com',
  imapHost: '127.0.0.1',
  imapPort: 1,
  secure: true,
}, 'secret')
assert.ok(client.listenerCount('error') >= 1, 'client must carry an error listener')
// This is the exact shape of the 2026-10-30 crash: with no listener this throws.
client.emit('error', new Error('read ECONNRESET'))
assert.equal(sinkDetail, 'read ECONNRESET')
pass('client.emit("error") is handled instead of throwing')
mail.closeAllClients()
mail.setErrorSink(null)

// ---------------------------------------------------------------------------
// 4. HTTP handler contract
// ---------------------------------------------------------------------------
const engine = inbox.createInboxEngine({ logger })
const call = async (body) => {
  const response = await engine.handle(new Request('http://127.0.0.1/api/dsh-inbox/state', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }))
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8')
  return response.json()
}

const empty = await call({ op: 'get' })
assert.equal(empty.ok, true)
assert.equal(empty.value.total, 0)
assert.deepEqual(empty.value.accounts, [])
pass('op=get on empty store')

assert.equal((await call({ op: 'nope' })).ok, false)
assert.equal((await call({ op: 'saveAccount', account: { channel: 'gmail', email: 'not-an-email' } })).ok, false)
assert.equal((await call({ op: 'deleteAccount' })).ok, false)
assert.equal((await call({ op: 'mark' })).ok, false)
assert.equal((await call({ op: 'body', accountId: 'x' })).ok, false)
pass('invalid payloads are rejected')

const saved = await call({
  op: 'saveAccount',
  account: { channel: 'gmail', email: 'probe@example.com', label: 'probe' },
  password: 'app-password',
})
assert.equal(saved.ok, true)
assert.equal(saved.value.accounts.length, 1)
const accountId = saved.value.accounts[0].id
assert.equal(await store.readPassword(accountId), 'app-password')
pass('op=saveAccount persists account + secret')

const testResult = await call({
  op: 'testAccount',
  account: { channel: 'gmail', email: 'probe@example.com', imapHost: '127.0.0.1', imapPort: 1 },
  password: 'app-password',
})
assert.equal(testResult.ok, true)
assert.equal(testResult.value.ok, false, 'connect to port 1 must fail cleanly')
assert.ok(testResult.value.detail.length > 0)
pass('op=testAccount fails offline without throwing')

// ---------------------------------------------------------------------------
// 5. sync pass: success path (fake IMAP)
// ---------------------------------------------------------------------------
function messageFor(account, uid) {
  return {
    id: `${account.channel}:${account.id}:9:${uid}`,
    accountId: account.id,
    channel: account.channel,
    uidValidity: '9',
    uid,
    subject: 'hello ' + uid,
    fromName: 'Tester',
    fromAddr: 'tester@example.com',
    toText: account.email,
    date: Date.now(),
    size: 1024,
    hasAttachments: false,
    seen: false,
    createdAt: Date.now(),
  }
}

let syncCalls = 0
const okEngine = inbox.createInboxEngine({ logger }, {
  fetchNew: async (account) => {
    syncCalls += 1
    return { uidValidity: '9', messages: [messageFor(account, 101)], maxUid: 101 }
  },
  syncMs: 1e9,
  initialDelayMs: 1e9,
})
assert.equal(await okEngine.syncAll(), true)
assert.equal(syncCalls, 1)
const afterSync = await okEngine.snapshot()
assert.equal(afterSync.total, 1)
assert.equal(afterSync.unreadCount, 1)
assert.equal(afterSync.sync.running, false)
assert.ok(afterSync.sync.lastSyncAt > 0)
assert.equal(afterSync.accounts[0].lastError, null)
assert.deepEqual(await store.readCursors(), { [accountId]: { uidValidity: '9', lastUid: 101 } })
pass('syncAll stores messages, clears error, writes cursor')

// ---------------------------------------------------------------------------
// 6. sync pass: hung IMAP is bounded (the crash regression)
// ---------------------------------------------------------------------------
let hangCalls = 0
const hangEngine = inbox.createInboxEngine({ logger }, {
  fetchNew: () => { hangCalls += 1; return new Promise(() => {}) },
  syncTimeoutMs: 120,
  syncMs: 1e9,
  initialDelayMs: 1e9,
})
const started = Date.now()
const hungPass = await hangEngine.syncAll()
const elapsed = Date.now() - started
assert.equal(hungPass, true)
assert.equal(hangCalls, 1)
assert.ok(elapsed < 2000, `syncAll must return quickly, took ${elapsed}ms`)
const afterHang = await hangEngine.snapshot()
assert.equal(afterHang.sync.running, false)
assert.match(afterHang.accounts[0].lastError, /timed out/)
assert.equal(afterHang.total, 1, 'previous data must survive a failed pass')
pass('hung IMAP rejects by timeout and never wedges the loop')

// ---------------------------------------------------------------------------
// 7. watchdog: a stuck pass is reset on the next tick
// ---------------------------------------------------------------------------
let stuckCalls = 0
const stuckEngine = inbox.createInboxEngine({ logger }, {
  fetchNew: (account) => {
    stuckCalls += 1
    if (stuckCalls === 1) return new Promise(() => {})
    return Promise.resolve({ uidValidity: '9', messages: [], maxUid: 101 })
  },
  syncTimeoutMs: 5_000, // first pass will not settle on its own; killed by process.exit below
  stuckMs: 150,
  syncMs: 1e9,
  initialDelayMs: 1e9,
})
const neverSettles = stuckEngine.syncAll() // deliberately not awaited
neverSettles.catch(() => {})
await sleep(250) // outlive stuckMs
const resetStart = Date.now()
const secondPass = await stuckEngine.syncAll()
assert.equal(secondPass, true)
assert.equal(stuckCalls, 2)
assert.ok(Date.now() - resetStart < 2000)
assert.equal(stuckEngine.sync.running, false)
assert.ok(log.warn.some((line) => line.includes('watchdog')), 'watchdog must log the reset')
pass('stuck pass is reset by the watchdog and the loop resumes')

// ---------------------------------------------------------------------------
// 8. scheduler start/stop
// ---------------------------------------------------------------------------
let ticks = 0
const schedEngine = inbox.createInboxEngine({ logger }, {
  fetchNew: async () => { ticks += 1; return { uidValidity: '9', messages: [], maxUid: 101 } },
  syncMs: 40,
  initialDelayMs: 10,
})
const stop = schedEngine.start()
await sleep(140)
const ticksWhileRunning = ticks
assert.ok(ticksWhileRunning >= 2, `expected repeated ticks, got ${ticksWhileRunning}`)
stop()
await sleep(200) // let any already-started pass settle
const ticksAfterStop = ticks
assert.ok(ticksAfterStop - ticksWhileRunning <= 1, 'disposer may only let the in-flight pass finish')
await sleep(150)
assert.equal(ticks, ticksAfterStop, 'no new passes may start after dispose')
pass('scheduler ticks and stops cleanly')

// ---------------------------------------------------------------------------
// 9. apply(): route registration + dispose
// ---------------------------------------------------------------------------
const callLog = { info: [], warn: [] }
const disposers = []
const ctx = {
  logger: { info: (m) => callLog.info.push(String(m)), warn: (m) => callLog.warn.push(String(m)) },
  inject(_deps, callback) {
    const scope = {
      get: (name) => (name === 'connection'
        ? { fetch: { register: (route) => { ctx.route = route; return () => { ctx.route = null } } } }
        : undefined),
      effect: (fn) => { const dispose = fn(); disposers.push(dispose); return dispose },
    }
    callback(scope)
  },
  effect(fn) { const dispose = fn(); disposers.push(dispose); return dispose },
  route: null,
}
inbox.apply(ctx)
assert.ok(ctx.route, 'apply must register the state route')
assert.equal(ctx.route.path, '/api/dsh-inbox/state')
assert.deepEqual(ctx.route.methods, ['POST'])
assert.ok(callLog.info.some((line) => line.includes('hardened imap-guard')))
const viaRoute = await ctx.route.fetch(new Request('http://127.0.0.1/api/dsh-inbox/state', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ op: 'get' }),
}))
assert.equal((await viaRoute.json()).ok, true)
for (const dispose of disposers) {
  if (typeof dispose === 'function') dispose()
}
pass('apply registers the route and disposes cleanly')

// ---------------------------------------------------------------------------
// summary
// ---------------------------------------------------------------------------
await sleep(150)
assert.equal(problems.length, 0, 'unexpected process-level failures: ' + problems.map((p) => String(p[1])).join('; '))
console.log('\nALL PASS (' + passed.length + ' checks)')
console.log('temp DSH_HOME: ' + home)
fs.rmSync(home, { recursive: true, force: true })
console.log('temp DSH_HOME removed')
// The stuck-pass fixture keeps a 5s timeout armed by design; leave immediately.
process.exit(0)
