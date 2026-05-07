import { get, onValue, push, ref, set, query, limitToLast } from 'firebase/database';
import { db } from '../../firebaseConfig';
import { GameEvent, GameState, INITIAL_GAME_STATE, isRealTeamId, Player, Team } from './types';

const pastGamesCache = new Map<string, { timestamp: number; data: GameState[] }>();
const PAST_GAMES_CACHE_TTL_MS = 45 * 1000;

function rosterSnapFromPlayers(
    players?: Record<string, Player>
): Record<string, Pick<Player, 'id' | 'name' | 'number' | 'teamId' | 'primaryLine' | 'position'>> {
    if (!players) return {};
    return Object.fromEntries(
        Object.values(players).map((player) => {
            const snapshot: Pick<Player, 'id' | 'name' | 'number' | 'teamId' | 'primaryLine' | 'position'> = {
                id: player.id,
                name: player.name,
                teamId: player.teamId,
                ...(player.number ? { number: player.number } : {}),
                ...(player.primaryLine ? { primaryLine: player.primaryLine } : {}),
                ...(player.position ? { position: player.position } : {}),
            };
            return [player.id, snapshot];
        })
    );
}

/** Build opponent roster snapshot from an ordered player list (e.g. demo games). */
export function rosterSnapshotFromPlayerList(
    players: Player[]
): Record<string, Pick<Player, 'id' | 'name' | 'number' | 'teamId' | 'primaryLine' | 'position'>> {
    const map = Object.fromEntries(players.map((p) => [p.id, p])) as Record<string, Player>;
    return rosterSnapFromPlayers(map);
}

/**
 * 180° rotate around the field center. Used by the recorder to translate
 * between display coords (what the operator sees with the field flipped)
 * and canonical storage coords (always "team1 attacks toward y=100").
 */
export const flipFieldCoord = (coord: { x: number; y: number }): { x: number; y: number } => ({
    x: 100 - coord.x,
    y: 100 - coord.y,
});

export const GameService = {
    /** Persist the display-only field flip flag for the recorder UI. */
    setFieldDisplayFlipped: async (gameId: string, flipped: boolean): Promise<void> => {
        if (!gameId) return;
        await set(ref(db, `games/${gameId}/fieldDisplayFlipped`), !!flipped);
    },

    repairLegacyGameData: async (gameId: string): Promise<{ updated: number; total: number }> => {
        const gameRef = ref(db, `games/${gameId}`);
        const snapshot = await get(gameRef);
        if (!snapshot.exists()) return { updated: 0, total: 0 };

        const game = snapshot.val() as GameState;
        const history = [...(game.history || [])] as GameEvent[];
        if (!history.length) return { updated: 0, total: 0 };

        const repaired: GameEvent[] = [];
        const lastKnownCoords: Record<string, { x: number; y: number }> = {};
        let updated = 0;

        const normalize = (coord?: { x?: number; y?: number } | null) => {
            if (!coord) return undefined;
            if (typeof coord.x !== 'number' || typeof coord.y !== 'number') return undefined;
            if (coord.x < 0 || coord.y < 0) return undefined;
            return { x: coord.x, y: coord.y };
        };

        const getActors = (event: GameEvent) => {
            const throwerId = event.fromPlayerId || event.assistPlayerId || (event.type === 'Pass' ? event.playerId : undefined);
            const receiverId = event.toPlayerId || (event.assistPlayerId ? event.playerId : undefined);
            return { throwerId, receiverId };
        };

        history.forEach((event, index) => {
            const next: GameEvent = { ...event };
            const { throwerId, receiverId } = getActors(next);
            const isPassOutcome = next.type === 'Pass' || next.type === 'Goal' || next.type === 'G' || next.type === 'Drop' || next.type === 'Throwaway' || next.type === 'T';

            if (!next.fromPlayerId && throwerId) {
                next.fromPlayerId = throwerId;
            }
            if (!next.toPlayerId && receiverId) {
                next.toPlayerId = receiverId;
            }

            const normalizedField = normalize(next.fieldPosition);
            if (normalizedField) {
                next.fieldPosition = normalizedField;
            }

            if (isPassOutcome && !normalize(next.fromFieldPosition) && throwerId) {
                const knownFrom = lastKnownCoords[throwerId];
                if (knownFrom) {
                    next.fromFieldPosition = knownFrom;
                } else {
                    // Fallback: nearest previous event with valid position.
                    for (let i = index - 1; i >= 0; i--) {
                        const prev = repaired[i];
                        const coord = normalize(prev?.fieldPosition);
                        if (coord) {
                            next.fromFieldPosition = coord;
                            break;
                        }
                    }
                }
            }

            const normalizedFrom = normalize(next.fromFieldPosition);
            if (normalizedFrom) {
                next.fromFieldPosition = normalizedFrom;
            }

            const before = JSON.stringify(event);
            const after = JSON.stringify(next);
            if (before !== after) {
                updated += 1;
            }

            repaired.push(next);

            if (throwerId && normalize(next.fromFieldPosition)) {
                lastKnownCoords[throwerId] = normalize(next.fromFieldPosition)!;
            }
            if (receiverId && normalize(next.fieldPosition)) {
                lastKnownCoords[receiverId] = normalize(next.fieldPosition)!;
            }
            if (next.playerId && normalize(next.fieldPosition)) {
                lastKnownCoords[next.playerId] = normalize(next.fieldPosition)!;
            }
        });

        if (updated > 0) {
            await set(ref(db, `games/${gameId}/history`), repaired);
        }

        return { updated, total: history.length };
    },

    // Fallback/Migration: we read directly from the team's `pastGames` node.
    // If it doesn't exist, we run a one-time full fetch (which might be slow)
    // and auto-migrate games into that node.
    getPastGamesForTeam: async (teamId: string): Promise<GameState[]> => {
        try {
            const now = Date.now();
            const cached = pastGamesCache.get(teamId);
            if (cached && now - cached.timestamp < PAST_GAMES_CACHE_TTL_MS) {
                return cached.data;
            }

            const pastGamesRef = ref(db, `teams/${teamId}/pastGames`);
            const linkedGamesRef = ref(db, `teamGameLinks/${teamId}`);
            const [pastGamesSnap, linkedGamesSnap] = await Promise.all([
                get(pastGamesRef),
                get(linkedGamesRef),
            ]);
            
            const pastGames: GameState[] = [];
            const gameIds = new Set<string>();
            const hasLinkIndex = linkedGamesSnap.exists();

            if (pastGamesSnap.exists()) {
                Object.keys(pastGamesSnap.val()).forEach((gid) => gameIds.add(gid));
            }

            if (linkedGamesSnap.exists()) {
                const entries = linkedGamesSnap.val() as Record<string, { source?: string; profileInclusion?: string }>;
                Object.entries(entries).forEach(([gameId, link]) => {
                    if (!link || typeof gameId !== 'string') return;
                    if (link.source === 'observer_neutral') {
                        const incl = link.profileInclusion ?? 'pending';
                        if (incl === 'accepted') {
                            gameIds.add(gameId);
                        }
                        return;
                    }
                    gameIds.add(gameId);
                });
            }

            if (gameIds.size > 0) {
                const gameSnapshots = await Promise.all(
                    Array.from(gameIds).map(async (gameId) => {
                        const gameSnap = await get(ref(db, `games/${gameId}`));
                        return gameSnap.exists() ? ({ ...gameSnap.val(), gameId } as GameState) : null;
                    })
                );

                gameSnapshots.forEach((game) => {
                    if (!game) return;
                    if (game.isGameActive === false) pastGames.push(game);
                });
            } else if (!hasLinkIndex) {
                // Fallback for older data created before per-team game link indexes.
                const gamesQuery = query(ref(db, 'games'), limitToLast(300));
                const snap = await get(gamesQuery);

                if (snap.exists()) {
                    snap.forEach((childSnap: any) => {
                        const game = childSnap.val();
                        const key = childSnap.key;

                        if (game.team1Id === teamId || game.team2Id === teamId) {
                            if (game.isGameActive === false) {
                                if (game.recordingSource === 'observer_neutral') {
                                    return;
                                }
                                pastGames.push({ ...game, gameId: key });
                            }
                        }
                    });
                }
            }

            // Sort newest first based on history timestamp
            const sorted = pastGames.sort((a,b) => {
               const timeA = a.history && a.history.length > 0 ? a.history[a.history.length-1].timestamp : 0;
               const timeB = b.history && b.history.length > 0 ? b.history[b.history.length-1].timestamp : 0;
               return timeB - timeA;
            });

            pastGamesCache.set(teamId, { timestamp: now, data: sorted });
            return sorted;
        } catch (error) {
            console.error("Error fetching past games:", error);
            return [];
        }
    },

    clearPastGamesCacheForTeam: (teamId: string) => {
        pastGamesCache.delete(teamId);
    },

    /**
     * Neutral observer recording: verifies two spectator (fan) codes, creates linked game without coaching rights.
     * Neither team receives activeGameId; coaches must accept to show the finished game on the team profile.
     */
    createNeutralObserverGame: async (opts: {
        observerUid: string;
        teamA: Team;
        teamB: Team;
        gameLocation?: string;
        gameTarget?: number;
        streamUrl?: string;
    }): Promise<string> => {
        const { observerUid, teamA, teamB } = opts;
        if (!teamA?.id || !teamB?.id || teamA.id === teamB.id) {
            throw new Error('Two distinct teams required');
        }

        const [team1Id, team2Id] = [teamA.id, teamB.id].sort();
        const team1 = team1Id === teamA.id ? teamA : teamB;
        const team2 = team2Id === teamA.id ? teamB : teamA;

        const newGameRef = push(ref(db, 'games'));
        const newGameId = newGameRef.key;
        if (!newGameId) throw new Error('Failed to allocate game ID');

        const recorderPin = Math.floor(1000 + Math.random() * 9000).toString();
        const rosters = {
            [team1Id]: rosterSnapFromPlayers(team1.players),
            [team2Id]: rosterSnapFromPlayers(team2.players),
        };

        const initialState: GameState = {
            ...INITIAL_GAME_STATE,
            gameId: newGameId,
            team1Id,
            team2Id,
            team2Name: team2.name || 'Team',
            recordingMode: 'observer',
            trackedTeamIds: [team1Id, team2Id].filter(isRealTeamId),
            opponentRosterSnapshot: rosterSnapFromPlayers(team2.players),
            neutralObserverRosters: rosters,
            recordingSource: 'observer_neutral',
            observerRecorderUid: observerUid,
            gameLocation: opts.gameLocation?.trim() || '',
            score1: 0,
            score2: 0,
            possession: team1Id,
            firstHalfPossession: team1Id,
            gameTarget: opts.gameTarget ?? 15,
            isGameActive: true,
            isHalftime: false,
            advancedTracking: false,
            fieldMapEnabled: false,
            sotgEnabled: false,
            streamUrl: opts.streamUrl?.trim() || '',
            gameStartTimestamp: Date.now(),
            currentRecorderId: observerUid,
            recorderPin,
            currentLineupPlayerIds: [],
            currentPointNumber: 1,
            pointLineups: {},
            recordingPerspective: 'standalone',
        };

        await set(newGameRef, initialState);

        const createdAt = Date.now();
        const linkBase = {
            gameId: newGameId,
            status: 'active' as const,
            createdAt,
            source: 'observer_neutral' as const,
            profileInclusion: 'pending' as const,
        };

        await set(ref(db, `teamGameLinks/${team1Id}/${newGameId}`), {
            ...linkBase,
            teamId: team1Id,
            opponentTeamId: team2Id,
        });
        await set(ref(db, `teamGameLinks/${team2Id}/${newGameId}`), {
            ...linkBase,
            teamId: team2Id,
            opponentTeamId: team1Id,
        });

        return newGameId;
    },

    deleteGame: async (gameId: string, requesterId: string): Promise<void> => {
        try {
            const gameRef = ref(db, `games/${gameId}`);
            const gameSnap = await get(gameRef);
            if (!gameSnap.exists()) {
                throw new Error('Game not found');
            }

            const game = gameSnap.val() as GameState;
            const teamRef = ref(db, `teams/${game.team1Id}`);
            const teamSnap = await get(teamRef);
            if (!teamSnap.exists()) {
                throw new Error('Team not found');
            }

            const team = teamSnap.val() as any;
            const isCoach = team.coachId === requesterId;
            const isManager = !!team.managers?.[requesterId];
            if (!isCoach && !isManager) {
                throw new Error('Permission denied');
            }

            await set(ref(db, `teams/${game.team1Id}/pastGames/${gameId}`), null);
            await set(ref(db, `teamGameLinks/${game.team1Id}/${gameId}`), null);
            if (isRealTeamId(game.team2Id)) {
                await set(ref(db, `teamGameLinks/${game.team2Id}/${gameId}`), null);
            }
            await set(gameRef, null);
        } catch (error) {
            console.error("Error deleting game:", error);
            throw error;
        }
    },

    getGameById: async (gameId: string): Promise<GameState | null> => {
        try {
            const gameRef = ref(db, `games/${gameId}`);
            const snapshot = await get(gameRef);
            return snapshot.exists() ? snapshot.val() as GameState : null;
        } catch (error) {
            console.error("Error fetching game history:", error);
            return null;
        }
    },

    subscribeToGame: (gameId: string, callback: (game: GameState | null) => void) => {
        const gameRef = ref(db, `games/${gameId}`);
        return onValue(gameRef, (snapshot) => {
            callback(snapshot.exists() ? ({ ...snapshot.val(), gameId } as GameState) : null);
        });
    }
};
