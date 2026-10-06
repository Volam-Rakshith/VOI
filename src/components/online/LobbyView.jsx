/** LobbyView — the online waiting room: code, roster, readiness, host controls. */

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ROOM_STATUS } from '../../data/constants.js'
import { Button } from '../ui/Button.jsx'
import { Badge, ScreenHeader, StatBlock } from '../ui/Layout.jsx'
import { Panel, PanelBody, PanelHeader } from '../ui/Panel.jsx'
import { InlineNotice } from '../ui/Feedback.jsx'
import { SegmentedControl, Stepper } from '../ui/Controls.jsx'
import { ConfirmDialog } from '../ui/ConfirmDialog.jsx'
import { RoomCodeCard } from '../lobby/RoomCodeCard.jsx'
import { PlayerList } from '../lobby/PlayerList.jsx'
import { ConnectionBanner } from './ConnectionBanner.jsx'
import { categoryOptions } from '../../lib/wordBank.js'
import { useWordBank } from '../../context/WordBankContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'

const MIN_ONLINE = 3

export function LobbyView({ online, onExit }) {
  const { room, view, session, actions, connection, busy } = online
  const { bank } = useWordBank()
  const toast = useToast()
  const [confirm, setConfirm] = useState(null)
  const [showSetup, setShowSetup] = useState(false)
  const categories = useMemo(() => categoryOptions(bank), [bank])

  const readyCount = room.players.filter((p) => p.isHost || p.ready).length
  const chaos = room.config?.mode === 'chaos'
  const canStart = room.players.length >= MIN_ONLINE && room.players.every((p) => p.isHost || p.ready)
  const isHost = view?.isHost

  const start = async () => {
    const result = await actions.startGame()
    if (!result.ok) toast.error(result.error)
    else toast.success('Roles dealt — check your secret card')
  }

  const handleConfirm = async () => {
    if (confirm === 'leave') {
      await actions.leave()
      onExit?.()
    } else if (confirm === 'close') {
      await actions.closeRoom()
      onExit?.()
    }
    setConfirm(null)
  }

  return (
    <>
      <ScreenHeader
        title={`Lobby · ${room.code}`}
        eyebrow={room.status === ROOM_STATUS.LOBBY ? 'waiting for players' : room.status}
        onBack={() => setConfirm(isHost ? 'close' : 'leave')}
        right={<Badge tone={connection.state === 'connected' ? 'emerald' : 'amber'}>{connection.state}</Badge>}
      />

      <div className="shell-narrow flex-1 space-y-4 pb-6">
        <ConnectionBanner connection={connection} onRetry={actions.refresh} />

        <RoomCodeCard code={room.code} compact />

        <div className="grid grid-cols-3 gap-2">
          <StatBlock label="players" value={`${room.players.length}`} />
          <StatBlock label="ready" value={`${readyCount}/${room.players.length}`} tone="violet" />
          <StatBlock label="imposters" value={room.config.imposterCount} tone="magenta" />
        </div>

        <Panel annotated>
          <PanelHeader
            title="PLAYERS"
            subtitle={room.players.length < MIN_ONLINE ? `Need at least ${MIN_ONLINE} players to start` : 'Everyone must be ready'}
            right={<Badge tone="cyan">{room.players.length}</Badge>}
          />
          <PanelBody>
            <PlayerList players={room.players} hostId={room.hostId} myId={session.playerId} />
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            title="GAME SETUP"
            subtitle={isHost ? 'You control the rules' : 'Set by the host'}
            right={isHost ? <Button size="sm" variant="quiet" onClick={() => setShowSetup((v) => !v)}>{showSetup ? 'Done' : 'Change'}</Button> : null}
          />
          <PanelBody className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="muted">{room.config.categoryLabel}</Badge>
              <Badge tone="muted">{room.config.difficulty}</Badge>
              <Badge tone="muted">{room.config.turnSeconds}s turns</Badge>
              <Badge tone={chaos ? 'magenta' : 'muted'}>{chaos ? 'chaos mode' : 'normal mode'}</Badge>
              <Badge tone="muted">{room.config.winRule === 'survival' ? 'manhunt' : 'classic'}</Badge>
              <Badge tone="muted">{room.config.rounds} round{room.config.rounds === 1 ? '' : 's'}</Badge>
            </div>

            {isHost && showSetup && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-3 overflow-hidden border-t border-violet-500/20 pt-3">
                <Stepper
                  label="Imposters"
                  disabled={chaos}
                  value={chaos ? 1 : room.config.imposterCount}
                  min={1}
                  max={Math.max(1, Math.floor((room.players.length - 1) / 2))}
                  onChange={async (value) => {
                    const result = await actions.updateConfig({ imposterCount: value })
                    if (!result.ok) toast.error(result.error)
                  }}
                />
                <Stepper
                  label="Turn length"
                  value={room.config.turnSeconds}
                  min={15}
                  max={90}
                  suffix="s"
                  onChange={async (value) => {
                    const nearest = [15, 30, 45, 60, 90].reduce((a, b) => (Math.abs(b - value) < Math.abs(a - value) ? b : a))
                    const result = await actions.updateConfig({ turnSeconds: nearest })
                    if (!result.ok) toast.error(result.error)
                  }}
                />
                <Stepper
                  label="Rounds"
                  value={room.config.rounds}
                  min={1}
                  max={6}
                  onChange={async (value) => {
                    const result = await actions.updateConfig({ rounds: value })
                    if (!result.ok) toast.error(result.error)
                  }}
                />
                <div>
                  <label htmlFor="lobby-category" className="label mb-1.5 block">
                    category
                  </label>
                  <select
                    id="lobby-category"
                    className="field"
                    value={room.config.categoryIds?.[0] || 'random'}
                    onChange={async (event) => {
                      const id = event.target.value
                      const label = categories.find((c) => c.id === id)?.name || 'Random'
                      const result = await actions.updateConfig({ categoryIds: [id], categoryLabel: label })
                      if (!result.ok) toast.error(result.error)
                    }}
                  >
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name} ({category.count})
                      </option>
                    ))}
                  </select>
                </div>
                <SegmentedControl
                  size="sm"
                  label="difficulty"
                  value={room.config.difficulty}
                  onChange={async (value) => {
                    const result = await actions.updateConfig({ difficulty: value })
                    if (!result.ok) toast.error(result.error)
                  }}
                  options={[
                    { value: 'easy', label: 'Casual' },
                    { value: 'medium', label: 'Sharp' },
                    { value: 'hard', label: 'Vicious' },
                    { value: 'mixed', label: 'Mixed' },
                  ]}
                />
                <SegmentedControl
                  size="sm"
                  label="game mode"
                  value={room.config.mode || 'normal'}
                  onChange={async (value) => {
                    const result = await actions.updateConfig({ mode: value })
                    if (result?.ok === false) toast.error(result.error)
                  }}
                  options={[
                    { value: 'normal', label: 'Normal' },
                    { value: 'chaos', label: 'Chaos' },
                  ]}
                />
                <SegmentedControl
                  size="sm"
                  label="win rule"
                  value={room.config.winRule}
                  onChange={async (value) => {
                    const result = await actions.updateConfig({ winRule: value })
                    if (!result.ok) toast.error(result.error)
                  }}
                  options={[
                    { value: 'classic', label: 'Classic' },
                    { value: 'survival', label: 'Manhunt' },
                  ]}
                />
              </motion.div>
            )}

            {!isHost && (
              <p className="text-[11.5px] leading-relaxed text-violet-200/50">
                Words come from the host's word database. Add your own categories in the hidden admin panel if you want
                a house list.
              </p>
            )}
          </PanelBody>
        </Panel>

        {room.players.length < MIN_ONLINE && (
          <InlineNotice tone="warn">
            Online rooms need at least {MIN_ONLINE} players — the imposter needs someone to hide among. Share the code
            above.
          </InlineNotice>
        )}

        <div className="sticky bottom-0 z-20 pb-2 safe-b">
          <div className="glass-strong clip-hud space-y-2 px-3.5 py-3">
            {!isHost && (
              <Button
                variant={view?.me?.ready ? 'ghost' : 'primary'}
                size="lg"
                fullWidth
                onClick={() => actions.setReady(!view?.me?.ready)}
              >
                {view?.me?.ready ? 'Cancel ready' : 'I am ready'}
              </Button>
            )}
            {isHost && (
              <Button variant="primary" size="lg" fullWidth onClick={start} disabled={!canStart || busy === 'starting'}>
                {busy === 'starting' ? 'Dealing…' : canStart ? `Start game · ${room.players.length} players` : 'Waiting for everyone to ready up'}
              </Button>
            )}
            <Button variant="quiet" size="sm" fullWidth onClick={() => setConfirm(isHost ? 'close' : 'leave')}>
              {isHost ? 'Close room' : 'Leave room'}
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm === 'close' ? 'Close this room?' : 'Leave this room?'}
        message={
          confirm === 'close'
            ? 'Every player will be disconnected immediately and the room code becomes unusable.'
            : 'You can rejoin later with the same name and room code while the game is still running.'
        }
        confirmLabel={confirm === 'close' ? 'Close room' : 'Leave'}
        onCancel={() => setConfirm(null)}
        onConfirm={handleConfirm}
      />
    </>
  )
}

export default LobbyView
