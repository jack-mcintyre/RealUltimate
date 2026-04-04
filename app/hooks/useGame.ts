import { onValue, push, ref, set, update } from 'firebase/database';
import { useCallback, useEffect, useState } from 'react';
import { db } from '../../firebaseConfig';
import { GameLogic } from '../services/GameLogic';
import { TeamService } from '../services/TeamService';
import { InteractionService } from '../services/InteractionService';
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

            // Calculate game elapsed seconds for timestamp bookmarks
            const gameElapsedSec = prevState.gameStartTimestamp && prevState.gameStartTimestamp > 0
                ? Math.floor((Date.now() - prevState.gameStartTimestamp) / 1000)
                : 0;

            // 2. Create Event
            const newEvent: GameEvent = {
                id: Date.now().toString(),
                gameId: prevState.gameId,
                type,
                timestamp: Date.now(),
                teamId: prevState.possession,
                gameElapsedSec,
                ...cleanDetails
            };

            // 3. Calculate New State
            const newState = GameLogic.applyEvent(prevState, newEvent);

            // 4. Persist to Firebase 
            if (prevState.gameId) {
                const gameRef = ref(db, `games/${prevState.gameId}`);
                update(gameRef, newState);
            }

            // 5. Save prediction snapshot on scoring events (for the replay prediction chart)
            if (type === 'G' || type === 'Goal' || type === 'Opponent Score' || type === 'Callahan_US' || type === 'Callahan_THEM') {
                InteractionService.savePredictionSnapshot(
                    prevState.gameId,
                    newState.score1,
                    newState.score2,
                    prevState.gameStartTimestamp || 0
                ).catch(() => { /* non-critical */ });
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

    const startGame = async (
        team1Id: string,
        team2Id: string,
        team2Name: string,
        gameTarget: number,
        initialPossession: string,
        advancedTracking: boolean = false,
        sotgEnabled: boolean = false,
        streamUrl: string = '',
        fieldMapEnabled: boolean = false,
        recorderId?: string,
    ) => {
        const newGameRef = push(ref(db, 'games'));
        const newGameId = newGameRef.key;

        if (!newGameId) return null;

        // Generate a 4-digit PIN for bench hand-off
        const recorderPin = Math.floor(1000 + Math.random() * 9000).toString();

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
            fieldMapEnabled,
            sotgEnabled,
            streamUrl,
            gameStartTimestamp: Date.now(),
            currentRecorderId: recorderId || '',
            recorderPin,
        };

        await set(newGameRef, initialState);
        setGameState(initialState);
        
        // Mark teams as active
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

    // Hand-off recording to another user
    const handOffRecording = async (newRecorderId: string) => {
        if (!gameState.gameId) return;
        const gameRef = ref(db, `games/${gameState.gameId}`);
        await update(gameRef, { currentRecorderId: newRecorderId });
    };

    return {
        gameState,
        recordEvent,
        undo,
        canUndo: undoStack.length > 0,
        startGame,
        endGame,
        handOffRecording,
    };
};
