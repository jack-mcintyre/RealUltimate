import { get, ref, set } from 'firebase/database';
import { db } from '../../firebaseConfig';
import { GameEvent, GameState } from './types';

const pastGamesCache = new Map<string, { timestamp: number; data: GameState[] }>();
const PAST_GAMES_CACHE_TTL_MS = 45 * 1000;

export const GameService = {
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
            const pastGamesSnap = await get(pastGamesRef);
            
            const pastGames: GameState[] = [];
            
            if (pastGamesSnap.exists()) {
                const gameIds = Object.keys(pastGamesSnap.val());
                const gameSnapshots = await Promise.all(
                    gameIds.map(async (gameId) => {
                        const gameSnap = await get(ref(db, `games/${gameId}`));
                        return gameSnap.exists() ? ({ ...gameSnap.val(), gameId } as GameState) : null;
                    })
                );

                gameSnapshots.forEach((game) => {
                    if (game) pastGames.push(game);
                });
            } else {
                // Migration: Fallback to full fetch
                const gamesRef = ref(db, 'games');
                const snap = await get(gamesRef);
                
                if (snap.exists()) {
                    const migratePromises: Promise<void>[] = [];
                    snap.forEach((childSnap: any) => {
                        const game = childSnap.val();
                        const key = childSnap.key;
                        
                        if (game.team1Id === teamId || game.team2Id === teamId) {
                            if (game.isGameActive === false) {
                                pastGames.push({ ...game, gameId: key });
                                // Auto-migrate the missing record
                                migratePromises.push(set(ref(db, `teams/${teamId}/pastGames/${key}`), true));
                            }
                        }
                    });
                    await Promise.all(migratePromises);
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
            if (game.team2Id) {
                await set(ref(db, `teams/${game.team2Id}/pastGames/${gameId}`), null);
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
    }
};
