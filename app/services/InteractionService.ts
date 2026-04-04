import { onValue, push, ref, set, get, update, runTransaction } from 'firebase/database';
import { db } from '../../firebaseConfig';
import { SpectatorReaction, PredictionSnapshot } from './types';

export const InteractionService = {
    // --- EMOJI REACTIONS ---
    // Store under games/ path which already has write permissions
    sendReaction: async (gameId: string, emoji: string, userId: string) => {
        try {
            const reactionRef = push(ref(db, `games/${gameId}/reactions`));
            const reaction: SpectatorReaction = {
                id: reactionRef.key || Date.now().toString(),
                emoji,
                userId,
                timestamp: Date.now(),
            };
            await set(reactionRef, reaction);
            
            // Auto-cleanup: remove reaction after 10 seconds
            setTimeout(async () => {
                try { await set(reactionRef, null); } catch (_) { /* ignore */ }
            }, 10000);
        } catch (e) {
            // Silently fail — reactions are non-critical
            console.warn('Reaction send failed:', e);
        }
    },

    subscribeToReactions: (gameId: string, callback: (reactions: SpectatorReaction[]) => void) => {
        const reactionsRef = ref(db, `games/${gameId}/reactions`);
        return onValue(reactionsRef, (snapshot) => {
            const data = snapshot.val();
            if (!data) { callback([]); return; }
            const reactions = Object.values(data) as SpectatorReaction[];
            // Only show reactions from the last 8 seconds
            const cutoff = Date.now() - 8000;
            callback(reactions.filter(r => r.timestamp > cutoff));
        });
    },

    // --- LIVE PREDICTIONS ---
    castVote: async (gameId: string, userId: string, votedTeamId: string, team1Id: string, team2Id: string) => {
        const predRef = ref(db, `games/${gameId}/predictions`);
        const snap = await get(predRef);
        const current = snap.val() || { team1Votes: 0, team2Votes: 0, voters: {} };

        // Check if user already voted
        const previousVote = current.voters?.[userId];
        if (previousVote === votedTeamId) return; // No change

        // Adjust counts
        if (previousVote) {
            // Switching vote
            if (previousVote === team1Id) { current.team1Votes = Math.max(0, current.team1Votes - 1); }
            else { current.team2Votes = Math.max(0, current.team2Votes - 1); }
        }
        if (votedTeamId === team1Id) { current.team1Votes += 1; }
        else { current.team2Votes += 1; }

        current.voters = { ...current.voters, [userId]: votedTeamId };
        await set(predRef, current);
    },

    // Save a prediction snapshot for the replay chart
    savePredictionSnapshot: async (gameId: string, score1: number, score2: number, gameStartTimestamp: number) => {
        const predRef = ref(db, `games/${gameId}/predictions`);
        const snap = await get(predRef);
        if (!snap.exists()) return;
        
        const current = snap.val();
        const totalVotes = (current.team1Votes || 0) + (current.team2Votes || 0);
        if (totalVotes < 3) return; // Only snapshot if at least 3 voters

        const snapshot: PredictionSnapshot = {
            timestamp: Date.now(),
            gameElapsedSec: gameStartTimestamp > 0 ? Math.floor((Date.now() - gameStartTimestamp) / 1000) : 0,
            team1Pct: totalVotes > 0 ? Math.round((current.team1Votes / totalVotes) * 100) : 50,
            team2Pct: totalVotes > 0 ? Math.round((current.team2Votes / totalVotes) * 100) : 50,
            totalVotes,
            score1,
            score2,
        };

        const snapshots = current.snapshots || [];
        snapshots.push(snapshot);
        await update(predRef, { snapshots });
    },
};
