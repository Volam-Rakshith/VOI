/**
 * OnlineSetup — create / join panel for online rooms, including the
 * "not configured yet" state that explains exactly what to set up.
 *
 * The parent owns the network call: this component only validates input and
 * emits `onSubmit({ mode, name, code?, config? })`.
 */

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '../ui/Button.jsx'
import { Field, SegmentedControl, Stepper } from '../ui/Controls.jsx'
import { Badge, Glyph } from '../ui/Layout.jsx'
import { ErrorState, InlineNotice } from '../ui/Feedback.jsx'
import { LIMITS } from '../../data/constants.js'
import { normalizeName, validatePlayerName, validateRoomCode } from '../../utils/validate.js'
import { categoryOptions } from '../../lib/wordBank.js'
import { useWordBank } from '../../context/WordBankContext.jsx'
import { sanitizeConfig } from '../../data/defaults.js'

const ONLINE_LIMITS = { MIN_PLAYERS: 3, MAX_PLAYERS: 20, MAX_IMPOSTERS: 4 }

export function OnlineSetup({ configured, busy = null, onSubmit, onQuickJoin = null, lastSession = null, defaultName = '' }) {
  const { bank } = useWordBank()
  const categories = categoryOptions(bank)
  const [tab, setTab] = useState(lastSession?.code ? 'join' : 'create')
  const [name, setName] = useState(defaultName || lastSession?.name || '')
  const [code, setCode] = useState(lastSession?.code || '')
  const [errors, setErrors] = useState({})
  const [config, setConfig] = useState(() =>
    sanitizeConfig({
      imposterCount: 1,
      turnSeconds: 30,
      rounds: 2,
      categoryId: 'random',
      difficulty: 'mixed',
      winRule: 'classic',
    }),
  )
  const [categoryId, setCategoryId] = useState('random')

  if (!configured) {
    return (
      <ErrorState
        title="Online rooms need configuration"
        message="This build ships backend-free. Add two public Supabase values (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY), run supabase/schema.sql, and online rooms switch on. Pass & play works right now, with nothing to configure."
        tone="info"
        action={<Badge tone="cyan">README → Configure Supabase</Badge>}
      />
    )
  }

  const validateName = () => {
    const result = validatePlayerName(name)
    if (!result.ok) {
      setErrors((current) => ({ ...current, name: result.error }))
      return null
    }
    return result.value
  }

  const submitJoin = () => {
    setErrors({})
    const cleanName = validateName()
    const cleanCode = validateRoomCode(code)
    if (!cleanName) return
    if (!cleanCode.ok) {
      setErrors({ code: cleanCode.error })
      return
    }
    onSubmit?.({ mode: 'join', name: cleanName, code: cleanCode.value })
  }

  const submitCreate = () => {
    setErrors({})
    const cleanName = validateName()
    if (!cleanName) return
    const category = categories.find((c) => c.id === categoryId)
    onSubmit?.({
      mode: 'create',
      name: cleanName,
      config: {
        ...config,
        categoryIds: [categoryId],
        categoryLabel: category?.name || 'Random',
        minPlayers: ONLINE_LIMITS.MIN_PLAYERS,
        maxPlayers: ONLINE_LIMITS.MAX_PLAYERS,
      },
    })
  }

  const nearestTurn = (value) => [15, 30, 45, 60, 90].reduce((a, b) => (Math.abs(b - value) < Math.abs(a - value) ? b : a))

  return (
    <div className="space-y-4">
      <SegmentedControl
        options={[
          { value: 'join', label: 'Join room' },
          { value: 'create', label: 'Create room' },
        ]}
        value={tab}
        onChange={(value) => {
          setTab(value)
          setErrors({})
        }}
      />

      {tab === 'join' ? (
        <motion.div key="join" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3.5">
          <Field
            label="your name"
            placeholder="e.g. RAKSHITH"
            value={name}
            maxLength={LIMITS.NAME_MAX}
            autoComplete="nickname"
            error={errors.name}
            onChange={(event) => setName(normalizeName(event.target.value))}
          />
          <Field
            label="room code"
            placeholder="A7KQ"
            value={code}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            error={errors.code}
            hint={`${LIMITS.ROOM_CODE_LENGTH} characters · case-insensitive`}
            onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, LIMITS.ROOM_CODE_LENGTH))}
          />
          {errors.form && <InlineNotice tone="error">{errors.form}</InlineNotice>}
          <Button variant="primary" fullWidth onClick={submitJoin} disabled={busy === 'joining'}>
            {busy === 'joining' ? 'Connecting…' : 'Join room'}
          </Button>
          {lastSession?.code && (
            <button
              type="button"
              onClick={() => onQuickJoin?.(lastSession)}
              className="w-full rounded-xl border border-violet-500/30 bg-black/30 px-3.5 py-2.5 text-left transition hover:border-cyan-300/45"
            >
              <span className="block text-[10.5px] uppercase tracking-[.22em] text-violet-200/55">rejoin my last room</span>
              <span className="mt-0.5 block font-display text-[12.5px] tracking-[.12em] text-cyan-100">
                {lastSession.code} · {lastSession.name}
              </span>
            </button>
          )}
        </motion.div>
      ) : (
        <motion.div key="create" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3.5">
          <Field
            label="your name"
            placeholder="e.g. RAKSHITH"
            value={name}
            maxLength={LIMITS.NAME_MAX}
            autoComplete="nickname"
            error={errors.name}
            onChange={(event) => setName(normalizeName(event.target.value))}
          />

          <div className="glass clip-hud-sm space-y-1 px-3.5 py-2.5">
            <Stepper
              label="Imposters"
              hint="Always a strict minority"
              value={config.imposterCount}
              min={1}
              max={ONLINE_LIMITS.MAX_IMPOSTERS}
              onChange={(value) => setConfig((c) => ({ ...c, imposterCount: value }))}
            />
            <Stepper
              label="Turn length"
              value={config.turnSeconds}
              min={15}
              max={90}
              suffix="s"
              onChange={(value) => setConfig((c) => ({ ...c, turnSeconds: nearestTurn(value) }))}
            />
            <Stepper label="Rounds" value={config.rounds} min={1} max={6} onChange={(value) => setConfig((c) => ({ ...c, rounds: value }))} />
          </div>

          <div className="glass clip-hud-sm space-y-3 px-3.5 py-3">
            <div>
              <label htmlFor="online-category" className="label mb-2 block">
                category
              </label>
              <select id="online-category" className="field" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name} ({category.count} words)
                  </option>
                ))}
              </select>
            </div>
            <SegmentedControl
              size="sm"
              label="difficulty"
              value={config.difficulty}
              onChange={(value) => setConfig((c) => ({ ...c, difficulty: value }))}
              options={[
                { value: 'easy', label: 'Casual' },
                { value: 'medium', label: 'Sharp' },
                { value: 'hard', label: 'Vicious' },
                { value: 'mixed', label: 'Mixed' },
              ]}
            />
            <SegmentedControl
              size="sm"
              label="win rule"
              value={config.winRule}
              onChange={(value) => setConfig((c) => ({ ...c, winRule: value }))}
              options={[
                { value: 'classic', label: 'Classic', hint: 'one vote' },
                { value: 'survival', label: 'Manhunt', hint: 'multi-round' },
              ]}
            />
          </div>

          {errors.form && <InlineNotice tone="error">{errors.form}</InlineNotice>}
          <Button variant="primary" fullWidth onClick={submitCreate} disabled={busy === 'creating'}>
            {busy === 'creating' ? 'Creating room…' : 'Create room'}
          </Button>
          <p className="flex items-center justify-center gap-1.5 text-[11px] text-violet-200/45">
            <Glyph name="users" size={12} /> 3–20 players · every player needs their own device
          </p>
        </motion.div>
      )}
    </div>
  )
}

export default OnlineSetup
