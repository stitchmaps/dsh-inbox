/**
 * dsh-inbox — persistence layer.
 *
 * Everything lives under `<DSH_HOME>/dsh-inbox/`:
 *   accounts.json : { version, accounts: [...] }        (no secrets)
 *   secrets.json  : { version, entries: { [id]: cipher } }  (encrypted passwords)
 *   messages.json : { version, messages: [...] }        (mailbox summaries)
 *   cursors.json  : { version, byAccount: { [id]: { uidValidity, lastUid } } }
 *   secret.key    : 32-byte AES key (created on first use, best-effort 0600)
 *   backups/      : latest 20 timestamped snapshots per file
 *
 * Writes are atomic (tmp + rename) and serialized through a single lock.
 * Reads fall back to `.bak` / newest timestamped backup when the main file is
 * missing or corrupt.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'

const BACKUP_KEEP = 20
export const MAX_MESSAGES = 5000

export function baseDir() {
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  return path.join(home, 'dsh-inbox')
}

function fileFor(name) {
  return path.join(baseDir(), name)
}

// ---------------------------------------------------------------------------
// serialized IO
// ---------------------------------------------------------------------------
let ioChain = Promise.resolve()
export function withLock(fn) {
  const run = ioChain.then(fn, fn)
  ioChain = run.then(() => undefined, () => undefined)
  return run
}

function pad2(n) { return n < 10 ? '0' + n : String(n) }
function stamp() {
  const d = new Date()
  return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '-' +
    pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds())
}

function asString(value, max) {
  if (typeof value !== 'string') return ''
  const t = value.trim()
  return t.length > max ? t.slice(0, max) : t
}
function asTime(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

async function atomicWrite(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(tmp, data, 'utf8')
  await fs.rename(tmp, file)
}

function backupPrefix(name) { return name.replace(/\.json$/, '') }

async function backupBefore(file, name) {
  try {
    const stat = await fs.stat(file)
    if (!stat.size) return
    await fs.copyFile(file, `${file}.bak`)
    const dir = path.join(baseDir(), 'backups')
    await fs.mkdir(dir, { recursive: true })
    const prefix = backupPrefix(name)
    await fs.copyFile(file, path.join(dir, `${prefix}-${stamp()}.json`))
    const names = (await fs.readdir(dir)).filter((n) => n.startsWith(prefix + '-') && /\.json$/.test(n)).sort()
    while (names.length > BACKUP_KEEP) {
      try { await fs.unlink(path.join(dir, names.shift())) } catch {}
    }
  } catch (error) {
    if (error && error.code === 'ENOENT') return
    try { process.emitWarning(`[dsh-inbox] backup failed: ${String(error)}`) } catch {}
  }
}

async function newestBackup(name) {
  try {
    const dir = path.join(baseDir(), 'backups')
    const prefix = backupPrefix(name)
    const names = (await fs.readdir(dir)).filter((n) => n.startsWith(prefix + '-') && /\.json$/.test(n)).sort().reverse()
    if (names.length > 0) return path.join(dir, names[0])
  } catch {}
  return null
}

async function readJson(name, fallback) {
  const file = fileFor(name)
  const candidates = [file, file + '.bak', await newestBackup(name)]
  for (const candidate of candidates) {
    if (!candidate) continue
    try {
      const text = await fs.readFile(candidate, 'utf8')
      return JSON.parse(text)
    } catch (error) {
      if (error && error.code === 'ENOENT') continue
    }
  }
  return fallback
}

async function writeJson(name, value) {
  const file = fileFor(name)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await backupBefore(file, name)
  await atomicWrite(file, JSON.stringify(value, null, 2))
}

// ---------------------------------------------------------------------------
// secret encryption (AES-256-GCM, key file under DSH_HOME)
// ---------------------------------------------------------------------------
let keyCache = null
async function getKey() {
  if (keyCache) return keyCache
  const file = fileFor('secret.key')
  try {
    const buf = await fs.readFile(file)
    if (buf.length === 32) { keyCache = buf; return buf }
  } catch (error) {
    if (!error || error.code !== 'ENOENT') {
      try { process.emitWarning(`[dsh-inbox] read key failed: ${String(error)}`) } catch {}
    }
  }
  const key = crypto.randomBytes(32)
  await fs.mkdir(path.dirname(file), { recursive: true })
  try { await fs.writeFile(file, key, { mode: 0o600 }) } catch { await fs.writeFile(file, key) }
  keyCache = key
  return key
}

export async function encryptSecret(plain) {
  const key = await getKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return 'v1:' + iv.toString('base64') + ':' + tag.toString('base64') + ':' + enc.toString('base64')
}

export async function decryptSecret(payload) {
  if (typeof payload !== 'string' || !payload.startsWith('v1:')) return ''
  const parts = payload.split(':')
  if (parts.length !== 4) return ''
  try {
    const key = await getKey()
    const iv = Buffer.from(parts[1], 'base64')
    const tag = Buffer.from(parts[2], 'base64')
    const data = Buffer.from(parts[3], 'base64')
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    const out = Buffer.concat([decipher.update(data), decipher.final()])
    return out.toString('utf8')
  } catch {
    return ''
  }
}

// ---------------------------------------------------------------------------
// account normalization
// ---------------------------------------------------------------------------
const CHANNELS = { gmail: { host: '', port: 993, label: 'Gmail' }, qqmail: { host: '', port: 993, label: 'QQ邮箱' } }

export function channelDefaults(channel) {
  if (channel === 'gmail') return { host: 'imap.gmail.com', port: 993 }
  if (channel === 'qqmail') return { host: 'imap.qq.com', port: 993 }
  return { host: '', port: 993 }
}

export function normalizeAccount(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const channel = raw.channel === 'gmail' ? 'gmail' : raw.channel === 'qqmail' ? 'qqmail' : null
  if (!channel) return null
  const email = asString(raw.email, 254)
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null
  const defaults = channelDefaults(channel)
  const imapHost = asString(raw.imapHost, 255) || defaults.host
  let imapPort = typeof raw.imapPort === 'number' ? raw.imapPort : Number(raw.imapPort)
  if (!Number.isFinite(imapPort) || imapPort < 1 || imapPort > 65535) imapPort = defaults.port
  return {
    id: asString(raw.id, 64) || crypto.randomUUID(),
    channel,
    email,
    label: asString(raw.label, 60) || email,
    imapHost,
    imapPort: Math.floor(imapPort),
    secure: raw.secure !== false,
    enabled: raw.enabled !== false,
    createdAt: asTime(raw.createdAt) || Date.now(),
    lastSyncAt: asTime(raw.lastSyncAt) || null,
    lastError: asString(raw.lastError, 300) || null,
  }
}

export function publicAccount(account) {
  if (!account) return null
  return {
    id: account.id,
    channel: account.channel,
    email: account.email,
    label: account.label,
    imapHost: account.imapHost,
    imapPort: account.imapPort,
    secure: account.secure,
    enabled: account.enabled,
    createdAt: account.createdAt,
    lastSyncAt: account.lastSyncAt,
    lastError: account.lastError,
  }
}

// ---------------------------------------------------------------------------
// message normalization
// ---------------------------------------------------------------------------
const TYPES = new Set(['text', 'image', 'file', 'audio', 'video', 'link', 'system'])

export function normalizeMessage(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const accountId = asString(raw.accountId, 64)
  const channel = raw.channel === 'gmail' ? 'gmail' : raw.channel === 'qqmail' ? 'qqmail' : null
  if (!accountId || !channel) return null
  const uidValidity = asString(String(raw.uidValidity || ''), 40)
  const uid = typeof raw.uid === 'number' && raw.uid > 0 ? Math.floor(raw.uid) : null
  if (uid === null) return null
  const id = asString(raw.id, 160) || `${channel}:${accountId}:${uidValidity}:${uid}`
  return {
    id,
    accountId,
    channel,
    uidValidity,
    uid,
    messageId: asString(raw.messageId, 300) || null,
    subject: asString(raw.subject, 400) || '(无主题)',
    fromName: asString(raw.fromName, 200),
    fromAddr: asString(raw.fromAddr, 254),
    toText: asString(raw.toText, 400),
    date: asTime(raw.date) || Date.now(),
    size: typeof raw.size === 'number' && raw.size > 0 ? Math.floor(raw.size) : null,
    hasAttachments: raw.hasAttachments === true,
    seen: raw.seen === true,
    createdAt: asTime(raw.createdAt) || Date.now(),
  }
}

// ---------------------------------------------------------------------------
// high-level readers/writers
// ---------------------------------------------------------------------------
function accountsDocToArray(doc) {
  const out = []
  const seen = new Set()
  const list = doc && Array.isArray(doc.accounts) ? doc.accounts : []
  for (const item of list) {
    const account = normalizeAccount(item)
    if (account === null || seen.has(account.id)) continue
    seen.add(account.id)
    out.push(account)
  }
  return out
}

export async function readAccounts() {
  const doc = await readJson('accounts.json', { accounts: [] })
  return accountsDocToArray(doc)
}

export async function writeAccounts(accounts) {
  await writeJson('accounts.json', { version: 1, accounts })
}

export async function readSecrets() {
  const doc = await readJson('secrets.json', { entries: {} })
  return doc && typeof doc.entries === 'object' && doc.entries ? doc.entries : {}
}

export async function writeSecret(accountId, plain) {
  const entries = await readSecrets()
  entries[accountId] = await encryptSecret(plain)
  await writeJson('secrets.json', { version: 1, entries })
}

export async function deleteSecret(accountId) {
  const entries = await readSecrets()
  if (Object.prototype.hasOwnProperty.call(entries, accountId)) {
    delete entries[accountId]
    await writeJson('secrets.json', { version: 1, entries })
  }
}

export async function readPassword(accountId) {
  const entries = await readSecrets()
  return decryptSecret(entries[accountId])
}

export function messageDocToArray(doc) {
  const out = []
  const seen = new Set()
  const list = doc && Array.isArray(doc.messages) ? doc.messages : []
  for (const item of list) {
    const msg = normalizeMessage(item)
    if (msg === null || seen.has(msg.id)) continue
    seen.add(msg.id)
    out.push(msg)
  }
  return out
}

export async function readMessages() {
  return messageDocToArray(await readJson('messages.json', { messages: [] }))
}

/** Upsert messages by id, keep newest MAX_MESSAGES by date. */
export function mergeMessages(existing, incoming) {
  const byId = new Map()
  for (const msg of existing) byId.set(msg.id, msg)
  for (const msg of incoming) {
    if (!msg) continue
    const prev = byId.get(msg.id)
    byId.set(msg.id, prev ? { ...prev, ...msg, seen: prev.seen } : msg)
  }
  const all = Array.from(byId.values())
  all.sort((a, b) => (b.date || 0) - (a.date || 0))
  return all.slice(0, MAX_MESSAGES)
}

export async function writeMessages(messages) {
  await writeJson('messages.json', { version: 1, messages })
}

export async function readCursors() {
  const doc = await readJson('cursors.json', { byAccount: {} })
  return doc && typeof doc.byAccount === 'object' && doc.byAccount ? doc.byAccount : {}
}

export async function writeCursor(accountId, cursor) {
  const byAccount = await readCursors()
  byAccount[accountId] = cursor
  await writeJson('cursors.json', { version: 1, byAccount })
}
