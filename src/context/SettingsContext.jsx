/**
 * SettingsProvider — persisted user preferences.
 * Applies global side effects (sound engine, animation classes, CSS variables)
 * so individual components never have to think about them.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { STORAGE_KEYS } from '../data/constants.js'
import { readJSON, writeJSON, removeMany } from '../utils/storage.js'
import { attachGlobalClickSound, setSoundEnabled, unlockAudio } from '../lib/sound.js'

export const DEFAULT_SETTINGS = {
  sound: true,
  animations: true,
  reducedMotion: false,
  intensity: 1, // 0 = calm, 1 = standard, 2 = intense
  haptics: true,
  showDecoy: true,
  autoAdvanceCards: false,
}

const SettingsContext = createContext(null)

const sanitize = (raw) => {
  const base = { ...DEFAULT_SETTINGS }
  if (!raw || typeof raw !== 'object') return base
  return {
    sound: typeof raw.sound === 'boolean' ? raw.sound : base.sound,
    animations: typeof raw.animations === 'boolean' ? raw.animations : base.animations,
    reducedMotion: typeof raw.reducedMotion === 'boolean' ? raw.reducedMotion : base.reducedMotion,
    intensity: [0, 1, 2].includes(raw.intensity) ? raw.intensity : base.intensity,
    haptics: typeof raw.haptics === 'boolean' ? raw.haptics : base.haptics,
    showDecoy: typeof raw.showDecoy === 'boolean' ? raw.showDecoy : base.showDecoy,
    autoAdvanceCards: typeof raw.autoAdvanceCards === 'boolean' ? raw.autoAdvanceCards : base.autoAdvanceCards,
  }
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => sanitize(readJSON(STORAGE_KEYS.settings, null)))
  const [systemReducedMotion, setSystemReducedMotion] = useState(false)

  /* Track the OS-level preference so "Animations" can offer Auto behaviour. */
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return () => {}
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    setSystemReducedMotion(query.matches)
    const onChange = (event) => setSystemReducedMotion(event.matches)
    query.addEventListener?.('change', onChange)
    return () => query.removeEventListener?.('change', onChange)
  }, [])

  const persist = useCallback((next) => {
    setSettings(next)
    writeJSON(STORAGE_KEYS.settings, next)
  }, [])

  const updateSettings = useCallback(
    (patch) => {
      setSettings((current) => {
        const next = sanitize({ ...current, ...patch })
        writeJSON(STORAGE_KEYS.settings, next)
        return next
      })
    },
    [],
  )

  const resetSettings = useCallback(() => {
    persist({ ...DEFAULT_SETTINGS })
  }, [persist])

  /* Wipe every locally stored key (Settings -> Reset local data). */
  const wipeLocalData = useCallback(() => {
    removeMany(Object.values(STORAGE_KEYS))
    persist({ ...DEFAULT_SETTINGS })
  }, [persist])

  useEffect(() => {
    setSoundEnabled(settings.sound)
    if (settings.sound) return attachGlobalClickSound()
    return () => {}
  }, [settings.sound])

  /* Unlock audio on the first real interaction (browser autoplay policy). */
  useEffect(() => {
    if (!settings.sound) return () => {}
    const unlock = () => unlockAudio()
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [settings.sound])

  const motionOff = settings.reducedMotion || !settings.animations || systemReducedMotion

  /* Drive global CSS: reduced-motion class + particle intensity variable. */
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--fx-intensity', String(settings.intensity))
    document.body.classList.toggle('reduce-motion', motionOff)
  }, [settings.intensity, motionOff])

  const value = useMemo(
    () => ({
      settings,
      updateSettings,
      resetSettings,
      wipeLocalData,
      /** True when the user (or their OS) asked for reduced motion. */
      motionOff,
      systemReducedMotion,
      /** Convenience: haptics helper for touch feedback. */
      vibrate: (pattern = 12) => {
        if (!settings.haptics) return
        try {
          navigator.vibrate?.(pattern)
        } catch {
          /* unsupported */
        }
      },
    }),
    [settings, updateSettings, resetSettings, wipeLocalData, motionOff, systemReducedMotion],
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>')
  return ctx
}

/** Animation timing helper honouring reduced motion. */
export function useMotionPrefs() {
  const { motionOff } = useSettings()
  return useMemo(
    () => ({
      duration: motionOff ? 0 : 0.32,
      fast: motionOff ? 0 : 0.16,
      spring: motionOff
        ? { type: 'tween', duration: 0 }
        : { type: 'spring', stiffness: 320, damping: 26, mass: 0.7 },
      softSpring: motionOff ? { type: 'tween', duration: 0 } : { type: 'spring', stiffness: 180, damping: 22 },
      reduce: motionOff,
    }),
    [motionOff],
  )
}
