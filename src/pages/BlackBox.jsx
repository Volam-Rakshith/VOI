/**
 * BlackBox — the hidden admin dashboard.
 * A deliberately different visual language: command-centre glass, terminal
 * type, cyan/magenta accents.
 */

import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BRAND, ROUTES } from '../data/constants.js'
import { Button } from '../components/ui/Button.jsx'
import { Badge, ScreenShell } from '../components/ui/Layout.jsx'
import { Panel, PanelBody, PanelHeader } from '../components/ui/Panel.jsx'
import { SystemStatus } from '../components/admin/SystemStatus.jsx'
import { WordManager } from '../components/admin/WordManager.jsx'
import { RoomManager } from '../components/admin/RoomManager.jsx'
import { AdminSettings } from '../components/admin/AdminSettings.jsx'
import { isUnlocked, revokeUnlock } from '../lib/blackbox.js'
import { useWordBank } from '../context/WordBankContext.jsx'

const SECTIONS = [
  { id: 'status', label: 'SYSTEM STATUS', hint: 'runtime checks' },
  { id: 'words', label: 'WORD DATABASE', hint: 'create · read · update · delete' },
  { id: 'rooms', label: 'ROOM MANAGEMENT', hint: 'live rooms, terminate' },
  { id: 'settings', label: 'SETTINGS', hint: 'sync · session · data' },
]

export function BlackBox({ onNavigate, onLock }) {
  const [section, setSection] = useState('status')
  const [unlocked, setUnlocked] = useState(() => isUnlocked())
  const { bank } = useWordBank()

  useEffect(() => {
    setUnlocked(isUnlocked())
  }, [])

  const content = useMemo(() => {
    if (!unlocked) {
      return (
        <Panel annotated>
          <PanelHeader title="SESSION EXPIRED" subtitle="Black Box unlocks last 30 minutes, then re-locks itself." right={<Badge tone="magenta">locked</Badge>} />
          <PanelBody className="space-y-3">
            <p className="text-[12.5px] leading-relaxed text-violet-100/75">
              Return to the main menu and repeat the corner gesture to re-open the access prompt.
            </p>
            <Button variant="primary" size="sm" onClick={() => onNavigate(ROUTES.home)}>
              Back to main menu
            </Button>
          </PanelBody>
        </Panel>
      )
    }
    switch (section) {
      case 'words':
        return <WordManager />
      case 'rooms':
        return <RoomManager />
      case 'settings':
        return (
          <AdminSettings
            onLock={() => {
              revokeUnlock()
              onLock?.()
              onNavigate(ROUTES.home)
            }}
          />
        )
      default:
        return <SystemStatus bank={bank} />
    }
  }, [section, unlocked, bank, onNavigate, onLock])

  return (
    <ScreenShell withFooter footerCompact>
      <div className="pointer-events-none fixed inset-0 -z-10 opacity-[.05]" style={{ backgroundImage: 'repeating-linear-gradient(180deg,#22d3ee 0 1px, transparent 1px 4px)' }} />

      <header className="safe-t sticky top-0 z-30 border-b border-cyan-400/20 backdrop-blur-xl" style={{ background: 'linear-gradient(180deg, rgba(2,10,20,.94), rgba(2,10,20,.7))' }}>
        <div className="shell flex items-center gap-3 py-3">
          <Button variant="quiet" size="sm" className="!min-h-10 !w-10 !px-0 border border-cyan-400/30" onClick={() => onNavigate(ROUTES.home)} aria-label="Exit Black Box">
            <span aria-hidden="true">←</span>
          </Button>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[9.5px] uppercase tracking-[.3em] text-cyan-300/75">vr developments · restricted</p>
            <h1 className="font-display text-[16px] tracking-[.22em] text-cyan-50">BLACK BOX</h1>
          </div>
          <Badge tone={unlocked ? 'emerald' : 'magenta'}>{unlocked ? 'unlocked' : 'locked'}</Badge>
        </div>
        <nav className="shell -mt-1 flex gap-1.5 overflow-x-auto pb-2.5 no-scrollbar" aria-label="Black Box sections">
          {SECTIONS.map((item) => {
            const active = item.id === section
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                aria-current={active}
                className={`shrink-0 rounded-lg border px-3 py-2 text-left transition ${
                  active
                    ? 'border-cyan-300/60 bg-cyan-500/12 shadow-neon-cyan'
                    : 'border-cyan-400/15 bg-black/30 hover:border-cyan-300/40'
                }`}
              >
                <span className="block font-display text-[10.5px] tracking-[.14em] text-cyan-50">{item.label}</span>
                <span className="mt-0.5 block font-mono text-[9px] uppercase tracking-wider text-cyan-200/45">{item.hint}</span>
              </button>
            )
          })}
        </nav>
      </header>

      <main className="shell-narrow flex-1 py-4 safe-b" style={{ maxWidth: '860px' }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={section + String(unlocked)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
          >
            {content}
          </motion.div>
        </AnimatePresence>
        <p className="mt-6 text-center font-mono text-[10px] leading-relaxed text-cyan-200/35">
          {BRAND.studio} · blackbox v{BRAND.version} · client-side convenience layer, not real authentication
        </p>
      </main>
    </ScreenShell>
  )
}

export default BlackBox
