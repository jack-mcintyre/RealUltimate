import { onValue, push, ref, set, update } from 'firebase/database';
import { useCallback, useEffect, useState } from 'react';
import { db } from '../../firebaseConfig';
import { GameLogic } from '../services/GameLogic';
import { TeamService } from '../services/TeamService';
import { EventType, GameEvent, GameState, INITIAL_GAME_STATE } from '../services/types';

export const useGame = (gameId?: string) => {
    const [gameState, setGameState] = useState<GameState>(INITIAL_GAME_STATE);
    const [undoStack, setUndoStack] = useState<GameState[]>([]);

    // Sync with Firebase if gameId is provided
    useEffect(() => {
        if (!gameId) return;

        const gameRef = ref(db, `games/${gameId}`);
        const unsubscribe = onValue(gameRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                // Hydrate state from history if needed, or just trust the snapshot if we store full state
                // For now, let's assume we store the full state in Firebase as 'currentState'
                // But better pattern might be to store events and rebuild? 
                // For MVP low latency, storing state is faster for readers.
                setGameState(data);
            }
        });

        return () => unsubscribe();
    }, [gameId]);

    const recordEvent = useCallback(async (type: EventType, details: any = {}) => {
        setGameState((prevState) => {
            // 1. Push current state to Undo Stack (locally)
            setUndoStack((prevStack) => [...prevStack, prevState]);

            // Strip undefined values from details to prevent Firebase crashes
            const cleanDetails = Object.fromEntries(
                Object.entries(details).filter(([_, v]) => v !== undefined)
            );

            // 2. Create Event
            const newEvent: GameEvent = {
                id: Date.now().toString(), // Simple ID for now
                gameId: prevState.gameId,
                type,
                timestamp: Date.now(),
                teamId: prevState.possession, // Default to possession team? Or pass in?
                ...cleanDetails
            };

            // 3. Calculate New State
            const newState = GameLogic.applyEvent(prevState, newEvent);

            // 4. Persist to Firebase (if online/gameId exists)
            if (prevState.gameId) {
                const gameRef = ref(db, `games/${prevState.gameId}`);
                update(gameRef, newState);
            }

            return newState;
        });
    }, []);

    const undo = useCallback(() => {
        if (undoStack.length === 0) return;

        const previousState = undoStack[undoStack.length - 1];

        // Revert State
        setGameState(previousState);

        // Pop from stack
        setUndoStack((prev) => prev.slice(0, -1));

        // Update Firebase
        if (previousState.gameId) {
            const gameRef = ref(db, `games/${previousState.gameId}`);
            set(gameRef, previousState);
        }
    }, [undoStack]);

    const startGame = async (team1Id: string, team2Id: string, team2Name: string, gameTarget: number, initialPossession: string, advancedTracking: boolean = false, sotgEnabled: boolean = false) => {
        const newGameRef = push(ref(db, 'games'));
        const newGameId = newGameRef.key;

        if (!newGameId) return null;

        const initialState: GameState = {
            ...INITIAL_GAME_STATE,
            gameId: newGameId,
            team1Id,
            team2Id,
            team2Name,
            possession: initialPossession,
            firstHalfPossession: initialPossession,
            gameTarget,
            isGameActive: true,
            advancedTracking,
            sotgEnabled
        };

        await set(newGameRef, initialState);
        setGameState(initialState);
        
        // Mark teams as active. 
        // We only set this for the main team because Opponent teams might be completely temporary Guest names
        TeamService.setActiveGame(team1Id, newGameId);
        if (team2Id) {
            TeamService.setActiveGame(team2Id, newGameId);
        }

        return newGameId;
    };

    const endGame = async (gameId: string, sotgScore?: any) => {
        const gameRef = ref(db, `games/${gameId}`);
        const updates: any = { isGameActive: false };
        if (sotgScore) updates.sotgScore = sotgScore;
        await update(gameRef, updates);
        
        // Save to Team's pastGames node
        if (gameState.team1Id) {
            await set(ref(db, `teams/${gameState.team1Id}/pastGames/${gameId}`), true);
            TeamService.setActiveGame(gameState.team1Id, null);
        }
        if (gameState.team2Id) {
            await set(ref(db, `teams/${gameState.team2Id}/pastGames/${gameId}`), true);
            TeamService.setActiveGame(gameState.team2Id, null);
        }
    };

    return {
        gameState,
        recordEvent,
        undo,
        canUndo: undoStack.length > 0,
        startGame,
        endGame
    };
};
