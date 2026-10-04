'use strict'

/**
 * patch-package only calls this when neither package-lock.json nor yarn.lock
 * exists. Brezn is npm-only, so a null root is correct and avoids pulling
 * micromatch/braces (GHSA-vfj7-8cjw-p6xm / CVE-2026-93687).
 */
module.exports = function findWorkspaceRoot() {
  return null
}
