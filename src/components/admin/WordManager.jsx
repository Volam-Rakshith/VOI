/**
 * WordManager — full CRUD over the word database plus category management,
 * search, difficulty filters, import/export and a guarded reset.
 */

import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Button } from '../ui/Button.jsx'
import { Field, SegmentedControl } from '../ui/Controls.jsx'
import { Badge } from '../ui/Layout.jsx'
import { Panel, PanelBody, PanelHeader } from '../ui/Panel.jsx'
import { EmptyState, InlineNotice } from '../ui/Feedback.jsx'
import { ConfirmDialog } from '../ui/ConfirmDialog.jsx'
import { Modal } from '../ui/Modal.jsx'
import { useWordBank } from '../../context/WordBankContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { audit } from '../../lib/blackbox.js'
import { DIFFICULTY_TIERS } from '../../data/words.js'

const TIER_TONE = { easy: 'cyan', medium: 'violet', hard: 'magenta' }

export function WordManager() {
  const { bank, stats, createCategory, editCategory, removeCategory, createWord, editWord, removeWord, resetToDefaults, exportJSON, importJSON } = useWordBank()
  const toast = useToast()

  const [categoryId, setCategoryId] = useState(bank.categories[0]?.id || null)
  const [query, setQuery] = useState('')
  const [tier, setTier] = useState('all')
  const [draft, setDraft] = useState({ word: '', difficulty: 'medium' })
  const [error, setError] = useState('')
  const [pending, setPending] = useState(null) // { kind, payload, title, message }
  const [categoryModal, setCategoryModal] = useState(null) // { mode: 'create'|'rename', name }
  const [importModal, setImportModal] = useState(false)
  const [importText, setImportText] = useState('')

  const activeCategory = bank.categories.find((c) => c.id === categoryId) || bank.categories[0] || null

  const rows = useMemo(() => {
    if (!activeCategory) return []
    const q = query.trim().toLowerCase()
    return activeCategory.words
      .map((entry, index) => ({ ...entry, index }))
      .filter((entry) => (tier === 'all' ? true : entry.difficulty === tier))
      .filter((entry) => (q ? entry.word.toLowerCase().includes(q) : true))
  }, [activeCategory, query, tier])

  const submitWord = () => {
    if (!activeCategory) return
    const result = createWord({ categoryId: activeCategory.id, word: draft.word, difficulty: draft.difficulty })
    if (result?.error) {
      setError(result.error)
      return
    }
    setError('')
    setDraft({ word: '', difficulty: draft.difficulty })
    toast.success(`Added to ${activeCategory.name}`)
    audit('word-add', `${activeCategory.name}: ${draft.word}`)
  }

  const handleDelete = () => {
    if (!pending) return
    if (pending.kind === 'word') {
      removeWord(pending.payload)
      audit('word-delete', `${pending.payload.word || 'entry'}`)
      toast.info('Word removed')
    } else if (pending.kind === 'category') {
      const result = removeCategory(pending.payload.categoryId)
      if (result?.error) toast.error(result.error)
      else {
        setCategoryId(bank.categories.find((c) => c.id !== pending.payload.categoryId)?.id || null)
        audit('category-delete', pending.payload.name)
        toast.info('Category removed')
      }
    } else if (pending.kind === 'reset') {
      resetToDefaults()
      audit('word-reset', 'Restored factory word database')
      toast.success('Word database restored to defaults')
    }
    setPending(null)
  }

  const submitCategory = () => {
    if (!categoryModal) return
    if (categoryModal.mode === 'create') {
      const result = createCategory(categoryModal.name)
      if (result?.error) {
        toast.error(result.error)
        return
      }
      if (result?.category) setCategoryId(result.category.id)
      audit('category-add', categoryModal.name)
      toast.success('Category created')
    } else {
      const result = editCategory(categoryModal.id, categoryModal.name)
      if (result?.error) {
        toast.error(result.error)
        return
      }
      audit('category-rename', categoryModal.name)
      toast.success('Category renamed')
    }
    setCategoryModal(null)
  }

  const handleExport = () => {
    const json = exportJSON()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `imposter-words-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
    toast.success('Word database exported')
  }

  const handleImport = () => {
    try {
      importJSON(importText)
      setImportModal(false)
      setImportText('')
      audit('word-import', 'Imported a word database')
      toast.success('Word database imported')
    } catch {
      toast.error('That JSON could not be read. Check the file and try again.')
    }
  }

  return (
    <div className="space-y-4">
      <Panel annotated>
        <PanelHeader
          title="WORD DATABASE"
          subtitle={`${stats.words} words · ${stats.categories} categories · saved locally`}
          right={<Badge tone="cyan">live</Badge>}
        />
        <PanelBody>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <label htmlFor="wb-category" className="label mb-1.5 block">
                category
              </label>
              <select id="wb-category" className="field" value={activeCategory?.id || ''} onChange={(event) => setCategoryId(event.target.value)}>
                {bank.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name} ({category.words.length})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 sm:items-end">
              <Button size="sm" variant="ghost" onClick={() => setCategoryModal({ mode: 'create', name: '' })}>
                + Category
              </Button>
              {activeCategory && (
                <>
                  <Button size="sm" variant="quiet" onClick={() => setCategoryModal({ mode: 'rename', id: activeCategory.id, name: activeCategory.name })}>
                    Rename
                  </Button>
                  <Button
                    size="sm"
                    variant="quiet"
                    className="!text-fuchsia-200"
                    onClick={() =>
                      setPending({
                        kind: 'category',
                        payload: { categoryId: activeCategory.id, name: activeCategory.name },
                        title: `Delete ${activeCategory.name}?`,
                        message: `${activeCategory.words.length} words in this category will be removed. This cannot be undone.`,
                      })
                    }
                  >
                    Delete
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
            <Field label="search" placeholder="Search words…" value={query} onChange={(event) => setQuery(event.target.value)} />
            <div className="sm:self-end">
              <SegmentedControl
                size="sm"
                value={tier}
                onChange={setTier}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'easy', label: 'Casual' },
                  { value: 'medium', label: 'Sharp' },
                  { value: 'hard', label: 'Vicious' },
                ]}
              />
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-cyan-400/25 bg-cyan-500/5 p-3">
            <p className="label mb-2">add a word</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                className={`field flex-1 ${error ? 'field-invalid' : ''}`}
                placeholder="New word"
                value={draft.word}
                maxLength={28}
                aria-label="New word"
                onChange={(event) => {
                  setDraft((d) => ({ ...d, word: event.target.value }))
                  setError('')
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') submitWord()
                }}
              />
              <select
                className="field sm:w-36"
                value={draft.difficulty}
                aria-label="Difficulty"
                onChange={(event) => setDraft((d) => ({ ...d, difficulty: event.target.value }))}
              >
                {DIFFICULTY_TIERS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <Button size="md" variant="primary" onClick={submitWord}>
                Add
              </Button>
            </div>
            {error && <p className="mt-1.5 text-[11.5px] font-semibold text-magenta-neon">{error}</p>}
          </div>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title={`${activeCategory?.name || 'Words'} · ${rows.length}`} subtitle="Tap a tier chip to reclassify, edit inline or remove" />
        <PanelBody>
          {rows.length ? (
            <ul className="space-y-2">
              <AnimatePresence initial={false}>
                {rows.slice(0, 300).map((entry) => (
                  <motion.li
                    key={`${activeCategory?.id}-${entry.index}-${entry.word}`}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    className="flex flex-col gap-2 rounded-xl border border-violet-500/20 bg-black/30 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3"
                  >
                    <input
                      className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1.5 font-display text-[12.5px] tracking-[.06em] text-violet-50 transition hover:border-violet-500/25 focus:border-cyan-300/60 focus:bg-black/40 focus:outline-none"
                      defaultValue={entry.word}
                      aria-label={`Edit ${entry.word}`}
                      onBlur={(event) => {
                        const value = event.target.value
                        if (value === entry.word) return
                        const result = editWord({ categoryId: activeCategory.id, index: entry.index, word: value, difficulty: entry.difficulty })
                        if (result?.error) {
                          toast.error(result.error)
                          event.target.value = entry.word
                        } else audit('word-edit', value)
                      }}
                    />
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        {DIFFICULTY_TIERS.map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => editWord({ categoryId: activeCategory.id, index: entry.index, word: entry.word, difficulty: t })}
                            className={`rounded-md border px-2 py-1 text-[10px] uppercase tracking-wider transition ${
                              entry.difficulty === t
                                ? t === 'easy'
                                  ? 'border-cyan-300/60 bg-cyan-500/15 text-cyan-100'
                                  : t === 'medium'
                                    ? 'border-violet-300/60 bg-violet-500/15 text-violet-100'
                                    : 'border-fuchsia-400/60 bg-fuchsia-500/15 text-fuchsia-100'
                                : 'border-violet-500/20 text-violet-200/45 hover:border-violet-300/40'
                            }`}
                            aria-pressed={entry.difficulty === t}
                          >
                            {t === 'easy' ? 'casual' : t === 'medium' ? 'sharp' : 'vicious'}
                          </button>
                        ))}
                      </div>
                      <Button
                        size="sm"
                        variant="quiet"
                        className="!min-h-8 !px-2 !text-fuchsia-200"
                        aria-label={`Delete ${entry.word}`}
                        onClick={() =>
                          setPending({
                            kind: 'word',
                            payload: { categoryId: activeCategory.id, index: entry.index, word: entry.word },
                            title: `Delete “${entry.word}”?`,
                            message: 'This word will no longer appear in games.',
                          })
                        }
                      >
                        ✕
                      </Button>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          ) : (
            <EmptyState
              title={query || tier !== 'all' ? 'No matches' : 'This category is empty'}
              message={
                query || tier !== 'all'
                  ? 'Try a different search or difficulty filter.'
                  : 'Add your first word above — custom words mix straight into the game.'
              }
            />
          )}
          {rows.length > 300 && <p className="mt-3 text-center text-[11px] text-violet-200/45">Showing the first 300 of {rows.length} matches.</p>}
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title="PERFORMANCE & PERSISTENCE" subtitle="Local, offline-first storage with optional cloud sync" />
        <PanelBody className="space-y-3">
          <div className="grid grid-cols-2 gap-2.5">
            <Button size="sm" variant="ghost" onClick={handleExport}>
              Export JSON
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setImportModal(true)}>
              Import JSON
            </Button>
          </div>
          <InlineNotice tone="warn">
            Resetting restores the factory database and deletes every custom word on this device. Export first if you
            want a backup.
          </InlineNotice>
          <Button
            size="sm"
            variant="danger"
            fullWidth
            onClick={() =>
              setPending({
                kind: 'reset',
                title: 'Reset to defaults?',
                message: 'Every custom category and word on this device will be deleted.',
              })
            }
          >
            Reset to defaults
          </Button>
        </PanelBody>
      </Panel>

      <ConfirmDialog
        open={Boolean(pending)}
        title={pending?.title}
        message={pending?.message}
        confirmLabel={pending?.kind === 'reset' ? 'Reset everything' : 'Delete'}
        onCancel={() => setPending(null)}
        onConfirm={handleDelete}
      />

      <Modal
        open={Boolean(categoryModal)}
        onClose={() => setCategoryModal(null)}
        title={categoryModal?.mode === 'create' ? 'New category' : 'Rename category'}
        subtitle="Categories group words and appear in game setup."
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setCategoryModal(null)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={submitCategory} data-autofocus>
              {categoryModal?.mode === 'create' ? 'Create' : 'Save'}
            </Button>
          </>
        }
      >
        <Field
          label="category name"
          placeholder="e.g. Bollywood"
          value={categoryModal?.name || ''}
          maxLength={24}
          onChange={(event) => setCategoryModal((current) => ({ ...current, name: event.target.value }))}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submitCategory()
          }}
        />
      </Modal>

      <Modal
        open={importModal}
        onClose={() => setImportModal(false)}
        title="Import JSON"
        subtitle="Paste an exported word database. Invalid entries are skipped automatically."
        size="lg"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setImportModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleImport}>
              Import
            </Button>
          </>
        }
      >
        <textarea
          className="field min-h-[200px] w-full font-mono text-[11.5px]"
          value={importText}
          placeholder='{ "categories": [ { "name": "Custom", "words": [ { "word": "Example", "difficulty": "easy" } ] } ] }'
          aria-label="Word database JSON"
          onChange={(event) => setImportText(event.target.value)}
        />
      </Modal>
    </div>
  )
}

export default WordManager
