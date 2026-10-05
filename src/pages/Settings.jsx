/** Settings — persisted preferences, data controls and About. */

import { useState } from 'react'
import { BRAND, ROUTES } from '../data/constants.js'
import { Button } from '../components/ui/Button.jsx'
import { Badge, ScreenHeader, ScreenShell } from '../components/ui/Layout.jsx'
import { Panel, PanelBody, PanelHeader } from '../components/ui/Panel.jsx'
import { InlineNotice } from '../components/ui/Feedback.jsx'
import { ConfirmDialog } from '../components/ui/ConfirmDialog.jsx'
import { SegmentedControl, Toggle } from '../components/ui/Controls.jsx'
import { StudioMark } from '../components/ui/Logo.jsx'
import { useSettings } from '../context/SettingsContext.jsx'
import { useWordBank } from '../context/WordBankContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { readAudit } from '../lib/blackbox.js'

export function Settings({ onNavigate }) {
  const { settings, updateSettings, resetSettings, wipeLocalData, systemReducedMotion } = useSettings()
  const { stats, resetToDefaults } = useWordBank()
  const toast = useToast()
  const [confirm, setConfirm] = useState(null)

  const execute = () => {
    if (confirm === 'wipe') {
      wipeLocalData()
      toast.success('All local data cleared')
      onNavigate(ROUTES.home)
    } else if (confirm === 'reset-settings') {
      resetSettings()
      toast.success('Preferences restored to defaults')
    } else if (confirm === 'reset-words') {
      resetToDefaults()
      toast.success('Word database restored to defaults')
    }
    setConfirm(null)
  }

  return (
    <ScreenShell>
      <ScreenHeader title="Settings" eyebrow="preferences" onBack={() => onNavigate(ROUTES.home)} />

      <div className="shell-narrow flex-1 space-y-4 pb-6">
        <Panel annotated>
          <PanelHeader title="GAME FEEL" subtitle="Everything here is stored on this device only" />
          <PanelBody>
            <Toggle
              label="Sound effects"
              hint="Synthesised taps, reveals and countdown cues — no audio files, nothing autoplays"
              checked={settings.sound}
              onChange={(value) => updateSettings({ sound: value })}
            />
            <Toggle
              label="Animations"
              hint="Turn off for maximum battery life or on very old hardware"
              checked={settings.animations}
              onChange={(value) => updateSettings({ animations: value })}
            />
            <Toggle
              label="Reduced motion"
              hint={
                systemReducedMotion
                  ? 'Your system already requests reduced motion — it stays on regardless'
                  : 'Removes parallax, particles, glitch and shake effects'
              }
              checked={settings.reducedMotion}
              onChange={(value) => updateSettings({ reducedMotion: value })}
            />
            <Toggle
              label="Haptics"
              hint="Short vibration on supported phones"
              checked={settings.haptics}
              onChange={(value) => updateSettings({ haptics: value })}
            />
            <Toggle
              label="Imposter cover word"
              hint="Gives the imposter a plausible wrong word to bluff with"
              checked={settings.showDecoy}
              onChange={(value) => updateSettings({ showDecoy: value })}
            />
            <div className="pt-2">
              <SegmentedControl
                label="theme intensity"
                value={settings.intensity}
                onChange={(value) => updateSettings({ intensity: value })}
                options={[
                  { value: 0, label: 'Calm' },
                  { value: 1, label: 'Standard' },
                  { value: 2, label: 'Intense' },
                ]}
              />
              <p className="mt-2 text-[11px] leading-relaxed text-violet-200/50">
                Controls particle density, glow strength and screen effects. Set to Calm on older phones.
              </p>
            </div>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="LOCAL DATA" subtitle={`${stats.words} words · ${stats.categories} categories`} right={<Badge tone="violet">on device</Badge>} />
          <PanelBody className="space-y-3">
            <InlineNotice tone="info">
              Preferences, custom words and your last room session live in LocalStorage. Clearing data signs you out of
              any online room and restores the factory word list.
            </InlineNotice>
            <div className="grid gap-2 sm:grid-cols-3">
              <Button size="sm" variant="ghost" onClick={() => setConfirm('reset-settings')}>
                Reset preferences
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirm('reset-words')}>
                Reset words
              </Button>
              <Button size="sm" variant="danger" onClick={() => setConfirm('wipe')}>
                Clear everything
              </Button>
            </div>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="ABOUT" subtitle={BRAND.footer} />
          <PanelBody className="space-y-3">
            <div className="flex items-center gap-3">
              <StudioMark size={40} />
              <div>
                <p className="font-display text-[13px] tracking-[.18em] text-violet-50">{BRAND.studio}</p>
                <p className="mt-0.5 text-[11.5px] text-violet-200/55">
                  {BRAND.game} v{BRAND.version} · hash-routed static build
                </p>
              </div>
            </div>
            <p className="text-[12px] leading-relaxed text-violet-100/70">
              A social deduction party game inspired by the genre — original rules, words, art direction and code.
              Nothing here copies another game's content or branding. Local mode needs no network at all.
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge tone="cyan">offline capable</Badge>
              <Badge tone="violet">GitHub Pages ready</Badge>
              <Badge tone="magenta">PWA manifest included</Badge>
            </div>
            <Button size="sm" variant="ghost" fullWidth onClick={() => onNavigate(ROUTES.howto)}>
              Revisit the tutorial
            </Button>
          </PanelBody>
        </Panel>

        <p className="text-center font-mono text-[10px] tracking-wider text-violet-200/30">
          audit events on this device: {readAudit().length}
        </p>
      </div>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={
          confirm === 'wipe' ? 'Clear all local data?' : confirm === 'reset-words' ? 'Reset the word database?' : 'Reset preferences?'
        }
        message={
          confirm === 'wipe'
            ? 'Preferences, custom words and your room session will be deleted from this device.'
            : confirm === 'reset-words'
              ? 'Every custom category and word will be removed and the factory list restored.'
              : 'Sound, motion and theme settings return to their defaults.'
        }
        confirmLabel={confirm === 'wipe' ? 'Clear everything' : 'Reset'}
        tone={confirm === 'wipe' ? 'danger' : 'primary'}
        onCancel={() => setConfirm(null)}
        onConfirm={execute}
      />
    </ScreenShell>
  )
}

export default Settings
