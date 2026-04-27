import { get, onValue, push, ref, set, update } from 'firebase/database';
import { db } from '../../firebaseConfig';
import {
    Tournament,
    TournamentEngine,
    TournamentEnrollmentMode,
    TournamentMatch,
    TournamentParticipant,
    TournamentPrivacy,
    TournamentSeeding,
    TournamentSpiritScore,
    TournamentStage,
    TournamentStanding,
    TournamentStatus,
} from './types';

type ParticipantDraft = {
    name: string;
    rating?: number;
    linkedTeamId?: string;
};

type CreateTournamentDraft = {
    name: string;
    privacy: TournamentPrivacy;
    enrollmentMode: TournamentEnrollmentMode;
    engine: TournamentEngine;
    seeding: TournamentSeeding;
    includeConsolation: boolean;
    participants: ParticipantDraft[];
};

export type TournamentDirectoryItem = {
    tournamentId: string;
    teamId?: string;
    teamName?: string;
    name: string;
    status: TournamentStatus;
    engine: TournamentEngine;
    enrollmentMode: TournamentEnrollmentMode;
    participantCount: number;
    createdAt: number;
};

const codeChars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const normalizeName = (value: string) => value.trim().replace(/\s+/g, ' ');
const clampScore = (value: number) => Math.max(0, Math.min(50, Math.floor(value)));

const sanitizeForFirebase = (value: unknown): unknown => {
    if (value === undefined) return null;
    if (value === null) return null;

    if (Array.isArray(value)) {
        return value.map((item) => sanitizeForFirebase(item));
    }

    if (typeof value === 'object') {
        const out: Record<string, unknown> = {};
        Object.entries(value as Record<string, unknown>).forEach(([key, nested]) => {
            if (nested === undefined) return;
            out[key] = sanitizeForFirebase(nested);
        });
        return out;
    }

    return value;
};

const nextPowerOfTwo = (value: number) => {
    let power = 1;
    while (power < value) power *= 2;
    return power;
};

const generateCode = () => {
    let code = '';
    for (let i = 0; i < 6; i += 1) {
        code += codeChars[Math.floor(Math.random() * codeChars.length)];
    }
    return code;
};

const generateUniqueTournamentCode = async () => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
        const candidate = generateCode();
        const exists = await get(ref(db, `tournamentCodes/${candidate}`));
        if (!exists.exists()) {
            return candidate;
        }
    }

    throw new Error('Unable to generate a unique tournament code. Please try again.');
};

const shuffled = <T,>(items: T[]): T[] => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
};

const makeParticipantId = (index: number) => `p_${index + 1}`;

const buildParticipants = (drafts: ParticipantDraft[], seeding: TournamentSeeding) => {
    const cleaned = drafts
        .map((item) => ({
            name: normalizeName(item.name),
            rating: typeof item.rating === 'number' ? item.rating : undefined,
            linkedTeamId: item.linkedTeamId,
        }))
        .filter((item) => item.name.length > 0);

    const uniqueByName = new Map<string, ParticipantDraft>();
    cleaned.forEach((item) => {
        const key = item.name.toLowerCase();
        if (!uniqueByName.has(key)) {
            uniqueByName.set(key, item);
        }
    });

    let ordered = Array.from(uniqueByName.values());
    if (seeding === 'random') {
        ordered = shuffled(ordered);
    } else if (seeding === 'rating') {
        ordered = ordered.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    }

    const record: Record<string, TournamentParticipant> = {};
    ordered.forEach((item, index) => {
        const id = makeParticipantId(index);
        record[id] = {
            id,
            name: item.name,
            seed: index + 1,
            ...(typeof item.rating === 'number' ? { rating: item.rating } : {}),
            ...(item.linkedTeamId ? { linkedTeamId: item.linkedTeamId } : {}),
        };
    });

    return record;
};

const sortedParticipants = (participants: Record<string, TournamentParticipant>) => {
    return Object.values(participants)
        .sort((a, b) => a.seed - b.seed)
        .map((participant) => participant.id);
};

const buildEliminationTree = (
    stage: TournamentStage,
    roundOnePairs: [string, string][],
    idPrefix: string
): Record<string, TournamentMatch> => {
    const matches: Record<string, TournamentMatch> = {};
    const rounds: string[][] = [];

    rounds[0] = roundOnePairs.map((_, index) => `${idPrefix}_r1_m${index + 1}`);

    roundOnePairs.forEach((pair, index) => {
        const id = rounds[0][index];
        matches[id] = {
            id,
            stage,
            round: 1,
            teamAId: pair[0],
            teamBId: pair[1],
        };
    });

    let currentCount = rounds[0].length;
    let round = 2;
    while (currentCount > 1) {
        const nextCount = Math.ceil(currentCount / 2);
        rounds[round - 1] = Array.from({ length: nextCount }, (_, index) => `${idPrefix}_r${round}_m${index + 1}`);

        rounds[round - 1].forEach((id) => {
            matches[id] = {
                id,
                stage,
                round,
                teamAId: '',
                teamBId: '',
            };
        });

        currentCount = nextCount;
        round += 1;
    }

    rounds.forEach((ids, roundIndex) => {
        if (roundIndex === rounds.length - 1) return;
        ids.forEach((matchId, index) => {
            const nextMatchId = rounds[roundIndex + 1][Math.floor(index / 2)];
            matches[matchId].nextMatchId = nextMatchId;
            matches[matchId].nextSlot = index % 2 === 0 ? 'A' : 'B';
        });
    });

    return matches;
};

const buildSingleElim = (
    participantIds: string[],
    includeConsolation: boolean
): { matches: Record<string, TournamentMatch> } => {
    const teamCount = Math.max(2, participantIds.length);
    const bracketSize = nextPowerOfTwo(teamCount);
    const padded = [...participantIds];
    while (padded.length < bracketSize) padded.push('BYE');

    const roundOnePairs: [string, string][] = [];
    const half = bracketSize / 2;
    for (let i = 0; i < half; i += 1) {
        roundOnePairs.push([padded[i], padded[bracketSize - 1 - i]]);
    }

    const championshipMatches = buildEliminationTree('championship', roundOnePairs, 'champ');

    if (!includeConsolation) {
        return { matches: championshipMatches };
    }

    const firstRoundCount = roundOnePairs.length;
    const consolationEntrants = Math.max(2, firstRoundCount);
    const consolationRoundOnePairs = Array.from({ length: Math.ceil(consolationEntrants / 2) }, () => ['', ''] as [string, string]);
    const consolationMatches = buildEliminationTree('consolation', consolationRoundOnePairs, 'cons');

    const champRoundOne = Object.values(championshipMatches)
        .filter((match) => match.round === 1)
        .sort((a, b) => a.id.localeCompare(b.id));
    const consRoundOne = Object.values(consolationMatches)
        .filter((match) => match.round === 1)
        .sort((a, b) => a.id.localeCompare(b.id));

    champRoundOne.forEach((match, index) => {
        const target = consRoundOne[Math.floor(index / 2)];
        if (!target) return;
        match.consolationNextMatchId = target.id;
        match.consolationNextSlot = index % 2 === 0 ? 'A' : 'B';
    });

    return { matches: { ...championshipMatches, ...consolationMatches } };
};

const distributePools = (participantIds: string[]) => {
    const poolCount = participantIds.length >= 8 ? 2 : 1;
    const groups = poolCount === 2 ? ['A', 'B'] : ['A'];
    const pools: Record<string, string[]> = {};
    groups.forEach((group) => {
        pools[group] = [];
    });

    if (poolCount === 1) {
        pools.A = [...participantIds];
        return pools;
    }

    participantIds.forEach((id, index) => {
        const bucket = index % 4;
        const group = bucket === 0 || bucket === 3 ? 'A' : 'B';
        pools[group].push(id);
    });

    return pools;
};

const buildPoolToBracket = (
    participantIds: string[],
    includeConsolation: boolean
): { pools: Record<string, string[]>; qualifierCount: number; matches: Record<string, TournamentMatch> } => {
    const pools = distributePools(participantIds);
    const matches: Record<string, TournamentMatch> = {};

    Object.entries(pools).forEach(([group, ids]) => {
        const teams = [...ids];
        if (teams.length % 2 !== 0) teams.push('BYE');
        const numRounds = teams.length - 1;
        const half = teams.length / 2;

        for (let r = 0; r < numRounds; r += 1) {
            for (let i = 0; i < half; i += 1) {
                const teamA = teams[i];
                const teamB = teams[teams.length - 1 - i];
                if (teamA !== 'BYE' && teamB !== 'BYE') {
                    const id = `pool_${group}_r${r+1}_m${i+1}`;
                    matches[id] = {
                        id,
                        stage: 'pool',
                        round: r + 1,
                        group,
                        teamAId: teamA,
                        teamBId: teamB,
                    };
                }
            }
            teams.splice(1, 0, teams.pop() as string);
        }
    });

    let qualifierCount = 2;
    if (participantIds.length >= 10) qualifierCount = 8;
    else if (participantIds.length >= 6) qualifierCount = 4;
    else if (participantIds.length >= 4) qualifierCount = 2;

    qualifierCount = Math.min(qualifierCount, participantIds.length);

    const bracketSize = nextPowerOfTwo(Math.max(2, qualifierCount));
    const roundOnePairs = Array.from({ length: bracketSize / 2 }, () => ['', ''] as [string, string]);
    const championship = buildEliminationTree('championship', roundOnePairs, 'champ');

    let consolation: Record<string, TournamentMatch> = {};
    const nonQualifierCount = Math.max(0, participantIds.length - qualifierCount);
    if (includeConsolation && nonQualifierCount >= 2) {
        const consolationSize = nextPowerOfTwo(nonQualifierCount);
        const consolationRoundOne = Array.from({ length: consolationSize / 2 }, () => ['', ''] as [string, string]);
        consolation = buildEliminationTree('consolation', consolationRoundOne, 'cons');
    }

    return {
        pools,
        qualifierCount,
        matches: {
            ...matches,
            ...championship,
            ...consolation,
        },
    };
};

const getStageMatchesByRound = (matches: Record<string, TournamentMatch>, stage: TournamentStage) => {
    const map = new Map<number, TournamentMatch[]>();
    Object.values(matches)
        .filter((match) => match.stage === stage)
        .forEach((match) => {
            const list = map.get(match.round) || [];
            list.push(match);
            map.set(match.round, list);
        });

    return Array.from(map.entries())
        .sort((a, b) => a[0] - b[0])
        .map((entry) => ({
            round: entry[0],
            matches: entry[1].sort((a, b) => a.id.localeCompare(b.id)),
        }));
};

const assignSlot = (
    targetMatch: TournamentMatch,
    slot: 'A' | 'B',
    participantId: string
) => {
    if (slot === 'A') {
        if (targetMatch.teamAId !== participantId) {
            targetMatch.teamAId = participantId;
            targetMatch.teamAScore = undefined;
            targetMatch.teamBScore = undefined;
            targetMatch.winnerId = undefined;
            targetMatch.loserId = undefined;
        }
        return;
    }

    if (targetMatch.teamBId !== participantId) {
        targetMatch.teamBId = participantId;
        targetMatch.teamAScore = undefined;
        targetMatch.teamBScore = undefined;
        targetMatch.winnerId = undefined;
        targetMatch.loserId = undefined;
    }
};

const resolveMatchWinner = (match: TournamentMatch) => {
    const teamA = match.teamAId;
    const teamB = match.teamBId;

    if (teamA && teamA !== 'BYE' && (!teamB || teamB === 'BYE')) {
        return { winnerId: teamA, loserId: teamB || '' };
    }
    if (teamB && teamB !== 'BYE' && (!teamA || teamA === 'BYE')) {
        return { winnerId: teamB, loserId: teamA || '' };
    }

    if (!teamA || !teamB || teamA === 'BYE' || teamB === 'BYE') {
        return { winnerId: '', loserId: '' };
    }

    if (typeof match.teamAScore !== 'number' || typeof match.teamBScore !== 'number') {
        return { winnerId: '', loserId: '' };
    }

    if (match.teamAScore === match.teamBScore) {
        return { winnerId: '', loserId: '' };
    }

    if (match.teamAScore > match.teamBScore) {
        return { winnerId: teamA, loserId: teamB };
    }

    return { winnerId: teamB, loserId: teamA };
};

const recomputePoolStandings = (tournament: Tournament) => {
    const pools = tournament.pools || {};
    const participantMap = tournament.participants || {};
    const poolMatches = Object.values(tournament.matches).filter((match) => match.stage === 'pool');

    const standingsByPool: Record<string, TournamentStanding[]> = {};

    Object.entries(pools).forEach(([group, participantIds]) => {
        const stats = new Map<string, Omit<TournamentStanding, 'rank'>>();
        participantIds.forEach((participantId) => {
            stats.set(participantId, {
                participantId,
                wins: 0,
                losses: 0,
                pointsFor: 0,
                pointsAgainst: 0,
                pointDiff: 0,
            });
        });

        const groupMatches = poolMatches.filter((match) => match.group === group);
        groupMatches.forEach((match) => {
            const a = stats.get(match.teamAId);
            const b = stats.get(match.teamBId);
            if (!a || !b) return;
            if (typeof match.teamAScore !== 'number' || typeof match.teamBScore !== 'number') return;

            a.pointsFor += match.teamAScore;
            a.pointsAgainst += match.teamBScore;
            a.pointDiff = a.pointsFor - a.pointsAgainst;

            b.pointsFor += match.teamBScore;
            b.pointsAgainst += match.teamAScore;
            b.pointDiff = b.pointsFor - b.pointsAgainst;

            if (match.teamAScore > match.teamBScore) {
                a.wins += 1;
                b.losses += 1;
            } else if (match.teamBScore > match.teamAScore) {
                b.wins += 1;
                a.losses += 1;
            }
        });

        standingsByPool[group] = Array.from(stats.values())
            .sort((left, right) => {
                if (right.wins !== left.wins) return right.wins - left.wins;
                if (right.pointDiff !== left.pointDiff) return right.pointDiff - left.pointDiff;
                if (right.pointsFor !== left.pointsFor) return right.pointsFor - left.pointsFor;
                const leftSeed = participantMap[left.participantId]?.seed || 999;
                const rightSeed = participantMap[right.participantId]?.seed || 999;
                return leftSeed - rightSeed;
            })
            .map((item, index) => ({ ...item, rank: index + 1 }));
    });

    const standingsRecord: Record<string, TournamentStanding> = {};
    let globalRank = 1;

    Object.keys(standingsByPool)
        .sort()
        .forEach((group) => {
            standingsByPool[group].forEach((row) => {
                standingsRecord[row.participantId] = {
                    ...row,
                    rank: globalRank,
                };
                globalRank += 1;
            });
        });

    return {
        standingsRecord,
        standingsByPool,
    };
};




const pickQualifiers = (
    standingsByPool: Record<string, TournamentStanding[]>,
    qualifierCount: number,
    poolMatchesFinished: boolean
): string[] => {
    if (!poolMatchesFinished) return [];

    const groups = Object.keys(standingsByPool).sort();
    if (groups.length === 0) return [];

    if (groups.length === 1) {
        return standingsByPool[groups[0]].slice(0, qualifierCount).map((row) => row.participantId);
    }

    const qualifiers: string[] = [];
    let place = 0;
    while (qualifiers.length < qualifierCount) {
        for (let i = 0; i < groups.length; i += 1) {
            const row = standingsByPool[groups[i]][place];
            if (!row) continue;
            qualifiers.push(row.participantId);
            if (qualifiers.length === qualifierCount) break;
        }
        place += 1;
        if (place > 10) break;
    }

    return qualifiers;
};

const assignRoundOne = (
    roundOneMatches: TournamentMatch[],
    participantIds: string[]
) => {
    if (roundOneMatches.length === 0) return;

    const bracketSize = roundOneMatches.length * 2;
    const seeded = [...participantIds];
    while (seeded.length < bracketSize) seeded.push('BYE');

    roundOneMatches.forEach((match, index) => {
        match.teamAId = seeded[index] || '';
        match.teamBId = seeded[bracketSize - 1 - index] || '';
        match.teamAScore = undefined;
        match.teamBScore = undefined;
        match.winnerId = undefined;
        match.loserId = undefined;
    });
};

const resetDownstreamMatches = (matches: Record<string, TournamentMatch>, stage: TournamentStage) => {
    Object.values(matches)
        .filter((match) => match.stage === stage && match.round > 1)
        .forEach((match) => {
            match.teamAId = '';
            match.teamBId = '';
            match.teamAScore = undefined;
            match.teamBScore = undefined;
            match.winnerId = undefined;
            match.loserId = undefined;
        });
};

const propagateStage = (matches: Record<string, TournamentMatch>, stage: TournamentStage) => {
    const rounds = getStageMatchesByRound(matches, stage);
    rounds.forEach(({ matches: roundMatches }) => {
        roundMatches.forEach((match) => {
            const { winnerId, loserId } = resolveMatchWinner(match);
            match.winnerId = winnerId || undefined;
            match.loserId = loserId || undefined;

            if (winnerId && match.nextMatchId && match.nextSlot) {
                const next = matches[match.nextMatchId];
                if (next) assignSlot(next, match.nextSlot, winnerId);
            }

            if (stage === 'championship' && loserId && match.consolationNextMatchId && match.consolationNextSlot) {
                const consolation = matches[match.consolationNextMatchId];
                if (consolation) assignSlot(consolation, match.consolationNextSlot, loserId);
            }
        });
    });
};

const recomputeTournament = (tournament: Tournament): Tournament => {
    const matches: Record<string, TournamentMatch> = JSON.parse(JSON.stringify(tournament.matches || {}));
    const nextTournament: Tournament = {
        ...tournament,
        matches,
    };

    
    if (nextTournament.engine === 'pool_to_bracket') {
        const { standingsRecord, standingsByPool } = recomputePoolStandings(nextTournament);
        nextTournament.standings = standingsRecord;

        const poolMatches = Object.values(matches).filter(m => m.stage === 'pool');
        const poolMatchesFinished = poolMatches.length > 0 && poolMatches.every(m => m.winnerId);

        const championshipRoundOne = Object.values(matches)
            .filter((match) => match.stage === 'championship' && match.round === 1)
            .sort((a, b) => a.id.localeCompare(b.id));

        const qualifiers = pickQualifiers(standingsByPool, nextTournament.qualifierCount || championshipRoundOne.length * 2, poolMatchesFinished);
        
        if (poolMatchesFinished) {
            assignRoundOne(championshipRoundOne, qualifiers);
        }

        const consolationRoundOne = Object.values(matches)
            .filter((match) => match.stage === 'consolation' && match.round === 1)
            .sort((a, b) => a.id.localeCompare(b.id));

        if (consolationRoundOne.length > 0 && poolMatchesFinished) {

            const qualifierSet = new Set(qualifiers);
            const nonQualifiers = Object.keys(nextTournament.participants)
                .filter((participantId) => !qualifierSet.has(participantId))
                .sort((left, right) => {
                    const leftSeed = nextTournament.participants[left]?.seed || 999;
                    const rightSeed = nextTournament.participants[right]?.seed || 999;
                    return leftSeed - rightSeed;
                });
            assignRoundOne(consolationRoundOne, nonQualifiers);
        }
    }

    resetDownstreamMatches(matches, 'championship');
    resetDownstreamMatches(matches, 'consolation');

    propagateStage(matches, 'championship');
    propagateStage(matches, 'consolation');

    const championshipFinal = Object.values(matches)
        .filter((match) => match.stage === 'championship')
        .sort((a, b) => b.round - a.round || a.id.localeCompare(b.id))[0];

    if (championshipFinal?.winnerId) {
        nextTournament.status = 'completed';
    }

    return nextTournament;
};

const createSpiritScores = (participants: Record<string, TournamentParticipant>) => {
    const spirit: Record<string, TournamentSpiritScore> = {};
    Object.values(participants).forEach((participant) => {
        spirit[participant.id] = {
            participantId: participant.id,
            rules: 0,
            fouls: 0,
            fairness: 0,
            attitude: 0,
            communication: 0,
            total: 0,
        };
    });
    return spirit;
};

const tournamentsPath = () => `tournaments`;
const tournamentPath = (tournamentId: string) => `${tournamentsPath()}/${tournamentId}`;
const publicTournamentsPath = 'publicTournaments';
const tournamentCodesPath = 'tournamentCodes';

const toDirectoryItem = (tournament: Tournament): TournamentDirectoryItem => {
    return {
        tournamentId: tournament.id,
        teamId: tournament.teamId,
        teamName: tournament.teamName,
        name: tournament.name,
        status: tournament.status,
        engine: tournament.engine,
        enrollmentMode: tournament.enrollmentMode,
        participantCount: Object.keys(tournament.participants || {}).length,
        createdAt: tournament.createdAt,
    };
};

const buildTournamentIndexUpdates = (
    tournament: Tournament,
    options?: { allowPublicDelete?: boolean }
) => {
    const updates: Record<string, unknown> = {};

    if (tournament.privacy === 'public') {
        updates[`${publicTournamentsPath}/${tournament.id}`] = toDirectoryItem(tournament);
    } else if (options?.allowPublicDelete) {
        updates[`${publicTournamentsPath}/${tournament.id}`] = null;
    }

    if (tournament.adminCode) {
        updates[`${tournamentCodesPath}/${tournament.adminCode}`] = {
            tournamentId: tournament.id,
            createdAt: tournament.createdAt,
            role: 'admin',
        };
    }

    if (tournament.joinCode) {
        updates[`${tournamentCodesPath}/${tournament.joinCode}`] = {
            tournamentId: tournament.id,
            createdAt: tournament.createdAt,
            privacy: tournament.privacy,
            role: 'spectator',
        };
    }

    return updates;
};

export const TournamentService = {
    subscribeToMyTournaments: (
        userId: string,
        callback: (tournaments: Tournament[]) => void
    ) => {
        const tournamentsRef = ref(db, tournamentsPath());
        return onValue(tournamentsRef, (snapshot) => {
            const data = snapshot.val() || {};
            const tournaments = Object.entries(data)
                .map(([id, value]) => ({ ...(value as Tournament), id }))
                .filter(t => t.createdBy === userId || t.admins?.[userId])
                .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            callback(tournaments);
        });
    },

    subscribeToTournament: (
        tournamentId: string,
        callback: (tournament: Tournament | null) => void
    ) => {
        const tournamentRef = ref(db, tournamentPath(tournamentId));
        return onValue(tournamentRef, (snapshot) => {
            if (!snapshot.exists()) {
                callback(null);
                return;
            }
            callback({ ...(snapshot.val() as Tournament), id: tournamentId });
        });
    },

    subscribeToPublicTournaments: (
        callback: (items: TournamentDirectoryItem[]) => void
    ) => {
        const directoryRef = ref(db, publicTournamentsPath);
        return onValue(directoryRef, (snapshot) => {
            const data = snapshot.val() || {};
            const items = Object.entries(data)
                .map(([id, value]) => ({
                    id: id,
                    ...(value as TournamentDirectoryItem),
                }))
                .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            callback(items);
        });
    },

    resolveTournamentByCode: async (rawCode: string) => {
        const code = (rawCode || '').trim().toUpperCase();
        if (!/^[A-Z0-9]{6}$/.test(code)) {
            throw new Error('Tournament code must be 6 letters or numbers.');
        }

        const mappingRef = ref(db, `${tournamentCodesPath}/${code}`);
        const mappingSnap = await get(mappingRef);
        if (!mappingSnap.exists()) {
            return null;
        }

        const mapping = mappingSnap.val() as { tournamentId: string; role?: string };
        if (!mapping?.tournamentId) {
            return null;
        }

        const tournamentSnap = await get(ref(db, tournamentPath(mapping.tournamentId)));
        if (!tournamentSnap.exists()) {
            return null;
        }

        return {
            tournamentId: mapping.tournamentId,
            role: mapping.role || 'spectator',
            tournament: { ...(tournamentSnap.val() as Tournament), id: mapping.tournamentId },
        };
    },

    joinTournamentAsAdmin: async (adminCode: string, userId: string) => {
        const resolved = await TournamentService.resolveTournamentByCode(adminCode);
        if (!resolved || resolved.role !== 'admin') {
            throw new Error('Invalid or expired admin code.');
        }
        
        const adminRef = ref(db, `${tournamentPath(resolved.tournamentId)}/admins/${userId}`);
        await set(adminRef, true);
        return resolved.tournamentId;
    },

    createTournament: async (
        draft: CreateTournamentDraft,
        creatorId: string
    ): Promise<string> => {
        const tournamentName = normalizeName(draft.name);
        if (tournamentName.length < 3 || tournamentName.length > 80) {
            throw new Error('Tournament name must be 3 to 80 characters.');
        }

        const participants = buildParticipants(draft.participants, draft.seeding);
        const participantIds = sortedParticipants(participants);

        if (participantIds.length < 2) {
            throw new Error('Add at least 2 unique teams for a tournament.');
        }

        let matches: Record<string, TournamentMatch> = {};
        let pools: Record<string, string[]> | undefined;
        let qualifierCount: number | undefined;

        if (draft.engine === 'single_elim') {
            matches = buildSingleElim(participantIds, draft.includeConsolation).matches;
        } else {
            const built = buildPoolToBracket(participantIds, draft.includeConsolation);
            pools = built.pools;
            qualifierCount = built.qualifierCount;
            matches = built.matches;
        }

        const tournamentsRef = ref(db, tournamentsPath());
        const newRef = push(tournamentsRef);
        if (!newRef.key) {
            throw new Error('Could not create tournament ID.');
        }

        const adminCode = await generateUniqueTournamentCode();
        const joinCode = draft.privacy === 'private' ? await generateUniqueTournamentCode() : undefined;

        const tournament: Tournament = {
            id: newRef.key,
            name: tournamentName,
            privacy: draft.privacy,
            adminCode,
            admins: { [creatorId]: true },
            ...(joinCode ? { joinCode } : {}),
            enrollmentMode: draft.enrollmentMode,
            engine: draft.engine,
            seeding: draft.seeding,
            includeConsolation: draft.includeConsolation,
            status: 'draft',
            createdAt: Date.now(),
            createdBy: creatorId,
            participants,
            ...(pools ? { pools } : {}),
            ...(typeof qualifierCount === 'number' ? { qualifierCount } : {}),
            matches,
            standings: {},
            spiritScores: createSpiritScores(participants),
        };

        const normalized = recomputeTournament(tournament);
        const sanitizedTournament = sanitizeForFirebase(normalized) as Tournament;
        const updates: Record<string, unknown> = {
            [tournamentPath(newRef.key)]: sanitizedTournament,
            ...buildTournamentIndexUpdates(sanitizedTournament),
        };
        await update(ref(db), updates);
        return newRef.key;
    },

    updateMatchScore: async (
        tournamentId: string,
        matchId: string,
        teamAScore: number,
        teamBScore: number
    ) => {
        const tournamentRef = ref(db, tournamentPath(tournamentId));
        const snapshot = await get(tournamentRef);
        if (!snapshot.exists()) throw new Error('Tournament not found.');

        const tournament = { ...(snapshot.val() as Tournament), id: tournamentId };
        const target = tournament.matches?.[matchId];
        if (!target) throw new Error('Match not found.');

        target.teamAScore = clampScore(teamAScore);
        target.teamBScore = clampScore(teamBScore);

        const normalized = recomputeTournament(tournament);
        const sanitizedTournament = sanitizeForFirebase(normalized) as Tournament;
        const updates: Record<string, unknown> = {
            [tournamentPath(tournamentId)]: sanitizedTournament,
            ...buildTournamentIndexUpdates(sanitizedTournament),
        };
        await update(ref(db), updates);
    },

    updateStatus: async (
        tournamentId: string,
        status: TournamentStatus
    ) => {
        const tournamentRef = ref(db, tournamentPath(tournamentId));
        const snapshot = await get(tournamentRef);
        if (!snapshot.exists()) throw new Error('Tournament not found.');

        const tournament = { ...(snapshot.val() as Tournament), id: tournamentId, status };
        const sanitizedTournament = sanitizeForFirebase(tournament) as Tournament;
        const updates: Record<string, unknown> = {
            [tournamentPath(tournamentId)]: sanitizedTournament,
            ...buildTournamentIndexUpdates(sanitizedTournament),
        };

        await update(ref(db), updates);
    },

    updateSpiritScore: async (
        tournamentId: string,
        participantId: string,
        scores: {
            rules: number;
            fouls: number;
            fairness: number;
            attitude: number;
            communication: number;
        }
    ) => {
        const clampSpirit = (value: number) => Math.max(0, Math.min(5, Math.floor(value)));
        const rules = clampSpirit(scores.rules);
        const fouls = clampSpirit(scores.fouls);
        const fairness = clampSpirit(scores.fairness);
        const attitude = clampSpirit(scores.attitude);
        const communication = clampSpirit(scores.communication);
        const total = rules + fouls + fairness + attitude + communication;

        const spiritRef = ref(db, `${tournamentPath(tournamentId)}/spiritScores/${participantId}`);
        await set(spiritRef, {
            participantId,
            rules,
            fouls,
            fairness,
            attitude,
            communication,
            total,
        } as TournamentSpiritScore);
    },

    updateTournamentSettings: async (
        tournamentId: string,
        settings: {
            name?: string;
            startDate?: string;
            endDate?: string;
            enrollmentDeadline?: string;
            hostName?: string;
            privacy?: 'public' | 'private';
            enrollmentMode?: 'manual' | 'open';
        }
    ) => {
        const tournamentRef = ref(db, tournamentPath(tournamentId));
        const snapshot = await get(tournamentRef);
        if (!snapshot.exists()) throw new Error('Tournament not found.');

        const tournament = { ...(snapshot.val() as Tournament), id: tournamentId, ...settings };
        const sanitizedTournament = sanitizeForFirebase(tournament) as Tournament;
        const updates: Record<string, unknown> = {
            [tournamentPath(tournamentId)]: sanitizedTournament,
            ...buildTournamentIndexUpdates(sanitizedTournament, { allowPublicDelete: true }),
        };
        await update(ref(db), updates);
    },

    updateMatchScheduledTime: async (
        tournamentId: string,
        matchId: string,
        scheduledTime: string
    ) => {
        const matchRef = ref(db, `${tournamentPath(tournamentId)}/matches/${matchId}/scheduledTime`);
        await set(matchRef, scheduledTime || null);
    },

    addParticipant: async (
        tournamentId: string,
        participant: { name: string; linkedTeamId?: string }
    ) => {
        const tournamentRef = ref(db, tournamentPath(tournamentId));
        const snapshot = await get(tournamentRef);
        if (!snapshot.exists()) throw new Error('Tournament not found.');

        const tournament = snapshot.val() as Tournament;
        
        if (tournament.status !== 'draft') {
            throw new Error('Cannot add teams after the tournament has started generating matches.');
        }

        if (tournament.enrollmentDeadline && new Date().toISOString() > tournament.enrollmentDeadline) {
            throw new Error('The enrollment deadline has passed.');
        }

        const pId = `P_${generateId()}`;
        const newParticipant = {
            id: pId,
            name: participant.name,
            seed: Object.keys(tournament.participants || {}).length + 1,
            ...(participant.linkedTeamId ? { linkedTeamId: participant.linkedTeamId } : {}),
        };

        const participantRef = ref(db, `${tournamentPath(tournamentId)}/participants/${pId}`);
        await set(participantRef, newParticipant);
    },

    updateParticipant: async (
        tournamentId: string,
        participantId: string,
        name: string
    ) => {
        const participantRef = ref(db, `${tournamentPath(tournamentId)}/participants/${participantId}/name`);
        await set(participantRef, name);
    },

    removeParticipant: async (
        tournamentId: string,
        participantId: string
    ) => {
        const updates: Record<string, unknown> = {
            [`${tournamentPath(tournamentId)}/participants/${participantId}`]: null,
            [`${tournamentPath(tournamentId)}/standings/${participantId}`]: null,
            [`${tournamentPath(tournamentId)}/spirit/${participantId}`]: null,
        };
        await update(ref(db), updates);
    },

    startTournament: async (tournamentId: string) => {
        const tournamentRef = ref(db, tournamentPath(tournamentId));
        const snapshot = await get(tournamentRef);
        if (!snapshot.exists()) throw new Error('Tournament not found.');

        const tournament = snapshot.val() as Tournament;
        if (tournament.status !== 'draft') {
            throw new Error('Tournament already started.');
        }

        tournament.status = 'active';
        const nextTournament = recomputeTournament(tournament);

        const updates = {
            [tournamentPath(tournamentId)]: nextTournament,
            ...buildTournamentIndexUpdates(nextTournament, { allowPublicDelete: true }),
        };
        await update(ref(db), updates);
    },

    deleteTournament: async (tournamentId: string) => {
        const tournamentRef = ref(db, tournamentPath(tournamentId));
        const snapshot = await get(tournamentRef);
        if (!snapshot.exists()) return;
        const tournament = snapshot.val() as Tournament;

        const updates: Record<string, unknown> = {
            [tournamentPath(tournamentId)]: null,
        };

        if (tournament.privacy === 'public') {
            updates[`${publicTournamentsPath}/${tournamentId}`] = null;
        }
        if (tournament.adminCode) {
            updates[`${tournamentCodesPath}/${tournament.adminCode}`] = null;
        }
        if (tournament.joinCode) {
            updates[`${tournamentCodesPath}/${tournament.joinCode}`] = null;
        }

        await update(ref(db), updates);
    },
};

