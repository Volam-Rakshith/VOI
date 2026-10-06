/** AdminSettings — cloud word sync, session control and danger zone. */

import { useState } from 'react'
import { Button } from '../ui/Button.jsx'
import { Badge, StatBlock } from '../ui/Layout.jsx'
import { Panel, PanelBody, PanelHeader } from '../ui/Panel.jsx'
import { InlineNotice } from '../ui/Feedback.jsx'
import { ConfirmDialog } from '../ui/ConfirmDialog.jsx'
import { Toggle } from '../ui/Controls.jsx'
import { useWordBank } from '../../context/WordBankContext.jsx'
import { useSettings } from '../../context/SettingsContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { audit, guardConfig, readAudit, revokeUnlock } from '../../lib/blackbox.js'
import { isConfigured } from '../../lib/onlineService.js'

const timeAgo = (ts) => {
  if (!ts) return 'never'
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  return `${Math.round(s / 3600)}h ago`
}

export function AdminSettings({ onLock }) {
  const { pushOnline, pullOnline, syncStatus } = useWordBank()
  const { settings, updateSettings, wipeLocalData } = useSettings()
  const toast = useToast()
  const [confirm, setConfirm] = useState(null)
  const auditLog = readAudit()
  const configured = isConfigured()

  const run = async (fn, success) => {
    try {
      await fn()
      audit('cloud-sync', success)
      toast.success(success)
      return true
    } catch (error) {
      const message = String(error?.message || error)
      toast.error(
        error?.code === 'SCHEMA_MISSING'
          ? 'The shared words table is missing. Run supabase/schema.sql.'
          : error?.code === 'FORBIDDEN'
            ? 'The database rejected that write. Shared words require an authenticated admin policy.'
            : message.includes('not configured')
              ? 'Online sync needs Supabase configuration first.'
              : 'Cloud sync failed. Check your connection and policies.',
      )
      return false
    }
  }

  const execute = async () => {
    if (!confirm) return
    if (confirm.kind === 'wipe') {
      wipeLocalData()
      audit('local-wipe', 'All local data cleared')
      toast.success('Local data cleared — reload for a clean slate')
      setConfirm(null)
      onLock?.()
      return
    }
    if (confirm.kind === 'lock') {
      revokeUnlock()
      audit('lock', 'Session locked manually')
      setConfirm(null)
      onLock?.()
    }
  }

  return (
    <div className="space-y-4">
      <Panel annotated>
        <PanelHeader
          title="SETTINGS"
          subtitle="Black Box preferences, cloud sync and the danger zone"
          right={<Badge tone="magenta">restricted</Badge>}
        />
        <PanelBody className="space-y-4">
          <div>
            <p className="label mb-1">operator defaults</p>
            <Toggle
              label="Sound effects"
              hint="Synth cues for taps, reveals, countdowns and victories"
              checked={settings.sound}
              onChange={(value) => updateSettings({ sound: value })}
            />
            <Toggle
              label="Animations"
              hint="Disable for low-end devices or strict accessibility needs"
              checked={settings.animations}
              onChange={(value) => updateSettings({ animations: value })}
            />
            <Toggle
              label="Reduced motion"
              hint="Overrides animation, particles and screen effects"
              checked={settings.reducedMotion}
              onChange={(value) => updateSettings({ reducedMotion: value })}
            />
            <Toggle
              label="Haptics (vibration)"
              hint="Game-event vibration: reveals, votes, timer, result. Skipped when unsupported."
              checked={settings.haptics}
              onChange={(value) => updateSettings({ haptics: value })}
            />
            <Toggle
              label="Imposter cover word"
              hint="Offer the imposter a plausible wrong word to bluff with"
              checked={settings.showDecoy}
              onChange={(value) => updateSettings({ showDecoy: value })}
            />
          </div>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader
          title="CLOUD WORD SYNC"
          subtitle={configured ? 'Optional · requires an authenticated write policy' : 'Not configured'}
          right={<Badge tone={configured ? 'cyan' : 'amber'}>{configured ? 'available' : 'offline'}</Badge>}
        />
        <PanelBody className="space-y-3">
          <InlineNotice tone="info">
            Shared words live in a separate table protected by Row Level Security: reads are public, writes require an
            authenticated session. Without a Supabase login the push button will be rejected — that is the policy
            working as intended.
          </InlineNotice>
          <div className="grid grid-cols-2 gap-2.5">
            <Button size="sm" variant="ghost" disabled={!configured || syncStatus.syncing} onClick={() => run(pushOnline, 'Pushed to cloud')}>
              Push to cloud
            </Button>
            <Button size="sm" variant="ghost" disabled={!configured || syncStatus.syncing} onClick={() => run(pullOnline, 'Pulled from cloud')}>
              Pull from cloud
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <StatBlock label="last sync" value={timeAgo(syncStatus.lastSync)} />
            <StatBlock label="status" value={syncStatus.syncing ? 'syncing' : syncStatus.error ? 'error' : 'idle'} tone="violet" />
          </div>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title="SESSION & DANGER ZONE" subtitle="Black Box unlocks last 30 minutes in this tab" />
        <PanelBody className="space-y-3">
          <div className="grid grid-cols-2 gap-2.5">
            <StatBlock label="events logged" value={auditLog.length} />
            <StatBlock label="attempt limit" value={guardConfig.MAX_ATTEMPTS} tone="magenta" />
          </div>
          <Button size="sm" variant="ghost" fullWidth onClick={() => setConfirm({ kind: 'lock' })}>
            Lock Black Box now
          </Button>
          <InlineNotice tone="warn">
            Clearing local data wipes words, settings and the join session on this device. Saved games are not
            recoverable.
          </InlineNotice>
          <Button size="sm" variant="danger" fullWidth onClick={() => setConfirm({ kind: 'wipe' })}>
            Clear all local data
          </Button>
        </PanelBody>
      </Panel>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.kind === 'wipe' ? 'Clear all local data?' : 'Lock Black Box?'}
        message={
          confirm?.kind === 'wipe'
            ? 'Words, settings and session data on this device will be deleted. This cannot be undone.'
            : 'You will need the access phrase to get back in.'
        }
        confirmLabel={confirm?.kind === 'wipe' ? 'Clear everything' : 'Lock'}
        onCancel={() => setConfirm(null)}
        onConfirm={execute}
      />
    </div>
  )
}

export default AdminSettings
