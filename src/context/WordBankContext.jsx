/**
 * WordBankProvider — the live word database.
 * Built-in content + admin edits, persisted locally, with an optional
 * Supabase-backed share/pull for cross-device sync.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  addCategory,
  addWord,
  bankStats,
  categoryOptions,
  deleteCategory,
  deleteWord,
  exportBank,
  importBank,
  loadBank,
  pickWord,
  renameCategory,
  resetBank,
  saveBank,
  updateWord,
} from '../lib/wordBank.js'
import { fetchSharedWords, isConfigured, pushSharedWords } from '../lib/onlineService.js'

const WordBankContext = createContext(null)

export function WordBankProvider({ children }) {
  const [bank, setBank] = useState(() => loadBank())
  const [status, setStatus] = useState({ syncing: false, lastSync: null, error: null })

  /** Every mutation funnels through here: new bank + persistence + notice. */
  const commit = useCallback((producer) => {
    let outcome = null
    setBank((current) => {
      outcome = producer(current)
      if (!outcome || !outcome.bank) return current
      saveBank(outcome.bank)
      return outcome.bank
    })
    return outcome
  }, [])

  const api = useMemo(
    () => ({
      bank,
      stats: bankStats(bank),
      categories: categoryOptions(bank),

      /** Word selection used by the local game engine. */
      pick: (config) => pickWord(bank, { categoryIds: config.categoryIds, difficulty: config.difficulty, exclude: config.exclude }),

      createCategory: (name) => commit((current) => addCategory(current, name)),
      editCategory: (id, name) => commit((current) => renameCategory(current, id, name)),
      removeCategory: (id) => commit((current) => deleteCategory(current, id)),

      createWord: (payload) => commit((current) => addWord(current, payload)),
      editWord: (payload) => commit((current) => updateWord(current, payload)),
      removeWord: (payload) => commit((current) => deleteWord(current, payload)),

      resetToDefaults: () => {
        const fresh = resetBank()
        setBank(fresh)
        return fresh
      },

      exportJSON: () => exportBank(bank),
      importJSON: (payload) => {
        const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload
        const clean = importBank(bank, parsed)
        saveBank(clean)
        setBank(clean)
        return clean
      },

      /** Push this device's bank to Supabase (admin only, optional). */
      pushOnline: async () => {
        if (!isConfigured()) throw new Error('Online sync is not configured')
        setStatus({ syncing: true, lastSync: null, error: null })
        try {
          await pushSharedWords({ categories: bank.categories, updatedAt: Date.now() })
          setStatus({ syncing: false, lastSync: Date.now(), error: null })
          return true
        } catch (error) {
          setStatus({ syncing: false, lastSync: null, error: error.message })
          throw error
        }
      },

      /** Pull the cloud bank into this device. */
      pullOnline: async () => {
        if (!isConfigured()) throw new Error('Online sync is not configured')
        setStatus({ syncing: true, lastSync: null, error: null })
        try {
          const rows = await fetchSharedWords()
          const row = rows.find((r) => r.id === 'default') || rows[0]
          if (!row?.payload) throw new Error('No shared word database found yet')
          const clean = importBank(bank, row.payload)
          saveBank(clean)
          setBank(clean)
          setStatus({ syncing: false, lastSync: Date.now(), error: null })
          return clean
        } catch (error) {
          setStatus({ syncing: false, lastSync: null, error: error.message })
          throw error
        }
      },

      syncStatus: status,
    }),
    [bank, commit, status],
  )

  /* Keep multiple tabs of the same browser consistent. */
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key && event.key.includes('words')) setBank(loadBank())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  return <WordBankContext.Provider value={api}>{children}</WordBankContext.Provider>
}

export function useWordBank() {
  const ctx = useContext(WordBankContext)
  if (!ctx) throw new Error('useWordBank must be used inside <WordBankProvider>')
  return ctx
}
