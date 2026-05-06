export type PlayerRole =
  | 'handler'
  | 'cutter'
  | 'hybrid'
  | 'o_handler'
  | 'o_cutter'
  | 'd_handler'
  | 'd_cutter';

export type PlayerPrimaryLine = 'O' | 'D' | 'flex';
export type PlayerPosition = 'handler' | 'cutter' | 'hybrid';
export type PointLineType = 'O' | 'D';

export const GUEST_TEAM_ID = '__guest_opponent__';
export const isGuestTeamId = (teamId?: string | null) => !teamId || teamId === GUEST_TEAM_ID;
export const isRealTeamId = (teamId?: string | null) => !!teamId && teamId !== GUEST_TEAM_ID;

export type StatPrivacy = 'public' | 'team' | 'private';

export interface Player {
  id: string;
  name: string;
  number?: string;
  teamId: string;
  role?: PlayerRole;
  primaryLine?: PlayerPrimaryLine;
  position?: PlayerPosition;
  badge?: string;
  claimedByUid?: string;
  claimCodeHash?: string;
  claimCodeCreatedAt?: number;
  verifiedRosterLink?: boolean;
  statPrivacy?: StatPrivacy;
  signatureMove?: string;
  cardRarity?: 'base' | 'bronze' | 'silver' | 'gold' | 'elite' | 'iron';
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
  pointsPlayed?: number;
  oPointsPlayed?: number;
  dPointsPlayed?: number;
  pointDiff?: number;
}

export interface TeamManager {
  email: string;
  role: string;
  displayName?: string;
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
  coachDisplayName?: string;
}

export interface TeamPageSettings {
  isPublic: boolean;
  advancedStatsPublic: boolean;
  mediaPublic: boolean;
  showCoachCode?: boolean;
  showFanCode?: boolean;
  showFanCount?: boolean;
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

export interface NotificationTeamPreference {
  enabled: boolean;
  scoreAlerts?: 'all' | 'finals' | 'off';
  milestoneAlerts?: boolean;
  comebackAlerts?: boolean;
  liveActivityEnabled?: boolean;
  playerFilters?: string[];
}

export interface NotificationPreferences {
  pushSetting: 'all' | 'game' | 'off';
  liveActivitiesEnabled: boolean;
  milestoneAlertsEnabled: boolean;
  comebackAlertsEnabled: boolean;
  tournamentAlertsEnabled: boolean;
  teamPreferences?: Record<string, NotificationTeamPreference>;
}

export interface UserDeviceToken {
  token: string;
  platform: 'ios' | 'android' | 'web' | 'unknown';
  updatedAt: number;
  appVersion?: string;
}

export type SafetyReportTargetType = 'game' | 'team' | 'player' | 'tournament' | 'match_room' | 'profile';

export interface SafetyReport {
  id: string;
  reporterUid: string;
  targetType: SafetyReportTargetType;
  targetId: string;
  targetUid?: string;
  reason: string;
  details?: string;
  status: 'open' | 'reviewed' | 'dismissed' | 'actioned';
  createdAt: number;
}

export interface UserBlock {
  blockedUid: string;
  createdAt: number;
  source?: SafetyReportTargetType;
}

export interface AppLaunchConfig {
  minSupportedVersion?: string;
  latestVersion?: string;
  maintenanceMode?: boolean;
  maintenanceMessage?: string;
  upgradeMessage?: string;
  appStoreUrl?: string;
  playStoreUrl?: string;
}

export interface Team {
  id: string;
  coachId: string;
  name: string;
  accessCode?: string; // Coach Code (legacy; new teams store under teamJoinCodes)
  spectatorCode?: string; // Spectator Code (Optional for backward compatibility)
  players: Record<string, Player>; // Map player ID to Player for easy access
  managers?: Record<string, TeamManager>; // RBAC Permissions map
  role?: 'coach' | 'spectator'; // Client-side only - indicates user's relation
  activeGameId?: string; // Tethers a running game session to this team
  pageConfig?: TeamPageConfig;
  fanCount?: number;
}

export interface TeamJoinCodes {
  coach: string;
  spectator: string;
  /**
   * Dedicated observer / neutral-scorer code. Distinct from the public
   * spectator code so coaches can rotate scorer access without breaking
   * fan follow links. Lazily generated for legacy teams on first read.
   */
  observer?: string;
}

export type TeamAccessRole = 'coach' | 'spectator' | 'observer';

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

export interface TeamGameLink {
  gameId: string;
  teamId: string;
  opponentTeamId?: string;
  status: 'active' | 'final';
  createdAt: number;
  completedAt?: number;
  source: 'primary' | 'opponent' | 'tournament' | 'observer_neutral';
  /** When source is observer_neutral, coaches must accept before the game appears in team history / stats. */
  profileInclusion?: 'pending' | 'accepted' | 'declined';
}

export type TournamentPrivacy = 'public' | 'private';
export type TournamentEnrollmentMode = 'manual' | 'open';
export type TournamentEngine = 'single_elim' | 'pool_to_bracket';
export type TournamentSeeding = 'manual' | 'rating' | 'random';
export type TournamentStatus = 'draft' | 'active' | 'completed';
export type TournamentStage = 'pool' | 'crossover' | 'championship' | 'consolation';
export type TournamentMatchStatus = 'upcoming' | 'in_progress' | 'final' | 'cancelled';
export type TournamentRunMode = 'manual' | 'team_self_serve';
export type TournamentScoreVerificationStatus = 'pending' | 'verified' | 'challenged' | 'overridden';
export type MisconductCardColor = 'blue' | 'yellow' | 'red';

export interface TournamentParticipant {
  id: string;
  name: string;
  seed: number;
  rating?: number;
  linkedTeamId?: string;
}

export interface TournamentStanding {
  participantId: string;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDiff: number;
  rank: number;
  pool?: string; // which pool this standing belongs to
}

export interface TournamentMatch {
  id: string;
  stage: TournamentStage;
  round: number;
  group?: string;
  teamAId: string;
  teamBId: string;
  teamAScore?: number;
  teamBScore?: number;
  winnerId?: string;
  loserId?: string;
  nextMatchId?: string;
  nextSlot?: 'A' | 'B';
  consolationNextMatchId?: string;
  consolationNextSlot?: 'A' | 'B';
  scheduledTime?: string;
  fieldName?: string;
  matchStatus?: TournamentMatchStatus;
  day?: number; // 1, 2, 3 for multi-day
  linkedGameId?: string; // Links to a RealUltimate game for live stat tracking
  linkedGameIdB?: string; // Team B's independent game recording
  captainCheckIn?: { teamA?: boolean; teamB?: boolean };
  verificationStatus?: TournamentScoreVerificationStatus;
  scoreSubmittedBy?: Record<string, TournamentScoreSubmission>;
  challengeDeadlineAt?: number;
  challengedByParticipantId?: string;
  challengeReason?: string;
  verifiedAt?: number;
  verifiedBy?: string;
}

export interface TournamentActivityEntry {
  id: string;
  message: string;
  timestamp: number;
  type: 'score' | 'schedule' | 'system' | 'announcement';
}

export interface TournamentScoreSubmission {
  participantId: string;
  submittedByUid: string;
  teamAScore: number;
  teamBScore: number;
  linkedGameId?: string;
  createdAt: number;
}

export interface TournamentSpiritSubmission {
  matchId: string;
  fromParticipantId: string;
  forParticipantId: string;
  submittedByUid: string;
  rules: number;
  fouls: number;
  fairness: number;
  attitude: number;
  communication: number;
  total: number;
  createdAt: number;
}

export interface TournamentRoomMessage {
  id: string;
  matchId: string;
  senderUid: string;
  participantId?: string;
  message: string;
  createdAt: number;
}

export interface TournamentMisconductReport {
  id: string;
  matchId?: string;
  reporterUid: string;
  participantId?: string;
  teamId?: string;
  playerId?: string;
  cardColor: MisconductCardColor;
  reason: string;
  createdAt: number;
  status: 'open' | 'reviewed' | 'dismissed';
}

export interface TournamentSpiritScore {
  participantId: string;
  rules: number;
  fouls: number;
  fairness: number;
  attitude: number;
  communication: number;
  total: number;
}

export interface Tournament {
  id: string;
  teamId?: string;
  teamName?: string;
  hostName?: string;
  name: string;
  privacy: TournamentPrivacy;
  joinCode?: string;
  adminCode?: string;
  admins?: Record<string, boolean>;
  enrollmentMode: TournamentEnrollmentMode;
  engine: TournamentEngine;
  seeding: TournamentSeeding;
  includeConsolation: boolean;
  status: TournamentStatus;
  createdAt: number;
  startDate?: string;
  endDate?: string;
  enrollmentDeadline?: string;
  createdBy: string;
  participants: Record<string, TournamentParticipant>;
  pools?: Record<string, string[]>;
  qualifierCount?: number;
  matches: Record<string, TournamentMatch>;
  standings?: Record<string, TournamentStanding>;
  spiritScores?: Record<string, TournamentSpiritScore>;
  bio?: string;
  announcements?: string;
  announcementFeed?: { id: string; message: string; timestamp: number }[];
  logoUrl?: string;
  bannerUrl?: string;
  manualPoolAssignments?: Record<string, string>; // participantId -> pool key (e.g. 'A')
  poolCount?: number;

  // Advanced Customization
  tiebreakerLogic?: 'head_to_head' | 'point_diff';
  hardCapScore?: number;
  softCapTimeMinutes?: number;
  timeoutsPerHalf?: number;
  liveScorePublic?: boolean;

  // Pool Configuration
  poolSize?: number; // teams per pool (3, 4, 5)
  qualifiersPerPool?: number; // how many advance from each pool
  poolFormat?: 'round_robin' | 'partial';

  // Bracket Configuration
  bracketFormat?: 'single_elim' | 'double_elim';
  includeThirdPlace?: boolean;
  crossoverEnabled?: boolean;

  // Schedule
  scheduleDays?: number; // 1, 2, 3
  scheduleHold?: { active: boolean; reason?: string; since?: number };
  archivedPoolMatches?: Record<string, TournamentMatch>;

  // Activity Log
  activityLog?: TournamentActivityEntry[];

  // Templates
  templateId?: string;

  // Team-run / trust and safety settings
  runMode?: TournamentRunMode;
  teamSelfServeEnabled?: boolean;
  coachChatEnabled?: boolean;
  teamScoreSubmissionEnabled?: boolean;
  requireScoreVerification?: boolean;
  scoreChallengeWindowMinutes?: number;
  mandatorySpiritEnabled?: boolean;
  spiritLeaderboardEnabled?: boolean;
  misconductTrackingEnabled?: boolean;
  observerOnlyCards?: boolean;
  playerClaimingEnabled?: boolean;
  tradingCardsEnabled?: boolean;
  statPrivacyDefault?: StatPrivacy;
  lineCallAssistantEnabled?: boolean;
  practiceKpiEnabled?: boolean;
  recapCardsEnabled?: boolean;
  teamSpecificNotificationsEnabled?: boolean;
  predictionEnabled?: boolean;
  publicBracketEnabled?: boolean;
  publicRosterStatsEnabled?: boolean;
  fieldAssignmentPublic?: boolean;
  matchRoomMediaEnabled?: boolean;
  bracketPredictionEnabled?: boolean;
  spiritChampionBadgeEnabled?: boolean;
  tournamentPageDensity?: 'compact' | 'comfortable';
  recapCardStyle?: 'classic' | 'bold' | 'minimal';
  coachChatVisibility?: 'coaches_only' | 'td_visible';
  venueName?: string;
  venueAddress?: string;
  parkingInfo?: string;
  medicalInfo?: string;
  weatherPolicy?: string;
  scheduleNotes?: string;
  sponsorLine?: string;
  publicContactEmail?: string;
  roomMessages?: Record<string, Record<string, TournamentRoomMessage>>;
  spiritSubmissions?: Record<string, Record<string, TournamentSpiritSubmission>>;
  misconductReports?: Record<string, TournamentMisconductReport>;
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
  | 'Blue Card'
  | 'Yellow Card'
  | 'Red Card';

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
  /** Observer-delegated events are quarantined until coach finalizes the game. */
  is_verified?: boolean;
  cardColor?: MisconductCardColor;
  infractionReason?: string;
  lineupPlayerIds?: string[];
  lineType?: PointLineType;
  pointNumber?: number;
  timeoutDurationSec?: number;
}

export interface PointLineupSnapshot {
  pointNumber: number;
  lineType: PointLineType;
  playerIds: string[];
  startedAt: number;
  completedAt?: number;
  scoredByTeamId?: string;
  scoreAfter?: {
    team1: number;
    team2: number;
  };
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
  team2LinkedTeamId?: string; // Real opponent team when available
  recordingMode?: 'team' | 'observer';
  trackedTeamIds?: string[];
  opponentRosterSnapshot?: Record<string, Pick<Player, 'id' | 'name' | 'number' | 'teamId' | 'primaryLine' | 'position'>>;
  gameLocation?: string;
  score1: number;
  score2: number;
  possession: string; // which team has the disc
  firstHalfPossession: string; // Team ID
  gameTarget: number;
  gameFormat?: '7v7' | '5v5' | 'custom';
  softCapMinutes?: number;
  hardCapMinutes?: number;
  timeoutDurationSec?: number;
  activeTimeoutStartedAt?: number;
  isHalftime: boolean;
  isGameActive: boolean;
  playerStats: Record<string, PlayerStats>;
  history?: GameEvent[];
  currentLineupPlayerIds?: string[];
  currentPointNumber?: number;
  pointLineups?: Record<string, PointLineupSnapshot>;
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
  delegatedRecorderUid?: string;
  delegatedRecordingScope?: 'team' | 'both';
  recordingLockOwner?: 'coach' | 'observer';
  activeObserverSessionPin?: string;
  predictions?: PredictionVote; // Live spectator predictions
  tournamentId?: string;
  tournamentMatchId?: string;
  tournamentParticipantId?: string;
  recordingPerspective?: 'A' | 'B' | 'standalone';
  /** Recorded by a neutral party using two spectator codes; not owned by either coach. */
  recordingSource?: 'coach' | 'observer_neutral';
  observerRecorderUid?: string;
  /** Snapshots of both rosters at game start (keys = real team ids). */
  neutralObserverRosters?: Record<string, Record<string, Pick<Player, 'id' | 'name' | 'number' | 'teamId' | 'primaryLine' | 'position'>>>;
  /**
   * Display-only flag for the recorder field map. When true, the operator has
   * physically swapped which side of the field each team defends on screen.
   *
   * Storage convention: field coordinates ALWAYS persist in canonical
   * "team1 attacks toward y=100" space. The recorder applies a 180° transform
   * (x' = 100 - x, y' = 100 - y) on tap-in and tap-out when this flag is true,
   * so history/replay can render every event without per-event state.
   */
  fieldDisplayFlipped?: boolean;
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
  recordingMode: 'team',
  trackedTeamIds: [],
  gameFormat: '7v7',
  softCapMinutes: 75,
  hardCapMinutes: 90,
  timeoutDurationSec: 70,
  isHalftime: false,
  isGameActive: false,
  playerStats: {},
  history: [],
  currentLineupPlayerIds: [],
  currentPointNumber: 1,
  pointLineups: {},
  advancedTracking: false,
  fieldMapEnabled: false,
  sotgEnabled: false,
  streamUrl: '',
  gameStartTimestamp: 0,
  currentRecorderId: '',
  recorderPin: '',
};
