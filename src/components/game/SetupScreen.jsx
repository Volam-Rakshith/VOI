/**
 * SetupScreen — roster + rules configuration for pass & play.
 * Validates as you type, keeps imposters a strict minority and remembers the
 * last configuration on this device.
 */

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { GAME_MODES, LIMITS, WIN_RULES } from '../../data/constants.js'
import { Button } from '../ui/Button.jsx'
import { Field, SegmentedControl, Stepper, Toggle } from '../ui/Controls.jsx'
import { Badge, ScreenHeader, ScreenShell } from '../ui/Layout.jsx'
import { Panel, PanelBody, PanelHeader } from '../ui/Panel.jsx'
import { InlineNotice } from '../ui/Feedback.jsx'
import { categoryOptions } from '../../lib/wordBank.js'
import { useWordBank } from '../../context/WordBankContext.jsx'
import { nameKey, normalizeName, validatePlayerName } from '../../utils/validate.js'
import { sanitizeConfig } from '../../data/defaults.js'
import { useSponsorGate } from '../../hooks/useSponsorGate.jsx'

const MAX_IMPOSTERS = 9

export function SetupScreen({ onStart, onBack, initialConfig, initialNames, busy = false }) {
  const sponsor = useSponsorGate()
  const { bank } = useWordBank()
  const categories = useMemo(() => categoryOptions(bank), [bank])

  const [config, setConfig] = useState(() => sanitizeConfig(initialConfig || {}))
  const [names, setNames] = useState(() => {
    const base = Array.isArray(initialNames) && initialNames.length ? [...initialNames] : []
    while (base.length < (initialConfig?.playerCount || 6)) base.push('')
    return base.slice(0, LIMITS.MAX_PLAYERS)
  })
  const [touched, setTouched] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const maxImposters = Math.max(1, Math.floor((names.length - 1) / 2))
  const effectiveImposters = Math.min(config.imposterCount, maxImposters)

  const errors = useMemo(() => {
    const map = {}
    const seen = new Map()
    names.forEach((raw, index) => {
      const result = validatePlayerName(raw)
      if (!raw.trim()) {
        map[index] = ''
        return
      }
      if (!result.ok) {
        map[index] = result.error
        return
      }
      const key = nameKey(result.value)
      if (seen.has(key)) {
        map[index] = 'Duplicate name'
        map[seen.get(key)] = 'Duplicate name'
      } else seen.set(key, index)
    })
    return map
  }, [names])

  const filled = names.filter((name) => name.trim().length > 0).length
  const hasErrors = Object.values(errors).some(Boolean)
  const canStart = filled === names.length && filled >= LIMITS.MIN_PLAYERS && !hasErrors

  const setCount = (count) => {
    const next = Math.max(LIMITS.MIN_PLAYERS, Math.min(LIMITS.MAX_PLAYERS, count))
    setNames((current) => {
      const copy = [...current]
      while (copy.length < next) copy.push('')
      return copy.slice(0, next)
    })
    setConfig((current) => ({ ...current, playerCount: next, imposterCount: Math.min(current.imposterCount, Math.max(1, Math.floor((next - 1) / 2))) }))
  }

  const toggleCategory = (id) => {
    setConfig((current) => {
      if (id === 'random') return { ...current, categoryIds: ['random'] }
      const withoutRandom = current.categoryIds.filter((c) => c !== 'random')
      const next = withoutRandom.includes(id) ? withoutRandom.filter((c) => c !== id) : [...withoutRandom, id]
      return { ...current, categoryIds: next.length ? next : ['random'] }
    })
  }

  const submit = () => {
    setTouched(true)
    if (!canStart) return
    sponsor.request(() =>
      onStart?.(
        { ...config, playerCount: names.length, imposterCount: effectiveImposters },
        names.map((name) => normalizeName(name)),
      ),
    )
  }

  const randomiseNames = () => {
    const pool = ['Rakshith', 'Vikram', 'Ananya', 'Dev', 'Meera', 'Kabir', 'Ishita', 'Arjun', 'Zoya', 'Rhea', 'Neel', 'Tara']
    setNames((current) => current.map((_, i) => pool[i % pool.length]))
  }

  const activeMode = GAME_MODES.find((mode) => mode.id === config.mode)
  const chaos = config.mode === 'chaos'

  return (
    <ScreenShell>
      <ScreenHeader title="Pass & play setup" eyebrow="local game" onBack={onBack} right={<Badge tone="cyan">{names.length} players</Badge>} />

      <div className="shell-narrow flex-1 space-y-4 pb-6">
        <Panel annotated>
          <PanelHeader
            title="CREW"
            subtitle={`${filled}/${names.length} named · ${LIMITS.MIN_PLAYERS}–${LIMITS.MAX_PLAYERS} players`}
            right={
              <Button size="sm" variant="quiet" onClick={randomiseNames} aria-label="Fill sample names">
                Sample
              </Button>
            }
          />
          <PanelBody>
            <Stepper label="Players" hint="Pass one device around" value={names.length} min={LIMITS.MIN_PLAYERS} max={LIMITS.MAX_PLAYERS} onChange={setCount} />

            <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
              {names.map((name, index) => {
                const error = touched || name.trim() ? errors[index] : ''
                return (
                  <motion.div key={index} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.02, 0.2) }}>
                    <Field label={`player ${String(index + 1).padStart(2, '0')}`} placeholder="Enter name" value={name} maxLength={LIMITS.NAME_MAX} autoComplete="off" error={error || undefined} onChange={(event) => setNames((current) => current.map((n, i) => (i === index ? normalizeName(event.target.value) : n)))} />
                  </motion.div>
                )
              })}
            </div>

            {hasErrors && touched && (
              <InlineNotice tone="error" className="mt-3">
                Duplicate or invalid names block the start — every player needs a unique name.
              </InlineNotice>
            )}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="RULES" subtitle="Sensible defaults are already set" />
          <PanelBody className="space-y-4">
            <Stepper label="Imposters" hint={chaos ? 'Chaos decides this fresh every round' : `Maximum ${maxImposters} with ${names.length} players`} value={chaos ? 1 : effectiveImposters} min={1} max={Math.min(maxImposters, MAX_IMPOSTERS)} disabled={chaos} onChange={(value) => setConfig((current) => ({ ...current, imposterCount: value }))} />

            <div>
              <p className="label mb-2">categories</p>
              <div className="flex flex-wrap gap-1.5">
                {categories.map((category) => {
                  const active = config.categoryIds.includes(category.id)
                  return (
                    <button key={category.id} type="button" onClick={() => toggleCategory(category.id)} aria-pressed={active} className={`rounded-full border px-3 py-1.5 text-[11.5px] transition ${active ? 'border-cyan-300/65 bg-cyan-500/15 text-cyan-50 shadow-neon-cyan' : 'border-violet-400/25 bg-black/30 text-violet-200/65 hover:border-violet-300/45'}`}>
                      {category.name}
                      <span className="ml-1.5 font-mono text-[10px] opacity-60">{category.count}</span>
                    </button>
                  )
                })}
              </div>
              <p className="mt-2 text-[11px] text-violet-200/45">Pick as many as you like — Random pulls from everything.</p>
            </div>

            <SegmentedControl
              label="difficulty"
              value={config.difficulty}
              onChange={(value) => setConfig((current) => ({ ...current, difficulty: value }))}
              options={[
                { value: 'easy', label: 'Casual' },
                { value: 'medium', label: 'Sharp' },
                { value: 'hard', label: 'Vicious' },
                { value: 'mixed', label: 'Mixed' },
              ]}
            />

            <div>
              <p className="label mb-2">turn length</p>
              <SegmentedControl size="sm" value={config.turnSeconds} onChange={(value) => setConfig((current) => ({ ...current, turnSeconds: value }))} options={[15, 30, 45, 60, 90].map((seconds) => ({ value: seconds, label: `${seconds}s` }))} />
            </div>

            <div>
              <p className="label mb-2">game mode</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {GAME_MODES.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setConfig((current) => ({ ...current, mode: mode.id }))}
                    aria-pressed={config.mode === mode.id}
                    className={`rounded-xl border px-3.5 py-3 text-left transition ${config.mode === mode.id ? (mode.id === 'chaos' ? 'border-magenta-neon/60 bg-fuchsia-500/12 shadow-neon-magenta' : 'border-cyan-300/60 bg-cyan-500/12 shadow-neon-cyan') : 'border-violet-400/25 bg-black/30 hover:border-violet-300/45'}`}
                  >
                    <span className="font-display text-[12px] tracking-[.12em] text-violet-50">{mode.label}</span>
                    <span className="mt-1 block text-[11.5px] leading-snug text-violet-200/60">{mode.short}</span>
                  </button>
                ))}
              </div>
              {activeMode && <p className="mt-2 text-[11.5px] leading-relaxed text-violet-200/50">{activeMode.description}</p>}
            </div>

            <div>
              <p className="label mb-2">how the game ends</p>
              <div className="rounded-xl border border-violet-400/25 bg-black/30 px-3.5 py-3">
                <span className="font-display text-[12px] tracking-[.12em] text-violet-50">{WIN_RULES[0].label}</span>
                <span className="mt-1 block text-[11.5px] leading-snug text-violet-200/60">{WIN_RULES[0].short}</span>
              </div>
              <p className="mt-2 text-[11.5px] leading-relaxed text-violet-200/50">{WIN_RULES[0].description}</p>
              {chaos && <p className="mt-1.5 text-[11.5px] leading-relaxed text-cyan-200/75">Chaos overrides the imposter count: one round in every few re-rolls who is an imposter, and that round may deal nobody an imposter card or hand one to the whole table.</p>}
            </div>

            <button type="button" onClick={() => setShowAdvanced((value) => !value)} className="w-full rounded-lg border border-violet-400/25 bg-black/25 px-3 py-2 text-left text-[11.5px] text-violet-200/70 transition hover:border-cyan-300/40" aria-expanded={showAdvanced}>
              {showAdvanced ? '− Hide advanced options' : '+ Advanced options'}
            </button>

            {showAdvanced && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-3 overflow-hidden">
                <div>
                  <p className="label mb-2">voting style</p>
                  <SegmentedControl
                    size="sm"
                    value={config.voteMode}
                    onChange={(value) => setConfig((current) => ({ ...current, voteMode: value }))}
                    options={[
                      { value: 'secret', label: 'Secret ballot', hint: 'pass the device' },
                      { value: 'open', label: 'Open accusation', hint: 'one call' },
                    ]}
                  />
                </div>
                <div>
                  <p className="label mb-2">clue order</p>
                  <SegmentedControl
                    size="sm"
                    value={config.clueOrder}
                    onChange={(value) => setConfig((current) => ({ ...current, clueOrder: value }))}
                    options={[
                      { value: 'random', label: 'Random' },
                      { value: 'seat', label: 'Seating order' },
                    ]}
                  />
                </div>
              </motion.div>
            )}
          </PanelBody>
        </Panel>

        {!bank.categories.length && <InlineNotice tone="error">Your word database is empty. Add words in BLACK BOX or reset to defaults.</InlineNotice>}
      </div>

      <div className="shell-narrow sticky bottom-0 z-20 pb-4 safe-b">
        <div className="glass-strong clip-hud flex flex-col gap-2 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-display text-[11.5px] tracking-[.14em] text-violet-50">
              {names.length} PLAYERS · {chaos ? 'CHAOS IMPOSTERS' : `${effectiveImposters} IMPOSTER${effectiveImposters > 1 ? 'S' : ''}`} · {config.turnSeconds}s
            </p>
            <p className="mt-0.5 truncate text-[11px] text-violet-200/55">
              {config.categoryIds.includes('random')
                ? 'All categories'
                : config.categoryIds
                    .map((id) => categories.find((c) => c.id === id)?.name)
                    .filter(Boolean)
                    .join(', ')}
            </p>
          </div>
          <Button variant="primary" onClick={submit} disabled={!canStart || busy} className="sm:w-auto" fullWidth>
            {busy ? 'Dealing…' : 'Deal the secrets'}
          </Button>
        </div>
      </div>
      {sponsor.overlay}
    </ScreenShell>
  )
}

export default SetupScreen
