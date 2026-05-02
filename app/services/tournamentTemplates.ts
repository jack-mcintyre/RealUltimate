// Pre-built tournament templates based on USAU tournament formats
export interface TournamentTemplate {
    id: string;
    name: string;
    description: string;
    icon: string; // Ionicons name
    color: string;
    config: {
        engine: 'single_elim' | 'pool_to_bracket';
        includeConsolation: boolean;
        poolCount?: number;
        poolSize?: number;
        qualifiersPerPool?: number;
        poolFormat?: 'round_robin' | 'partial';
        bracketFormat?: 'single_elim' | 'double_elim';
        includeThirdPlace?: boolean;
        crossoverEnabled?: boolean;
        hardCapScore?: number;
        softCapTimeMinutes?: number;
        timeoutsPerHalf?: number;
        scheduleDays?: number;
    };
}

export const TOURNAMENT_TEMPLATES: TournamentTemplate[] = [
    {
        id: 'single_8',
        name: '8-Team Single Elim',
        description: 'Quick knockout bracket. No pool play.',
        icon: 'flash',
        color: '#FF9500',
        config: {
            engine: 'single_elim',
            includeConsolation: false,
            bracketFormat: 'single_elim',
            hardCapScore: 15,
            softCapTimeMinutes: 75,
            timeoutsPerHalf: 2,
            scheduleDays: 1,
        },
    },
    {
        id: 'pool_8',
        name: '8-Team Pools → Bracket',
        description: '2 pools of 4, top 2 advance to single-elimination.',
        icon: 'grid',
        color: '#34C759',
        config: {
            engine: 'pool_to_bracket',
            includeConsolation: true,
            poolCount: 2,
            poolSize: 4,
            qualifiersPerPool: 2,
            poolFormat: 'round_robin',
            bracketFormat: 'single_elim',
            hardCapScore: 15,
            softCapTimeMinutes: 90,
            timeoutsPerHalf: 2,
            scheduleDays: 2,
        },
    },
    {
        id: 'usau_16',
        name: '16-Team USAU Standard',
        description: '4 pools of 4, top 2 advance. Championship + consolation. The gold standard format.',
        icon: 'trophy',
        color: '#AF52DE',
        config: {
            engine: 'pool_to_bracket',
            includeConsolation: true,
            poolCount: 4,
            poolSize: 4,
            qualifiersPerPool: 2,
            poolFormat: 'round_robin',
            bracketFormat: 'single_elim',
            includeThirdPlace: true,
            crossoverEnabled: true,
            hardCapScore: 15,
            softCapTimeMinutes: 90,
            timeoutsPerHalf: 2,
            scheduleDays: 2,
        },
    },
    {
        id: 'pool_12',
        name: '12-Team 3-Pool',
        description: '3 pools of 4. Top 2 + 2 wildcards advance to bracket.',
        icon: 'people',
        color: '#007AFF',
        config: {
            engine: 'pool_to_bracket',
            includeConsolation: true,
            poolCount: 3,
            poolSize: 4,
            qualifiersPerPool: 2,
            poolFormat: 'round_robin',
            bracketFormat: 'single_elim',
            crossoverEnabled: true,
            hardCapScore: 15,
            softCapTimeMinutes: 90,
            timeoutsPerHalf: 2,
            scheduleDays: 2,
        },
    },
    {
        id: 'casual_round_robin',
        name: 'Casual Round Robin',
        description: 'Every team plays every other team. No bracket — standings determine the winner.',
        icon: 'sync',
        color: '#FF2D55',
        config: {
            engine: 'pool_to_bracket',
            includeConsolation: false,
            poolCount: 1,
            qualifiersPerPool: 0,
            poolFormat: 'round_robin',
            hardCapScore: 13,
            softCapTimeMinutes: 60,
            timeoutsPerHalf: 1,
            scheduleDays: 1,
        },
    },
    {
        id: 'custom',
        name: 'Custom',
        description: 'Start from scratch and configure everything manually.',
        icon: 'build',
        color: '#8E8E93',
        config: {
            engine: 'pool_to_bracket',
            includeConsolation: true,
        },
    },
];
