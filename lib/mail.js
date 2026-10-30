/**
 * dsh-inbox — IMAP/email connector.
 *
 * Read-only for the MVP: fetch mailbox summaries incrementally and pull a single
 * message body on demand. No SMTP / send.
 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
// Dependencies are pre-bundled into a single local file (see vendor-src.mjs) so
// the plugin ships without node_modules and DSH's HMR resolver stays happy.
const { ImapFlow, simpleParser } = require('./vendor.cjs')

const INITIAL_LIMIT = 30
const MAX_BODY_TEXT = 400_000
const MAX_BODY_HTML = 600_000

// ---------------------------------------------------------------------------
// clients are error-safe by construction
//
// imapflow re-emits socket errors on an *established* connection as an `error`
// event on the client instance. Node turns an `error` event with no listener
// into an uncaughtException, and DSH's fail-loud guard answers that by exiting
// the whole host process. That is exactly how DSH died on 2026-10-30 07:17:53:
// a Gmail IMAP socket that had been hanging since 02:00 received
// `read ECONNRESET` when Windows left modern standby. Every client therefore
// gets an `error` listener before it is allowed to connect.
// ---------------------------------------------------------------------------
const activeClients = new Set()
let errorSink = null

/** Route IMAP client errors to the host logger instead of process stderr. */
export function setErrorSink(fn) {
  errorSink = typeof fn === 'function' ? fn : null
}

function reportClientError(error) {
  const detail = failMessage(error)
  try {
    if (errorSink) errorSink(detail)
    else process.emitWarning(`[dsh-inbox] IMAP client error: ${detail}`)
  } catch {}
}

export function makeClient(account, password) {
  const client = new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure: account.secure !== false,
    auth: { user: account.email, pass: password },
    logger: false,
    clientInfo: { name: 'dsh-inbox', version: '0.1.1', vendor: 'DeepSeek Harness' },
    // Fail fast instead of hanging forever on a wrong host/port.
    socketTimeout: 30_000,
    greetingTimeout: 15_000,
  })
  activeClients.add(client)
  client.on('error', reportClientError)
  client.on('close', () => { activeClients.delete(client) })
  return client
}

/** Hard-close every live connection (plugin dispose / profile reload). */
export function closeAllClients() {
  for (const client of Array.from(activeClients)) {
    activeClients.delete(client)
    try {
      const closing = client.close()
      if (closing && typeof closing.catch === 'function') closing.catch(() => {})
    } catch {}
  }
}

async function safeLogout(client) {
  try { await client.logout() } catch {}
  activeClients.delete(client)
}

// A single sync/fetch must never outlive this: the caller gives up earlier (see
// index.js withTimeout), so the watchdog only exists to destroy leaked sockets.
const OPERATION_TIMEOUT_MS = 120_000

function armWatchdog(client, timeoutMs = OPERATION_TIMEOUT_MS) {
  let fired = false
  const timer = setTimeout(() => {
    fired = true
    try {
      const closing = client.close()
      if (closing && typeof closing.catch === 'function') closing.catch(() => {})
    } catch {}
  }, timeoutMs)
  if (typeof timer.unref === 'function') timer.unref()
  return () => { clearTimeout(timer); return fired }
}

function failMessage(error) {
  if (!error) return 'unknown error'
  const text = String(error.message || error)
  // Never leak credentials in error strings.
  return text.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, (m) => m.split('@')[0].slice(0, 2) + '***@' + m.split('@')[1])
}

function firstAddress(list) {
  if (!Array.isArray(list) || list.length === 0) return { name: '', address: '' }
  const a = list[0] || {}
  return { name: typeof a.name === 'string' ? a.name.trim() : '', address: typeof a.address === 'string' ? a.address.trim() : '' }
}

function addressesText(list) {
  if (!Array.isArray(list)) return ''
  return list.map((a) => (a && typeof a.address === 'string' ? a.address : '')).filter(Boolean).join(', ')
}

function structureHasAttachments(node) {
  if (!node || typeof node !== 'object') return false
  if (node.disposition === 'attachment') return true
  if (node.dispositionParameters && node.dispositionParameters.filename) return true
  if (Array.isArray(node.childNodes) && node.childNodes.some(structureHasAttachments)) return true
  return false
}

function uidNumber(value) {
  if (typeof value === 'number') return value
  if (typeof value === 'bigint') return Number(value)
  return null
}

function seenFlag(flags) {
  if (!flags) return false
  if (typeof flags.has === 'function') return flags.has('\\Seen')
  if (Array.isArray(flags)) return flags.indexOf('\\Seen') !== -1
  return false
}

function toSummary(message, account, uidValidity) {
  const env = message.envelope || {}
  const from = firstAddress(env.from)
  const date = message.internalDate instanceof Date
    ? message.internalDate.getTime()
    : (env.date ? new Date(env.date).getTime() : Date.now())
  const uid = uidNumber(message.uid)
  return {
    id: `${account.channel}:${account.id}:${uidValidity}:${uid}`,
    accountId: account.id,
    channel: account.channel,
    uidValidity: String(uidValidity),
    uid,
    messageId: typeof env.messageId === 'string' ? env.messageId : null,
    subject: typeof env.subject === 'string' && env.subject.trim() ? env.subject.trim() : '(无主题)',
    fromName: from.name,
    fromAddr: from.address,
    toText: addressesText(env.to),
    date: Number.isFinite(date) ? date : Date.now(),
    size: typeof message.size === 'number' ? message.size : null,
    hasAttachments: structureHasAttachments(message.bodyStructure),
    seen: seenFlag(message.flags),
    createdAt: Date.now(),
  }
}

/**
 * Incrementally pull new message summaries from INBOX.
 * @returns {Promise<{uidValidity:number, messages:object[], maxUid:number}>}
 */
export async function fetchNew(account, password, cursor) {
  const client = makeClient(account, password)
  const disarm = armWatchdog(client)
  try {
    await client.connect()
  } catch (error) {
    disarm()
    await safeLogout(client)
    throw error
  }
  try {
    const lock = await client.getMailboxLock('INBOX')
    try {
      const box = client.mailbox || {}
      // imapflow exposes uidValidity as BigInt — normalize to a string so it can
      // be compared and JSON-serialized safely.
      const uidValidity = box.uidValidity !== undefined && box.uidValidity !== null ? String(box.uidValidity) : '0'
      const exists = Number(box.exists || 0)
      const uidNext = Number(box.uidNext || 1)
      const messages = []
      let maxUid = 0

      let sameEpoch = cursor && String(cursor.uidValidity) === uidValidity && typeof cursor.lastUid === 'number'
      let startUid = sameEpoch ? cursor.lastUid : 0

      let query = null
      if (startUid > 0) {
        // Nothing to do when we already have the newest message.
        if (startUid >= uidNext - 1) {
          return { uidValidity, messages: [], maxUid: startUid }
        }
        query = { uid: `${startUid + 1}:*` }
      } else {
        if (exists === 0) return { uidValidity, messages: [], maxUid: 0 }
        const startSeq = Math.max(1, exists - INITIAL_LIMIT + 1)
        query = `${startSeq}:*`
      }

      const fetchOptions = { uid: true, envelope: true, flags: true, bodyStructure: true, size: true, internalDate: true }
      for await (const message of client.fetch(query, fetchOptions)) {
        const uid = uidNumber(message.uid)
        if (uid === null) continue
        const summary = toSummary(message, account, uidValidity)
        messages.push(summary)
        if (uid > maxUid) maxUid = uid
      }
      return { uidValidity, messages, maxUid }
    } finally {
      lock.release()
    }
  } finally {
    disarm()
    await safeLogout(client)
  }
}

/**
 * Fetch and parse one message body by UID.
 */
export async function fetchBody(account, password, uid) {
  const client = makeClient(account, password)
  const disarm = armWatchdog(client)
  try {
    await client.connect()
  } catch (error) {
    disarm()
    await safeLogout(client)
    throw error
  }
  try {
    const lock = await client.getMailboxLock('INBOX')
    try {
      const message = await client.fetchOne(uid, { source: true }, { uid: true })
      if (!message || !message.source) throw new Error('message not found')
      const parsed = await simpleParser(message.source)
      let text = typeof parsed.text === 'string' ? parsed.text : ''
      let html = typeof parsed.html === 'string' ? parsed.html : ''
      if (text.length > MAX_BODY_TEXT) text = text.slice(0, MAX_BODY_TEXT) + '\n\n…（正文过长，已截断）'
      if (html.length > MAX_BODY_HTML) html = html.slice(0, MAX_BODY_HTML)
      const attachments = Array.isArray(parsed.attachments)
        ? parsed.attachments.map((a) => ({
            filename: typeof a.filename === 'string' ? a.filename : '(附件)',
            size: typeof a.size === 'number' ? a.size : null,
            contentType: typeof a.contentType === 'string' ? a.contentType : '',
          }))
        : []
      return {
        uid,
        subject: typeof parsed.subject === 'string' ? parsed.subject : '',
        from: parsed.from && parsed.from.text ? parsed.from.text : '',
        to: parsed.to && parsed.to.text ? parsed.to.text : '',
        date: parsed.date instanceof Date ? parsed.date.getTime() : null,
        text,
        html,
        attachments,
      }
    } finally {
      lock.release()
    }
  } finally {
    disarm()
    await safeLogout(client)
  }
}

/**
 * Verify credentials + mailbox access without fetching any message.
 */
export async function testConnection(account, password) {
  const client = makeClient(account, password)
  const disarm = armWatchdog(client)
  try {
    await client.connect()
    const lock = await client.getMailboxLock('INBOX')
    try {
      return { ok: true, exists: client.mailbox ? client.mailbox.exists : 0 }
    } finally {
      lock.release()
    }
  } catch (error) {
    return { ok: false, detail: failMessage(error) }
  } finally {
    disarm()
    await safeLogout(client)
  }
}

export { failMessage }
