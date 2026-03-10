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
}

export interface Team {
  id: string;
  coachId: string;
  name: string;
  accessCode: string; // Coach Code
  spectatorCode?: string; // Spectator Code (Optional for backward compatibility)
  players: Record<string, Player>; // Map player ID to Player for easy access
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
  | 'Opponent Score' // When the other team scores (so we don't need a specific player)
  | 'Opponent Turnover' // When the other team turns it over (so we don't need a specific player)
  | 'Halftime' // Context event to flip possession and track periods
  | 'End Halftime'
  | 'Timeout';

export interface GameEvent {
  id: string; // Unique ID for event
  gameId: string;
  type: EventType;
  timestamp: number;
  teamId?: string;
  playerId?: string;
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
  history: []
};
