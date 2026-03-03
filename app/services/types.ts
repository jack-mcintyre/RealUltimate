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
  accessCode: string;
  players: Record<string, Player>; // Map player ID to Player for easy access
}

export type EventType =
  | 'G' // Goal
  | 'T' // Throwaway
  | 'D' // Defense Block
  | 'Callahan'
  | 'Drop'
  | 'Catch'
  | 'Pull'
  | 'EndOfFirstQuarter'
  | 'Halftime'
  | 'EndOfThirdQuarter'
  | 'GameOver'
  | 'Timeout'
  | 'Injury'
  | 'Undo'; // Special event type for undo tracking? Or handle separately

export interface GameEvent {
  id: string;
  gameId: string;
  type: EventType;
  timestamp: number;
  playerId?: string; // Player who committed the action (scored, threw away, etc)
  assistantId?: string; // Player who assisted (for goals)
  opponent?: string; // If applicable (e.g. who got D'd?) - maybe not needed for MVP
  subIn?: string; // Player ID entering
  subOut?: string; // Player ID leaving
  teamId: string; // Which team the event belongs to
  details?: string; // Extra info
}

export interface GameState {
  gameId: string;
  team1Id: string;
  team2Id: string; // Or "Opponent Name" if not tracking both sides fully
  score1: number;
  score2: number;
  possession: string; // teamId of team with disc
  currentLine: string[]; // Array of player IDs on field
  history: GameEvent[]; // Stack of events
  isGameActive: boolean;
  gameTime?: number; // In seconds
  playerStats: Record<string, PlayerStats>; // Map playerId to their stats
}

export const INITIAL_GAME_STATE: GameState = {
  gameId: '',
  team1Id: '',
  team2Id: '',
  score1: 0,
  score2: 0,
  possession: '',
  currentLine: [],
  history: [],
  isGameActive: false,
  playerStats: {},
};
