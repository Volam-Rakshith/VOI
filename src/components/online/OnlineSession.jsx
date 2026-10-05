/**
 * OnlineSession — single mount point for the online hook.
 * Renders the setup panel when the player is not in a room, the lobby while
 * the room waits, and the in-game screens once play begins.
 */

import { useEffect } from 'react'
import { useOnlineRoom } from '../../hooks/useOnlineRoom.js'
import { useWordBank } from '../../context/WordBankContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { LobbyView } from './LobbyView.jsx'
import { OnlineGamePhases } from './OnlineGamePhases.jsx'
import { ROOM_STATUS, STORAGE_KEYS } from '../../data/constants.js'
import { readJSON } from '../../utils/storage.js'

export function OnlineSession({ renderSetup, onExit }) {
  const bank = useWordBank()
  const toast = useToast()
  const online = useOnlineRoom(bank)
  const lastSession = readJSON(STORAGE_KEYS.session, null)

  /* Surface connection problems as toasts too — banners can be missed. */
  useEffect(() => {
    if (online.connection.state === 'error' && online.connection.error) toast.error(online.connection.error)
  }, [online.connection.state, online.connection.error, toast])

  if (!online.isInRoom) {
    return renderSetup({
      configured: online.configured,
      busy: online.busy,
      lastSession,
      createRoom: (name, config) => online.actions.createRoom(name, config),
      joinRoom: (name, code) => online.actions.joinRoom(name, code),
      rejoin: async (session) => {
        const result = await online.actions.joinRoom(session.name, session.code)
        return result
      },
      connection: online.connection,
    })
  }

  const inLobby = !online.room?.game && online.room?.status === ROOM_STATUS.LOBBY

  return (
    <>
      {inLobby ? (
        <LobbyView online={online} onExit={onExit} />
      ) : (
        <OnlineGamePhases online={online} onExit={onExit} />
      )}
    </>
  )
}

export default OnlineSession
