/** OnlineGame — create or join a room, then hand over to the session view. */

import { useCallback } from 'react'
import { ROUTES } from '../data/constants.js'
import { OnlineSetup } from '../components/lobby/OnlineSetup.jsx'
import { OnlineSession } from '../components/online/OnlineSession.jsx'
import { ScreenHeader, ScreenShell } from '../components/ui/Layout.jsx'
import { Panel, PanelBody } from '../components/ui/Panel.jsx'
import { InlineNotice } from '../components/ui/Feedback.jsx'
import { useToast } from '../context/ToastContext.jsx'

export function OnlineGame({ onNavigate, onRoomReady }) {
  const toast = useToast()

  const renderSetup = useCallback(
    ({ configured, backend, onConfigure, onCheckConfig, busy, lastSession, createRoom, joinRoom, rejoin }) => (
      <ScreenShell>
        <ScreenHeader title="Online room" eyebrow="one device each" onBack={() => onNavigate(ROUTES.home)} />
        <div className="shell-narrow flex-1 space-y-4 pb-6">
          <Panel annotated>
            <PanelBody>
              <OnlineSetup
                configured={configured}
                backend={backend}
                onConfigure={onConfigure}
                onCheckConfig={onCheckConfig}
                busy={busy}
                lastSession={lastSession}
                onSubmit={async (payload) => {
                  if (payload.mode === 'create') {
                    const result = await createRoom(payload.name, payload.config)
                    if (!result.ok) return toast.error(result.error)
                    toast.success(`Room ${result.code} created`)
                    onNavigate(ROUTES.lobby, { room: result.code })
                    return
                  }
                  const result = await joinRoom(payload.name, payload.code)
                  if (!result?.ok) return toast.error(result?.error || 'Could not join that room')
                  toast.success(result.rejoined ? 'Reconnected to your seat' : 'Joined the room')
                  onNavigate(ROUTES.lobby, { room: payload.code })
                }}
                onQuickJoin={async (session) => {
                  const result = await rejoin(session)
                  if (!result?.ok) return toast.error(result?.error || 'That room is no longer available')
                  onNavigate(ROUTES.lobby, { room: session.code })
                }}
              />
            </PanelBody>
          </Panel>

          <InlineNotice tone="info">
            Every player needs their own device and the same room code. The secret word is never broadcast — it is
            delivered privately to each player's device, and only after the host starts the game.
          </InlineNotice>
        </div>
      </ScreenShell>
    ),
    [onNavigate, toast],
  )

  return <OnlineSession renderSetup={renderSetup} onExit={() => onNavigate(ROUTES.online)} />
}

export default OnlineGame
