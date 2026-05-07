import { get, onValue, push, ref, set, update } from 'firebase/database';
import { useCallback, useEffect, useState } from 'react';
import { auth, db } from '../../firebaseConfig';
import { GameLogic } from '../services/GameLogic';
import { InteractionService } from '../services/InteractionService';
import { TeamService, sanitizeForFirebase } from '../services/TeamService';
import { TournamentService } from '../services/TournamentService';
import { NotificationService } from '../services/NotificationService';
import { EventType, GameEvent, GameState, INITIAL_GAME_STATE, Player, isRealTeamId } from '../services/types';

type TournamentRecordingContext = {
    tournamentId: string;
    matchId: string;
    participantId?: string;
    slot?: 'A' | 'B';
};

type GameClockConfig = {
    gameFormat?: '7v7' | '5v5' | 'custom';
    softCapMinutes?: number;
    hardCapMinutes?: number;
    timeoutDurationSec?: number;
};

type GameRecordingConfig = {
    recordingMode?: 'team' | 'observer';
    opponentRosterSnapshot?: Record<string, Pick<Player, 'id' | 'name' | 'number' | 'teamId' | 'primaryLine' | 'position'>>;
};

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
                ...(prevState.delegatedRecorderUid && prevState.delegatedRecorderUid === auth.currentUser?.uid ? { is_verified: false } : {}),
                ...cleanDetails
            };

            // 3. Calculate New State
            const newState = GameLogic.applyEvent(prevState, newEvent);

            // 4. Persist to Firebase — full-document `set` + sanitize so nested arrays/objects stay consistent for other clients.
            if (prevState.gameId) {
                const gameRef = ref(db, `games/${prevState.gameId}`);
                set(gameRef, sanitizeForFirebase(newState));
            }

            // 5. Save prediction snapshot on scoring events (for the replay prediction chart)
            if (type === 'G' || type === 'Goal' || type === 'Opponent Score' || type === 'Callahan_US' || type === 'Callahan_THEM') {
                InteractionService.savePredictionSnapshot(
                    prevState.gameId,
                    newState.score1,
                    newState.score2,
                    prevState.gameStartTimestamp || 0
                ).catch(() => { /* non-critical */ });

                // Push Notification Fanout (Free Client-Side)
                const scoredTeamId = newState.score1 > (prevState.score1 || 0) ? newState.team1Id : newState.score2 > (prevState.score2 || 0) ? newState.team2Id : null;
                const scorerName = newState.score1 > (prevState.score1 || 0) ? (newState.team1Name || 'Our Team') : (newState.team2Name || 'Opponent');
                if (scoredTeamId) {
                    NotificationService.dispatchScoreUpdateNotification(
                        prevState.gameId, 
                        scoredTeamId, 
                        newState.score1 || 0, 
                        newState.score2 || 0, 
                        scorerName
                    ).catch(() => {});
                }
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
            set(gameRef, sanitizeForFirebase(previousState));
        }
    }, [undoStack]);

    const startGame = async (
        team1Id: string,
        team2Id: string,
        team2Name: string,
        gameLocation: string,
        gameTarget: number,
        initialPossession: string,
        advancedTracking: boolean = false,
        sotgEnabled: boolean = false,
        streamUrl: string = '',
        fieldMapEnabled: boolean = false,
        recorderId?: string,
        tournamentContext?: TournamentRecordingContext,
        initialLineupPlayerIds: string[] = [],
        clockConfig: GameClockConfig = {},
        recordingConfig: GameRecordingConfig = {},
    ) => {
        const newGameRef = push(ref(db, 'games'));
        const newGameId = newGameRef.key;

        if (!newGameId) return null;

        // Generate a 4-digit PIN for bench hand-off
        const recorderPin = Math.floor(1000 + Math.random() * 9000).toString();

        const lineupLimit = clockConfig.gameFormat === '5v5' ? 5 : 7;

        const initialState: GameState = {
            ...INITIAL_GAME_STATE,
            gameId: newGameId,
            team1Id,
            team2Id,
            team2Name,
            recordingMode: recordingConfig.recordingMode || 'team',
            trackedTeamIds: recordingConfig.recordingMode === 'observer' ? [team1Id, team2Id].filter(isRealTeamId) : [team1Id],
            ...(recordingConfig.opponentRosterSnapshot ? { opponentRosterSnapshot: recordingConfig.opponentRosterSnapshot } : {}),
            gameLocation,
            possession: initialPossession,
            firstHalfPossession: initialPossession,
            gameTarget,
            gameFormat: clockConfig.gameFormat || '7v7',
            softCapMinutes: clockConfig.softCapMinutes,
            hardCapMinutes: clockConfig.hardCapMinutes,
            timeoutDurationSec: clockConfig.timeoutDurationSec || 70,
            isGameActive: true,
            advancedTracking,
            fieldMapEnabled,
            sotgEnabled,
            streamUrl,
            gameStartTimestamp: Date.now(),
            currentRecorderId: recorderId || '',
            recorderPin,
            currentLineupPlayerIds: initialLineupPlayerIds.slice(0, lineupLimit),
            currentPointNumber: 1,
            pointLineups: initialLineupPlayerIds.length > 0 ? {
                '1': {
                    pointNumber: 1,
                    lineType: initialPossession === team1Id ? 'O' : 'D',
                    playerIds: initialLineupPlayerIds.slice(0, lineupLimit),
                    startedAt: Date.now(),
                },
            } : {},
            ...(tournamentContext?.tournamentId ? { tournamentId: tournamentContext.tournamentId } : {}),
            ...(tournamentContext?.matchId ? { tournamentMatchId: tournamentContext.matchId } : {}),
            ...(tournamentContext?.participantId ? { tournamentParticipantId: tournamentContext.participantId } : {}),
            recordingPerspective: tournamentContext?.slot || 'standalone',
        };

        await set(newGameRef, initialState);
        setGameState(initialState);
        
        // Mark teams as active
        TeamService.setActiveGame(team1Id, newGameId);
        await set(ref(db, `teamGameLinks/${team1Id}/${newGameId}`), {
            gameId: newGameId,
            teamId: team1Id,
            opponentTeamId: isRealTeamId(team2Id) ? team2Id : '',
            status: 'active',
            createdAt: Date.now(),
            source: tournamentContext?.tournamentId ? 'tournament' : 'primary',
        });
        if (isRealTeamId(team2Id)) {
            await set(ref(db, `teamGameLinks/${team2Id}/${newGameId}`), {
                gameId: newGameId,
                teamId: team2Id,
                opponentTeamId: team1Id,
                status: 'active',
                createdAt: Date.now(),
                source: tournamentContext?.tournamentId ? 'tournament' : 'opponent',
            });
        }

        if (tournamentContext?.tournamentId && tournamentContext.matchId && tournamentContext.slot) {
            await TournamentService.linkGameToMatch(
                tournamentContext.tournamentId,
                tournamentContext.matchId,
                newGameId,
                tournamentContext.slot
            );
        }

        NotificationService.dispatchGameStartNotification(
            newGameId,
            team1Id,
            team2Id,
            'Your Team',
            team2Name || 'Opponent'
        ).catch(() => {});

        return newGameId;
    };

    const endGame = async (gameId: string, sotgScore?: any) => {
        const gameRef = ref(db, `games/${gameId}`);
        const snap = await get(gameRef);
        const remote = snap.exists() ? (snap.val() as GameState) : null;
        const g = remote?.gameId ? remote : gameState;

        const verifiedHistory = (g.history || []).map((event) => ({ ...event, is_verified: true }));
        const updates: any = { isGameActive: false, history: verifiedHistory, recordingLockOwner: 'coach', delegatedRecorderUid: null, delegatedRecordingScope: null, activeObserverSessionPin: null };
        if (sotgScore) updates.sotgScore = sotgScore;
        await update(gameRef, updates);

        const isNeutralObserver = g.recordingSource === 'observer_neutral';

        // Save to Team's pastGames node — coach-recorded primary games only (not neutral observer drafts).
        if (!isNeutralObserver && g.team1Id) {
            await set(ref(db, `teams/${g.team1Id}/pastGames/${gameId}`), true);
            await set(ref(db, `teamGameLinks/${g.team1Id}/${gameId}/status`), 'final');
            await set(ref(db, `teamGameLinks/${g.team1Id}/${gameId}/completedAt`), Date.now());
            TeamService.setActiveGame(g.team1Id, null);
        }

        if (isRealTeamId(g.team2Id)) {
            await set(ref(db, `teamGameLinks/${g.team2Id}/${gameId}/status`), 'final');
            await set(ref(db, `teamGameLinks/${g.team2Id}/${gameId}/completedAt`), Date.now());
        }

        if (g.tournamentId && g.tournamentMatchId && g.tournamentParticipantId) {
            await TournamentService.submitMatchScoreFromGame(
                g.tournamentId,
                g.tournamentMatchId,
                gameId,
                g.tournamentParticipantId
            ).catch(() => { /* Tournament submission should not block match history. */ });
        }
    };

    const updateStreamUrl = async (streamUrl: string) => {
        if (!gameState.gameId) return;
        const gameRef = ref(db, `games/${gameState.gameId}`);
        await update(gameRef, { streamUrl: streamUrl.trim() });
    };

    // Hand-off recording to another user
    const handOffRecording = async (newRecorderId: string) => {
        if (!gameState.gameId) return;
        const gameRef = ref(db, `games/${gameState.gameId}`);
        await update(gameRef, { currentRecorderId: newRecorderId });
    };

    const overrideRecordingControl = async (coachUid: string) => {
        if (!gameState.gameId) return;
        const gameRef = ref(db, `games/${gameState.gameId}`);
        const pin = gameState.activeObserverSessionPin;
        await update(gameRef, {
            currentRecorderId: coachUid,
            delegatedRecorderUid: null,
            delegatedRecordingScope: null,
            recordingLockOwner: 'coach',
            activeObserverSessionPin: null,
        });
        if (pin) {
            await update(ref(db, `gameObserverSessions/${gameState.gameId}/${pin}`), { status: 'revoked' }).catch(() => {});
            await update(ref(db, `observerSessionPins/${pin}`), { status: 'revoked' }).catch(() => {});
        }
    };

    return {
        gameState,
        recordEvent,
        undo,
        canUndo: undoStack.length > 0,
        startGame,
        endGame,
        updateStreamUrl,
        handOffRecording,
        overrideRecordingControl,
    };
};
