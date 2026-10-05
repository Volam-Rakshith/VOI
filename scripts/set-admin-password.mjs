#!/usr/bin/env node
/**
 * Rotate the BLACK BOX access phrase.
 *
 *   node scripts/set-admin-password.mjs "my new passphrase"
 *
 * Prints a salted SHA-256 digest. Paste it over the DIGEST constant in
 * src/lib/blackbox.js — the plaintext NEVER lives in the source tree.
 */

import { createHash } from 'node:crypto'

const SALT = 'vrdev.imposter.blackbox.v1'
const phrase = process.argv[2]

if (!phrase) {
  console.error('Usage: node scripts/set-admin-password.mjs "new passphrase"')
  process.exit(1)
}

const digest = createHash('sha256').update(SALT + phrase).digest('hex')

console.log('\nSalt :', SALT)
console.log('Digest:', digest)
console.log('\nPaste this into src/lib/blackbox.js:')
console.log(`const DIGEST = '${digest}'\n`)
