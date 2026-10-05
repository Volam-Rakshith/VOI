/** Default game configuration used by setup screens and stored preferences. */

export const DEFAULT_CONFIG = {
  playerCount: 6,
  imposterCount: 1,
  categoryIds: ['random'],
  difficulty: 'mixed',
  turnSeconds: 30,
  rounds: 2,
  winRule: 'classic',
  voteMode: 'secret',
  clueOrder: 'random',
}

export const DEFAULT_NAMES = ['', '', '', '', '', '']

export function configWithPlayers(config, count) {
  const playerCount = Math.max(2, Math.min(20, count))
  const maxImposters = Math.max(1, Math.floor((playerCount - 1) / 2))
  return {
    ...config,
    playerCount,
    imposterCount: Math.min(config.imposterCount || 1, maxImposters),
  }
}

/** Clamp a configuration so it can never be invalid when handed to the engine. */
export function sanitizeConfig(config) {
  const playerCount = Math.max(2, Math.min(20, Number(config.playerCount) || 6))
  const maxImposters = Math.max(1, Math.floor((playerCount - 1) / 2))
  return {
    playerCount,
    imposterCount: Math.max(1, Math.min(maxImposters, Number(config.imposterCount) || 1)),
    categoryIds: Array.isArray(config.categoryIds) && config.categoryIds.length ? config.categoryIds : ['random'],
    difficulty: ['easy', 'medium', 'hard', 'mixed'].includes(config.difficulty) ? config.difficulty : 'mixed',
    turnSeconds: [15, 30, 45, 60, 90].includes(Number(config.turnSeconds)) ? Number(config.turnSeconds) : 30,
    rounds: Math.max(1, Math.min(6, Number(config.rounds) || 2)),
    winRule: ['classic', 'survival'].includes(config.winRule) ? config.winRule : 'classic',
    voteMode: ['secret', 'open'].includes(config.voteMode) ? config.voteMode : 'secret',
    clueOrder: ['random', 'seat'].includes(config.clueOrder) ? config.clueOrder : 'random',
  }
}
