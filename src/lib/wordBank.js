/**
 * Word bank manager.
 * Owns the merge of built-in content + admin edits, persistence, import/export
 * and word selection used by the game engine.
 */

import { STORAGE_KEYS } from '../data/constants.js'
import { DEFAULT_CATEGORIES, RANDOM_CATEGORY, cloneDefaultCategories } from '../data/words.js'
import { randomInt, shuffle, uid } from '../utils/random.js'
import { validateCategoryName, validateWord } from '../utils/validate.js'
import { readJSON, writeJSON } from '../utils/storage.js'

const slugify = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32) || `cat-${uid('c').slice(-5)}`

/** Fresh, uncorrupted default bank. */
export function defaultBank() {
  return { version: 1, categories: cloneDefaultCategories(), updatedAt: Date.now() }
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
      words.push({ word: check.value, difficulty })
    })
    if (!words.length) return
    categories.push({ id, name: nameCheck.value, builtin: Boolean(cat.builtin), words })
  })
  if (!categories.length) return defaultBank()
  return { version: 1, categories, updatedAt: Number(raw.updatedAt) || Date.now() }
}

export function loadBank() {
  const stored = readJSON(STORAGE_KEYS.wordBank, null)
  if (!stored) {
    const fresh = defaultBank()
    writeJSON(STORAGE_KEYS.wordBank, fresh)
    return fresh
  }
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

export function addWord(bank, { categoryId, word, difficulty = 'medium' }) {
  const cat = bank.categories.find((c) => c.id === categoryId)
  if (!cat) return { bank, error: 'Pick a category first.' }
  const check = validateWord(word)
  if (!check.ok) return { bank, error: check.error }
  if (cat.words.some((w) => w.word.toLowerCase() === check.value.toLowerCase()))
    return { bank, error: 'That word is already in this category.' }
  const tier = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'medium'
  return {
    bank: {
      ...bank,
      categories: bank.categories.map((c) =>
        c.id === categoryId ? { ...c, words: [...c.words, { word: check.value, difficulty: tier }] } : c,
      ),
    },
  }
}

export function updateWord(bank, { categoryId, index, word, difficulty }) {
  const cat = bank.categories.find((c) => c.id === categoryId)
  if (!cat || !cat.words[index]) return { bank, error: 'That word no longer exists.' }
  const check = validateWord(word)
  if (!check.ok) return { bank, error: check.error }
  const tier = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : cat.words[index].difficulty
  return {
    bank: {
      ...bank,
      categories: bank.categories.map((c) =>
        c.id === categoryId
          ? { ...c, words: c.words.map((w, i) => (i === index ? { word: check.value, difficulty: tier } : w)) }
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
  return sanitizeBank(payload) ?? bank
}

export function exportBank(bank) {
  return JSON.stringify({ version: 1, categories: bank.categories, updatedAt: Date.now() }, null, 2)
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
      pool.push({ word: entry.word, difficulty: entry.difficulty, categoryId: category.id, categoryName: category.name })
    })
  })

  let candidates = pool.filter((c) => !exclude.includes(c.word))
  if (!candidates.length) candidates = pool
  if (!candidates.length) {
    // Difficulty filter produced nothing (tiny custom bank) — retry without it.
    const relaxed = []
    bank.categories.forEach((category) => {
      if (!(wantRandom || categoryIds.includes(category.id))) return
      category.words.forEach((entry) => relaxed.push({ word: entry.word, difficulty: entry.difficulty, categoryId: category.id, categoryName: category.name }))
    })
    candidates = relaxed.length ? relaxed : bank.categories.flatMap((c) => c.words.map((w) => ({ ...w, categoryId: c.id, categoryName: c.name })))
  }
  if (!candidates.length) return { word: 'Mystery', difficulty: 'medium', categoryId: 'fallback', categoryName: 'Fallback' }

  const pick = candidates[randomInt(candidates.length)]
  // A decoy invites the imposters to bluff a plausible-but-wrong clue.
  const decoys = candidates.filter((c) => c.word !== pick.word)
  const decoy = decoys.length ? decoys[randomInt(Math.min(decoys.length, 24))].word : null

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
