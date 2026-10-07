/**
 * Word bank manager.
 * Owns the merge of built-in content + admin edits, persistence, import/export
 * and word selection used by the game engine.
 */

import { STORAGE_KEYS } from '../data/constants.js'
import { DEFAULT_CATEGORIES, RANDOM_CATEGORY, cloneDefaultCategories } from '../data/words.js'
import { BUILTIN_HINTS } from '../data/hints.js'
import { randomInt, shuffle, uid } from '../utils/random.js'
import { validateCategoryName, validateWord } from '../utils/validate.js'
import { readJSON, writeJSON } from '../utils/storage.js'

const slugify = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32) || `cat-${uid('c').slice(-5)}`

/**
 * Bank format version.
 *   1 → words stored as { word, difficulty }
 *   2 → words may also carry `hints` (the imposter's cover words)
 * A stored v1 bank is upgraded in place on load: built-in words that have no
 * hints yet pick up the curated ones, while anything the player added or edited
 * is left exactly as it is.
 */
export const BANK_VERSION = 2

/** Fresh, uncorrupted default bank. */
export function defaultBank() {
  return { version: BANK_VERSION, categories: cloneDefaultCategories(), updatedAt: Date.now() }
}

/**
 * Bring a bank saved by an older version up to date.
 *
 * Only built-in words are touched, and only to ADD hints where none exist — a
 * hint list the player wrote themselves always wins, and custom words/categories
 * are never modified. Returns the same object when there is nothing to do.
 */
export function upgradeBank(bank) {
  if (!bank || !Array.isArray(bank.categories)) return bank
  if (Number(bank.version) >= BANK_VERSION) return bank
  let changed = false
  const categories = bank.categories.map((category) => {
    if (!category?.builtin) return category
    let categoryChanged = false
    const words = (category.words || []).map((entry) => {
      if (!entry?.word) return entry
      if (Array.isArray(entry.hints) && entry.hints.length) return entry
      const curated = BUILTIN_HINTS[entry.word]
      if (!curated?.length) return entry
      categoryChanged = true
      return { ...entry, hints: [...curated] }
    })
    if (!categoryChanged) return category
    changed = true
    return { ...category, words }
  })
  if (!changed) return { ...bank, version: BANK_VERSION }
  return { ...bank, version: BANK_VERSION, categories }
}

function sanitizeBank(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.categories)) return defaultBank()
  const categories = []
  const usedIds = new Set()
  raw.categories.forEach((cat) => {
    if (!cat || typeof cat !== 'object') return
    const nameCheck = validateCategoryName(cat.name)
    if (!nameCheck.ok) return
    let id = typeof cat.id === 'string' && cat.id ? cat.id : slugify(nameCheck.value)
    while (usedIds.has(id)) id = `${id}-2`
    usedIds.add(id)
    const words = []
    const usedWords = new Set()
    ;(Array.isArray(cat.words) ? cat.words : []).forEach((entry) => {
      const word = typeof entry === 'string' ? entry : entry?.word
      const check = validateWord(word)
      if (!check.ok) return
      const key = check.value.toLowerCase()
      if (usedWords.has(key)) return
      usedWords.add(key)
      const difficulty = ['easy', 'medium', 'hard'].includes(entry?.difficulty) ? entry.difficulty : 'medium'
      const hints = normalizeHints(entry?.hints, check.value)
      words.push(hints.length ? { word: check.value, difficulty, hints } : { word: check.value, difficulty })
    })
    if (!words.length) return
    categories.push({ id, name: nameCheck.value, builtin: Boolean(cat.builtin), words })
  })
  if (!categories.length) return defaultBank()
  return {
    version: Math.max(1, Number(raw.version) || 1),
    categories,
    updatedAt: Number(raw.updatedAt) || Date.now(),
  }
}

/**
 * Cover words ("hints") are the words the imposter may bluff with. A word can
 * carry several of them and the game draws one at random each time it is dealt,
 * so a single stored word gives a different bluff on every replay.
 */
export const MAX_HINTS = 6

/** Fold whatever the editor sent into a clean, de-duplicated hint list. */
export function normalizeHints(input, word = '') {
  const raw = Array.isArray(input) ? input : String(input ?? '').split(/[,\n]/)
  const taken = new Set()
  const target = String(word || '').trim().toLowerCase()
  const hints = []
  raw.forEach((candidate) => {
    const check = validateWord(String(candidate ?? '').trim())
    if (!check.ok) return
    const key = check.value.toLowerCase()
    if (key === target || taken.has(key)) return
    taken.add(key)
    if (hints.length < MAX_HINTS) hints.push(check.value)
  })
  return hints
}

export function loadBank() {
  const stored = readJSON(STORAGE_KEYS.wordBank, null)
  if (!stored) {
    const fresh = defaultBank()
    writeJSON(STORAGE_KEYS.wordBank, fresh)
    return fresh
  }
  /* A bank from an older version (no cover words yet) is upgraded on the spot
     and written back, so every device gets the curated hints once. */
  const upgraded = upgradeBank(sanitizeBank(stored))
  if (upgraded !== stored && Number(stored.version) < BANK_VERSION) writeJSON(STORAGE_KEYS.wordBank, upgraded)
  return upgraded
  const safe = sanitizeBank(stored)
  return safe
}

export function saveBank(bank) {
  const payload = { version: 1, categories: bank.categories, updatedAt: Date.now() }
  writeJSON(STORAGE_KEYS.wordBank, payload)
  return payload
}

export function resetBank() {
  const fresh = defaultBank()
  saveBank(fresh)
  return fresh
}

/** All categories including the virtual "Random" meta-category. */
export function categoriesWithRandom(bank) {
  return [RANDOM_CATEGORY, ...bank.categories]
}

export function findCategory(bank, id) {
  if (id === RANDOM_CATEGORY.id) return RANDOM_CATEGORY
  return bank.categories.find((c) => c.id === id) || null
}

export function bankStats(bank) {
  const categories = bank.categories.length
  const words = bank.categories.reduce((sum, c) => sum + c.words.length, 0)
  const byDifficulty = { easy: 0, medium: 0, hard: 0 }
  bank.categories.forEach((c) =>
    c.words.forEach((w) => {
      byDifficulty[w.difficulty] = (byDifficulty[w.difficulty] || 0) + 1
    }),
  )
  return { categories, words, byDifficulty, updatedAt: bank.updatedAt }
}

/* -------------------------------------------------------------------------- */
/* Mutations (all pure-ish: take a bank, return a new bank)                    */
/* -------------------------------------------------------------------------- */

export function addCategory(bank, name) {
  const check = validateCategoryName(name)
  if (!check.ok) return { bank, error: check.error }
  if (bank.categories.some((c) => c.name.toLowerCase() === check.value.toLowerCase()))
    return { bank, error: 'That category already exists.' }
  let id = slugify(check.value)
  while (bank.categories.some((c) => c.id === id)) id = `${id}-2`
  const category = { id, name: check.value, builtin: false, words: [] }
  return { bank: { ...bank, categories: [...bank.categories, category] }, category }
}

export function renameCategory(bank, categoryId, name) {
  const check = validateCategoryName(name)
  if (!check.ok) return { bank, error: check.error }
  if (bank.categories.some((c) => c.id !== categoryId && c.name.toLowerCase() === check.value.toLowerCase()))
    return { bank, error: 'Another category already uses that name.' }
  return {
    bank: { ...bank, categories: bank.categories.map((c) => (c.id === categoryId ? { ...c, name: check.value } : c)) },
  }
}

export function deleteCategory(bank, categoryId) {
  const next = bank.categories.filter((c) => c.id !== categoryId)
  if (!next.length) return { bank, error: 'At least one category must remain.' }
  return { bank: { ...bank, categories: next } }
}

export function addWord(bank, { categoryId, word, difficulty = 'medium', hints = [] }) {
  const cat = bank.categories.find((c) => c.id === categoryId)
  if (!cat) return { bank, error: 'Pick a category first.' }
  const check = validateWord(word)
  if (!check.ok) return { bank, error: check.error }
  if (cat.words.some((w) => w.word.toLowerCase() === check.value.toLowerCase()))
    return { bank, error: 'That word is already in this category.' }
  const tier = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'medium'
  const clean = normalizeHints(hints, check.value)
  const entry = clean.length ? { word: check.value, difficulty: tier, hints: clean } : { word: check.value, difficulty: tier }
  return {
    bank: {
      ...bank,
      categories: bank.categories.map((c) => (c.id === categoryId ? { ...c, words: [...c.words, entry] } : c)),
    },
  }
}

export function updateWord(bank, { categoryId, index, word, difficulty, hints }) {
  const cat = bank.categories.find((c) => c.id === categoryId)
  if (!cat || !cat.words[index]) return { bank, error: 'That word no longer exists.' }
  const check = validateWord(word)
  if (!check.ok) return { bank, error: check.error }
  const tier = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : cat.words[index].difficulty
  /* `hints` is optional: a call that only reclassifies a word keeps its hints. */
  const clean = normalizeHints(hints === undefined ? cat.words[index].hints : hints, check.value)
  return {
    bank: {
      ...bank,
      categories: bank.categories.map((c) =>
        c.id === categoryId
          ? {
              ...c,
              words: c.words.map((w, i) =>
                i === index ? (clean.length ? { word: check.value, difficulty: tier, hints: clean } : { word: check.value, difficulty: tier }) : w,
              ),
            }
          : c,
      ),
    },
  }
}

export function deleteWord(bank, { categoryId, index }) {
  return {
    bank: {
      ...bank,
      categories: bank.categories.map((c) => (c.id === categoryId ? { ...c, words: c.words.filter((_, i) => i !== index) } : c)),
    },
  }
}

export function importBank(bank, payload) {
  return upgradeBank(sanitizeBank(payload)) ?? bank
}

export function exportBank(bank) {
  return JSON.stringify({ version: BANK_VERSION, categories: bank.categories, updatedAt: Date.now() }, null, 2)
}

/* -------------------------------------------------------------------------- */
/* Word selection used by the engine                                          */
/* -------------------------------------------------------------------------- */

/**
 * Choose a secret word, honouring the selected categories and difficulty.
 * Falls back gracefully (never returns null) so a game can always start.
 */
export function pickWord(bank, { categoryIds = ['random'], difficulty = 'mixed', exclude = [] } = {}) {
  const wantRandom = !categoryIds?.length || categoryIds.includes(RANDOM_CATEGORY.id)
  const pool = []

  bank.categories.forEach((category) => {
    const selected = wantRandom || categoryIds.includes(category.id)
    if (!selected) return
    category.words.forEach((entry) => {
      if (difficulty !== 'mixed' && entry.difficulty !== difficulty) return
      pool.push({ word: entry.word, difficulty: entry.difficulty, categoryId: category.id, categoryName: category.name, hints: entry.hints })
    })
  })

  /*
   * Recently used words are skipped so a replay deals something new. If the
   * list would empty the pool, exclusions are dropped OLDEST first — a
   * three-word bank still rotates instead of handing back the last word while
   * two untouched words sit right there. Only a single-word pool can repeat.
   */
  let candidates = pool.filter((c) => !exclude.includes(c.word))
  for (let drop = 0; drop < exclude.length - 1 && !candidates.length; drop += 1) {
    const kept = exclude.slice(drop + 1)
    candidates = pool.filter((c) => !kept.includes(c.word))
  }
  if (!candidates.length) candidates = pool
  if (!candidates.length) {
    // Difficulty filter produced nothing (tiny custom bank) — retry without it.
    const relaxed = []
    bank.categories.forEach((category) => {
      if (!(wantRandom || categoryIds.includes(category.id))) return
      category.words.forEach((entry) => relaxed.push({ word: entry.word, difficulty: entry.difficulty, categoryId: category.id, categoryName: category.name, hints: entry.hints }))
    })
    candidates = relaxed.length ? relaxed : bank.categories.flatMap((c) => c.words.map((w) => ({ ...w, categoryId: c.id, categoryName: c.name })))
  }
  if (!candidates.length) return { word: 'Mystery', difficulty: 'medium', categoryId: 'fallback', categoryName: 'Fallback' }

  const pick = candidates[randomInt(candidates.length)]

  /*
   * The decoy is the cover word the imposter bluffs with, so it has to fit
   * beside the real word:
   *   1. the word's own hints, if the editor gave it any — one at random;
   *   2. otherwise another word from the same category, which keeps the bluff
   *      in the same world as the word (a "kitchen sink" never gets "backpack");
   *   3. only then anything else in the pool, so a one-word category still deals.
   */
  const sameCategory = candidates.filter((c) => c.word !== pick.word && c.categoryId === pick.categoryId)
  const wider = candidates.filter((c) => c.word !== pick.word)
  const decoyPool = sameCategory.length ? sameCategory : wider
  const hint = Array.isArray(pick.hints) && pick.hints.length ? pick.hints[randomInt(pick.hints.length)] : null
  const decoy = hint || (decoyPool.length ? decoyPool[randomInt(Math.min(decoyPool.length, 24))].word : null)

  return { ...pick, decoy }
}

/** Category options for setup UIs, including word counts. */
export function categoryOptions(bank) {
  const total = bank.categories.reduce((s, c) => s + c.words.length, 0)
  return [
    { id: RANDOM_CATEGORY.id, name: RANDOM_CATEGORY.name, count: total, builtin: true, meta: true },
    ...bank.categories.map((c) => ({ id: c.id, name: c.name, count: c.words.length, builtin: c.builtin })),
  ]
}

/** Deterministic 1-2-3 suggestion of unused words for the admin "surprise me". */
export function suggestWords(bank, count = 3, difficulty = 'mixed') {
  const all = []
  bank.categories.forEach((c) => c.words.forEach((w) => all.push({ ...w, categoryId: c.id, categoryName: c.name })))
  const filtered = difficulty === 'mixed' ? all : all.filter((w) => w.difficulty === difficulty)
  return shuffle(filtered).slice(0, count)
}

export { DEFAULT_CATEGORIES, slugify }
