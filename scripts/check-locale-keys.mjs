/**
 * Ensures every src/locales/*.json has the same leaf keys as en.json.
 * Run: node scripts/check-locale-keys.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

function flatten(obj, prefix = '') {
  const out = new Set()
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return out
  for (const k of Object.keys(obj)) {
    const p = prefix ? `${prefix}.${k}` : k
    const v = obj[k]
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      for (const x of flatten(v, p)) out.add(x)
    } else {
      out.add(p)
    }
  }
  return out
}

const dir = 'src/locales'
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .sort()
const baseName = 'en.json'
const base = JSON.parse(fs.readFileSync(path.join(dir, baseName), 'utf8'))
const baseKeys = flatten(base)

const issues = []
for (const f of files) {
  if (f === baseName) continue
  const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
  const keys = flatten(j)
  for (const k of baseKeys) {
    if (!keys.has(k)) issues.push({ file: f, kind: 'missing', key: k })
  }
  for (const k of keys) {
    if (!baseKeys.has(k)) issues.push({ file: f, kind: 'extra', key: k })
  }
}

if (issues.length) {
  console.error(JSON.stringify(issues, null, 2))
  process.exit(1)
}
console.log(`OK: ${files.length} locale files, ${baseKeys.size} keys each (vs ${baseName})`)
