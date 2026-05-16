#!/usr/bin/env node
/**
 * Fails CI when package-lock.json contains unexpected lifecycle install scripts.
 * With ignore-scripts=true, only allowlisted optional native hooks (e.g. fsevents) may appear.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'))

/** Packages that may set hasInstallScript in the lockfile (optional platform deps). */
const INSTALL_SCRIPT_ALLOWLIST = new Set(['fsevents'])

function lockEntryName(pkgPath) {
  return pkgPath.replace(/^node_modules\//, '').replace(/\/node_modules\//g, '/')
}

const errors = []

for (const [pkgPath, meta] of Object.entries(lock.packages ?? {})) {
  if (!meta || typeof meta !== 'object') continue

  if (meta.hasInstallScript) {
    if (pkgPath === '') {
      errors.push(
        'Root package must not use lifecycle install scripts. Use `npm run apply-patches` after install instead of postinstall.',
      )
      continue
    }
    const name = lockEntryName(pkgPath)
    const leaf = name.split('/').pop()
    const allowed =
      INSTALL_SCRIPT_ALLOWLIST.has(name) ||
      INSTALL_SCRIPT_ALLOWLIST.has(leaf) ||
      name.endsWith('/fsevents')
    if (!allowed) {
      errors.push(`Unexpected install script in lockfile: ${name}`)
    }
  }
}

if (errors.length) {
  console.error('Lockfile install-script check failed:\n')
  for (const e of [...new Set(errors)]) console.error(`  - ${e}`)
  process.exit(1)
}

console.log('Lockfile install-script check passed.')
