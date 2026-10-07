/**
 * Brand + gameplay constants.
 * Single source of truth for copy, limits and tunables.
 */

export const BRAND = {
  studio: 'VR DEVELOPMENTS',
  game: 'IMPOSTER',
  tagline: 'One of you is lying.',
  footer: 'Crafted with passion by VR DEVELOPMENTS',
  version: '1.0.7',
}

export const LIMITS = {
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 20,
  MIN_IMPOSTERS: 1,
  NAME_MAX: 16,
  NAME_MIN: 1,
  WORD_MAX: 28,
  CATEGORY_NAME_MAX: 24,
  ROOM_CODE_LENGTH: 4,
}

/** Turn durations offered in setup (seconds). */
export const TURN_DURATIONS = [15, 30, 45, 60, 90]

/** Difficulty tiers for the word engine. */
export const DIFFICULTIES = [
  { id: 'easy', label: 'Casual', notes: 'Everyday words', weight: 1 },
  { id: 'medium', label: 'Sharp', notes: 'Needs some thought', weight: 2 },
  { id: 'hard', label: 'Vicious', notes: 'Abstract & tricky', weight: 3 },
  { id: 'mixed', label: 'Mixed', notes: 'Anything goes', weight: 0 },
]

/**
 * There is one way to win now: outlast the other side.
 *
 * Crew win when the last imposter is removed; imposters win when the last crew
 * member is removed — or when a caught imposter names the secret word on their
 * one final guess. A split vote removes nobody and simply moves the game on.
 */
export const WIN_RULES = [
  {
    id: 'lastStanding',
    label: 'Last team standing',
    short: 'Nobody outvotes an empty bench',
    description:
      'Vote out an imposter and they get one guess at the crew\'s word — name it and the imposters take everything. Otherwise play continues until one side has nobody left. A split vote removes nobody.',
  },
]

/**
 * Role-assignment modes.
 * `normal` deals the fixed imposter count; `chaos` re-rolls the whole
 * assignment every round — one imposter, several, many, or the entire table.
 */
export const GAME_MODES = [
  {
    id: 'normal',
    label: 'Normal',
    short: 'Fixed imposters',
    description: 'The imposter count you chose is dealt every round — always a strict minority of the table.',
  },
  {
    id: 'chaos',
    label: 'Chaos',
    short: 'Anyone could be one',
    description:
      'Every round re-rolls the imposters at random: one, several, many — or the entire table. Nobody is safe, not even you.',
  },
]

export const VOTE_MODES = [
  {
    id: 'secret',
    label: 'Secret Ballot',
    short: 'Pass the device',
    description: 'Every player votes privately, one device at a time. Nobody sees a vote until the tally.',
  },
  {
    id: 'open',
    label: 'Open Vote',
    short: 'One accusation',
    description: 'The table argues it out and locks a single accusation. Fast, loud, brutally direct.',
  },
]

export const CLUE_ORDERS = [
  { id: 'random', label: 'Random order' },
  { id: 'seat', label: 'Seating order' },
]

export const GAME_PHASES = {
  SETUP: 'setup',
  HANDOFF: 'handoff',
  REVEAL: 'reveal',
  BRIEFING: 'briefing',
  CLUES: 'clues',
  VOTE_INTRO: 'vote_intro',
  VOTE_HANDOFF: 'vote_handoff',
  VOTE_CAST: 'vote_cast',
  TALLY: 'tally',
  GUESS: 'guess',
  RESULT: 'result',
  GAME_OVER: 'game_over',
}

export const ROLES = {
  CREW: 'crew',
  IMPOSTER: 'imposter',
}

export const ROOM_STATUS = {
  LOBBY: 'lobby',
  PLAYING: 'playing',
  ENDED: 'ended',
  TERMINATED: 'terminated',
}

export const ONLINE_PHASES = {
  LOBBY: 'lobby',
  REVEAL: 'reveal',
  BRIEFING: 'briefing',
  CLUES: 'clues',
  VOTING: 'voting',
  TALLY: 'tally',
  GUESS: 'guess',
  RESULT: 'result',
}

/** Storage keys — namespaced so nothing else on the origin collides. */
export const STORAGE_KEYS = {
  settings: 'vrdev.imposter.settings.v1',
  wordBank: 'vrdev.imposter.words.v1',
  session: 'vrdev.imposter.session.v1',
  lastConfig: 'vrdev.imposter.lastconfig.v1',
  admin: 'vrdev.imposter.blackbox.v1',
  profile: 'vrdev.imposter.profile.v1',
}

export const ROUTES = {
  home: 'home',
  local: 'local',
  online: 'online',
  lobby: 'lobby',
  howto: 'howto',
  settings: 'settings',
  blackbox: 'blackbox',
}
