export interface Player {
  id: string;
  name: string;
  number?: string;
  teamId: string;
}

export interface PlayerStats {
  goals: number;
  assists: number;
  blocks: number; // D's
  turns: number; // Throwaways + Drops
  passes: number;
  callahans: number;
  timeWithDisc: number; // in milliseconds
}

export interface TeamManager {
  email: string;
  role: string;
}

export interface Team {
  id: string;
  coachId: string;
  name: string;
  accessCode: string; // Coach Code
  spectatorCode?: string; // Spectator Code (Optional for backward compatibility)
  players: Record<string, Player>; // Map player ID to Player for easy access
  managers?: Record<string, TeamManager>; // RBAC Permissions map
  role?: 'coach' | 'spectator'; // Client-side only - indicates user's relation
  activeGameId?: string; // Tethers a running game session to this team
}

export type EventType =
  | 'Goal' // Represents an actual point scored
  | 'G' // (Legacy short form for Goal, usually map to above in UI)
  | 'Throwaway' // Unforced offensive error
  | 'T' // (Legacy)
  | 'Drop' // Receiver dropped the disc
  | 'D-Block' // Defensive block on the disc
  | 'D' // (Legacy)
  | 'Pass' // Advanced tracking: when a player passes to another
  | 'Opponent Score' // When the other team scores (so we don't need a specific player)
  | 'Opponent Turnover' // When the other team turns it over (so we don't need a specific player)
  | 'Callahan_US'
  | 'Callahan_THEM'
  | 'Halftime' // Context event to flip possession and track periods
  | 'End Halftime'
  | 'Timeout'
  | 'Pass'; // Advanced tracking: when a player passes to another

// Field coordinates for premium tracking (field map input)
export interface FieldCoordinate {
  x: number; // 0-100 percentage across field width (0=left sideline, 100=right sideline)
  y: number; // 0-100 percentage across field length (0=our endzone, 100=their endzone)
}

export interface GameEvent {
  id: string; // Unique ID for event
  gameId: string;
  type: EventType;
  timestamp: number;
  teamId?: string;
  playerId?: string;
  assistPlayerId?: string; // Player who threw the assist
  timeElapsedMs?: number; // Time spent on a pass/possession
  fieldPosition?: FieldCoordinate; // Premium field map tracking
  gameElapsedSec?: number; // Seconds since game start (for timestamp bookmarks)
}

// Spectator emoji reactions
export interface SpectatorReaction {
  id: string;
  emoji: string;
  userId: string;
  timestamp: number;
}

// Live prediction vote
export interface PredictionVote {
  team1Votes: number;
  team2Votes: number;
  voters: Record<string, string>; // userId -> teamId they voted for
  snapshots?: PredictionSnapshot[]; // Historical snapshots for replay chart
}

export interface PredictionSnapshot {
  timestamp: number;
  gameElapsedSec: number;
  team1Pct: number;
  team2Pct: number;
  totalVotes: number;
  score1: number;
  score2: number;
}

export interface GameState {
  gameId: string;
  team1Id: string; // US
  team2Id: string; // THEM
  team2Name?: string; // GUEST TEAM TEMP NAME
  score1: number;
  score2: number;
  possession: string; // which team has the disc
  firstHalfPossession: string; // Team ID
  gameTarget: number;
  isHalftime: boolean;
  isGameActive: boolean;
  playerStats: Record<string, PlayerStats>;
  history?: GameEvent[];
  advancedTracking?: boolean; // If true, tracks passing & possession time
  fieldMapEnabled?: boolean; // If true, premium field map input is enabled
  sotgEnabled?: boolean;
  sotgScore?: {
    rules: number;
    fouls: number;
    fairness: number;
    attitude: number;
    communication: number;
  };
  streamUrl?: string; // Optional livestreaming URL (Twitch/YouTube)
  gameStartTimestamp?: number; // Epoch ms when game started (for timestamp bookmarks)
  currentRecorderId?: string; // UID of person currently recording (for bench hand-off)
  recorderPin?: string; // 4-digit PIN for bench hand-off
  predictions?: PredictionVote; // Live spectator predictions
}

export const INITIAL_GAME_STATE: GameState = {
  gameId: '',
  team1Id: '',
  team2Id: '',
  score1: 0,
  score2: 0,
  possession: '',
  firstHalfPossession: '',
  gameTarget: 15,
  isHalftime: false,
  isGameActive: false,
  playerStats: {},
  history: [],
  advancedTracking: false,
  fieldMapEnabled: false,
  sotgEnabled: false,
  streamUrl: '',
  gameStartTimestamp: 0,
  currentRecorderId: '',
  recorderPin: '',
};
