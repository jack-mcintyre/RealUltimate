import { get, query, ref, orderByChild, equalTo } from 'firebase/database';
import { db } from '../../firebaseConfig';
import { GameState } from './types';

export const GameService = {
    // Standard Firebase requires indexing to use orderByChild efficiently.
    // For MVP, if no rules are set, this might fail or pull the whole node locally down.
    // We will do a full fetch and filter client side.
    getPastGamesForTeam: async (teamId: string): Promise<GameState[]> => {
        try {
            const gamesRef = ref(db, 'games');
            const snapshot = await get(gamesRef);
            
            if (!snapshot.exists()) return [];

            const allGames: Record<string, GameState> = snapshot.val();
            const pastGames: GameState[] = [];

            for (const [key, game] of Object.entries(allGames)) {
                // Must involve our team, AND must be finalized (isGameActive === false)
                if ((game.team1Id === teamId || game.team2Id === teamId) && game.isGameActive === false) {
                    pastGames.push({ ...game, gameId: key });
                }
            }

            // Sort newest first (highest timestamp) internally if needed, but Firebase push IDs sort chronologically naturally
            return pastGames.reverse();
        } catch (error) {
            console.error("Error fetching past games:", error);
            return [];
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
