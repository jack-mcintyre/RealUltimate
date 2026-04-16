export type PlayerRole =
  | 'handler'
  | 'cutter'
  | 'hybrid'
  | 'o_handler'
  | 'o_cutter'
  | 'd_handler'
  | 'd_cutter';

export interface Player {
  id: string;
  name: string;
  number?: string;
  teamId: string;
  role?: PlayerRole;
  badge?: string;
}

export interface PlayerStats {
  goals: number;
  assists: number;
  blocks: number; // D's
  turns: number; // Throwaways + Drops
  passes: number;
  callahans: number;
  timeWithDisc: number; // in milliseconds
  passAttempts?: number;
  passCompletions?: number;
  passTurnovers?: number;
  receptions?: number;
}

export interface TeamManager {
  email: string;
  role: string;
}

export interface SocialLinks {
  x?: string;
  youtube?: string;
  facebook?: string;
  instagram?: string;
  tiktok?: string;
  website?: string;
}

export interface TeamMediaItem {
  id: string;
  type: 'image' | 'youtube' | 'link';
  title: string;
  url: string;
  thumbnailUrl?: string;
  createdAt: number;
}

export interface TeamPageBranding {
  avatarUrl?: string;
  bannerUrl?: string;
  bio?: string;
}

export interface TeamPageSettings {
  isPublic: boolean;
  advancedStatsPublic: boolean;
  mediaPublic: boolean;
}

export interface TeamThemeConfig {
  accentColor?: string;
}

export interface TeamPinnedAnnouncement {
  message: string;
  expiresAt?: number;
}

export interface TeamPageConfig {
  branding?: TeamPageBranding;
  settings?: TeamPageSettings;
  socialLinks?: SocialLinks;
  media?: TeamMediaItem[];
  theme?: TeamThemeConfig;
  announcement?: TeamPinnedAnnouncement;
}

export interface UserPublicProfile {
  avatarUrl?: string;
  bannerUrl?: string;
  bio?: string;
  socialLinks?: SocialLinks;
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
  pageConfig?: TeamPageConfig;
}

export type ScheduledAvailabilityStatus = 'yes' | 'no';

export interface ScheduledGame {
  id: string;
  teamId: string;
  teamName: string;
  opponentName: string;
  opponentTeamId?: string;
  location?: string;
  scheduledAt?: number;
  availability?: Record<string, ScheduledAvailabilityStatus>;
  createdAt: number;
  createdBy: string;
}

export type EventType =
  | 'Goal' // Represents an actual point scored
  | 'G' // (Legacy short form for Goal, usually map to above in UI)
  | 'Pickup' // Player gains disc without a recorded pass (pulls, stoppages, resets)
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
  fromPlayerId?: string; // Explicit passer/thrower (advanced tracking)
  toPlayerId?: string; // Explicit intended receiver (advanced tracking)
  timeElapsedMs?: number; // Time spent on a pass/possession
  fromFieldPosition?: FieldCoordinate; // Origin marker for pass vector rendering
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
  gameLocation?: string;
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
  gameLocation: '',
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
