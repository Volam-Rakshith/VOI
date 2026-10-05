/**
 * Form controls: Toggle, SegmentedControl, Stepper, Field, ChoiceCard.
 * All keyboard friendly and screen-reader labelled.
 */

import { motion } from 'framer-motion'
import { useId } from 'react'
import { useSettings } from '../../context/SettingsContext.jsx'

export function Toggle({ checked, onChange, label, hint, id, disabled = false }) {
  const autoId = useId()
  const controlId = id || `toggle-${autoId}`
  const { vibrate } = useSettings()

  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <label htmlFor={controlId} className="block cursor-pointer text-[13.5px] font-semibold text-violet-50">
          {label}
        </label>
        {hint && <p className="mt-0.5 text-[11.5px] leading-snug text-violet-200/55">{hint}</p>}
      </div>
      <button
        id={controlId}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => {
          vibrate?.(8)
          onChange(!checked)
        }}
        className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors duration-200 disabled:opacity-40 ${
          checked ? 'border-cyan-300/70 bg-cyan-500/25' : 'border-violet-400/35 bg-violet-900/40'
        }`}
      >
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 520, damping: 32 }}
          className={`absolute top-[3px] h-[20px] w-[20px] rounded-full ${
            checked ? 'left-[26px] bg-cyan-200 shadow-neon-cyan' : 'left-[3px] bg-violet-200/80'
          }`}
        />
      </button>
    </div>
  )
}

export function SegmentedControl({ options, value, onChange, label, size = 'md', className = '' }) {
  const groupId = useId()
  return (
    <div className={className}>
      {label && (
        <p id={groupId} className="label mb-2">
          {label}
        </p>
      )}
      <div
        role="radiogroup"
        aria-labelledby={label ? groupId : undefined}
        className="flex flex-wrap gap-1.5 rounded-xl border border-violet-500/25 bg-black/30 p-1.5"
      >
        {options.map((opt) => {
          const active = opt.value === value
          return (
            <button
              key={String(opt.value)}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(opt.value)}
              className={`relative flex-1 rounded-lg px-3 py-2 text-center transition-colors duration-150 ${
                size === 'sm' ? 'text-[11.5px]' : 'text-[12.5px]'
              } font-semibold tracking-wide ${active ? 'text-white' : 'text-violet-200/65 hover:text-violet-100'}`}
            >
              {active && (
                <motion.span
                  layoutId={`seg-${groupId}`}
                  className="absolute inset-0 rounded-lg border border-cyan-300/50"
                  style={{ background: 'linear-gradient(135deg, rgba(34,211,238,.22), rgba(168,85,247,.28))' }}
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                />
              )}
              <span className="relative z-10">
                <span className="block whitespace-nowrap">{opt.label}</span>
                {opt.hint && <span className="mt-0.5 block text-[10px] font-normal text-violet-200/55">{opt.hint}</span>}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function Stepper({ value, min, max, onChange, label, hint, suffix = '', disabled = false }) {
  const dec = () => !disabled && onChange(Math.max(min, value - 1))
  const inc = () => !disabled && onChange(Math.min(max, value + 1))
  return (
    <div className="py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold text-violet-50">{label}</p>
          {hint && <p className="mt-0.5 text-[11.5px] leading-snug text-violet-200/55">{hint}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={dec}
            disabled={disabled || value <= min}
            aria-label={`Decrease ${label}`}
            className="grid h-10 w-10 place-items-center rounded-lg border border-violet-400/35 bg-black/40 text-lg font-bold text-violet-100 transition active:scale-95 disabled:opacity-30"
          >
            −
          </button>
          <output
            aria-live="polite"
            className="min-w-[62px] rounded-lg border border-cyan-400/25 bg-cyan-500/10 px-2 py-1.5 text-center font-display text-[15px] tabular text-cyan-100"
          >
            {value}
            {suffix}
          </output>
          <button
            type="button"
            onClick={inc}
            disabled={disabled || value >= max}
            aria-label={`Increase ${label}`}
            className="grid h-10 w-10 place-items-center rounded-lg border border-violet-400/35 bg-black/40 text-lg font-bold text-violet-100 transition active:scale-95 disabled:opacity-30"
          >
            +
          </button>
        </div>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/8">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-cyan-neon via-limb to-magenta-neon"
          animate={{ width: `${max === min ? 100 : ((value - min) / (max - min)) * 100}%` }}
          transition={{ type: 'spring', stiffness: 260, damping: 30 }}
        />
      </div>
    </div>
  )
}

export function Field({ label, hint, error, id, className = '', ...rest }) {
  const autoId = useId()
  const inputId = id || `field-${autoId}`
  return (
    <div className={className}>
      {label && (
        <label htmlFor={inputId} className="label mb-1.5 block">
          {label}
        </label>
      )}
      <input
        id={inputId}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
        className={`field ${error ? 'field-invalid' : ''}`}
        {...rest}
      />
      {hint && !error && (
        <p id={`${inputId}-hint`} className="mt-1.5 text-[11px] text-violet-200/50">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${inputId}-error`} role="alert" className="mt-1.5 text-[11.5px] font-semibold text-magenta-neon">
          {error}
        </p>
      )}
    </div>
  )
}

export function ChoiceCard({ active, onClick, title, description, badge, disabled = false, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`relative w-full overflow-hidden rounded-xl border px-3.5 py-3 text-left transition-all duration-200 disabled:opacity-40 ${
        active
          ? 'border-cyan-300/70 bg-gradient-to-br from-cyan-500/15 to-fuchsia-500/15 shadow-neon-cyan'
          : 'border-violet-500/25 bg-black/30 hover:border-violet-300/45'
      } ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-display text-[12px] tracking-[.12em] text-violet-50">{title}</span>
        {badge && <span className="shrink-0 rounded-full border border-violet-400/40 px-2 py-0.5 text-[9.5px] uppercase tracking-wider text-violet-200/75">{badge}</span>}
      </div>
      {description && <p className="mt-1.5 text-[11.5px] leading-snug text-violet-200/60">{description}</p>}
      {active && <span className="pointer-events-none absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-neon-cyan" />}
    </button>
  )
}

export default Toggle
