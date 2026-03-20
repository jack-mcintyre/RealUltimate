import { get, query, ref, orderByChild, equalTo, set } from 'firebase/database';
import { db } from '../../firebaseConfig';
import { GameState } from './types';

export const GameService = {
    // Fallback/Migration: we read directly from the team's `pastGames` node.
    // If it doesn't exist, we run a one-time full fetch (which might be slow)
    // and auto-migrate games into that node.
    getPastGamesForTeam: async (teamId: string): Promise<GameState[]> => {
        try {
            const pastGamesRef = ref(db, `teams/${teamId}/pastGames`);
            const pastGamesSnap = await get(pastGamesRef);
            
            const pastGames: GameState[] = [];
            
            if (pastGamesSnap.exists()) {
                const gameIds = Object.keys(pastGamesSnap.val());
                for (const gameId of gameIds) {
                    const gameSnap = await get(ref(db, `games/${gameId}`));
                    if (gameSnap.exists()) {
                        pastGames.push({ ...gameSnap.val(), gameId });
                    }
                }
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
            return pastGames.sort((a,b) => {
               const timeA = a.history && a.history.length > 0 ? a.history[a.history.length-1].timestamp : 0;
               const timeB = b.history && b.history.length > 0 ? b.history[b.history.length-1].timestamp : 0;
               return timeB - timeA;
            });
        } catch (error) {
            console.error("Error fetching past games:", error);
            return [];
        }
    },

    deleteGame: async (gameId: string): Promise<void> => {
        try {
            const gameRef = ref(db, `games/${gameId}`);
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
