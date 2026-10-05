/**
 * Lobby — the deep-linkable room route (#/lobby?room=CODE).
 * If this device already holds a session it jumps straight in; otherwise it
 * asks for a name and joins that specific code.
 */

import { useCallback, useState } from 'react'
import { LIMITS, ROUTES } from '../data/constants.js'
import { Button } from '../components/ui/Button.jsx'
import { Field } from '../components/ui/Controls.jsx'
import { ScreenHeader, ScreenShell } from '../components/ui/Layout.jsx'
import { Panel, PanelBody, PanelHeader } from '../components/ui/Panel.jsx'
import { InlineNotice } from '../components/ui/Feedback.jsx'
import { OnlineSession } from '../components/online/OnlineSession.jsx'
import { RoomCodeCard } from '../components/lobby/RoomCodeCard.jsx'
import { useRouter } from '../lib/router.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { normalizeName, validatePlayerName, validateRoomCode } from '../utils/validate.js'

export function Lobby({ onNavigate }) {
  const { params } = useRouter()
  const toast = useToast()
  const code = (params.room || '').toUpperCase()
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  const renderSetup = useCallback(
    ({ configured, busy, joinRoom }) => (
      <ScreenShell>
        <ScreenHeader title={`Join ${code || 'a room'}`} eyebrow="online room" onBack={() => onNavigate(ROUTES.online)} />
        <div className="shell-narrow flex-1 space-y-4 pb-6">
          {code ? <RoomCodeCard code={code} compact /> : <InlineNotice tone="error">That link is missing a room code.</InlineNotice>}

          <Panel annotated>
            <PanelHeader title="TAKE YOUR SEAT" subtitle="Use the same name every time to reclaim your seat after a refresh." />
            <PanelBody className="space-y-3">
              <Field
                label="your name"
                placeholder="e.g. RAKSHITH"
                value={name}
                maxLength={LIMITS.NAME_MAX}
                autoComplete="nickname"
                error={error}
                onChange={(event) => {
                  setName(normalizeName(event.target.value))
                  setError('')
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') document.getElementById('lobby-join')?.click()
                }}
              />
              {!configured && (
                <InlineNotice tone="info">
                  Online rooms need a Supabase project. Add the two public values described in the README and this screen
                  goes live.
                </InlineNotice>
              )}
              <Button
                id="lobby-join"
                variant="primary"
                fullWidth
                disabled={!code || busy === 'joining' || !configured}
                onClick={async () => {
                  const check = validatePlayerName(name)
                  const codeCheck = validateRoomCode(code)
                  if (!check.ok) return setError(check.error)
                  if (!codeCheck.ok) return setError(codeCheck.error)
                  const result = await joinRoom(check.value, codeCheck.value)
                  if (!result?.ok) {
                    setError('')
                    toast.error(result?.error || 'Could not join that room')
                  }
                }}
              >
                {busy === 'joining' ? 'Connecting…' : 'Join room'}
              </Button>
            </PanelBody>
          </Panel>
        </div>
      </ScreenShell>
    ),
    [code, name, error, onNavigate, toast],
  )

  return <OnlineSession renderSetup={renderSetup} onExit={() => onNavigate(ROUTES.online)} />
}

export default Lobby
