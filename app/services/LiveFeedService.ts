import { onValue, ref } from 'firebase/database';
import { db } from '../../firebaseConfig';
import { GameState } from './types';

export const LiveFeedService = {
    subscribeToActiveGame: (gameId: string, callback: (gameState: GameState | null) => void) => {
        const gameRef = ref(db, `games/${gameId}`);
        return onValue(gameRef, (snapshot) => {
            const gameData = snapshot.val();
            if (gameData && gameData.isGameActive) {
                callback(gameData as GameState);
            } else {
                callback(null);
            }
        });
    }
};
