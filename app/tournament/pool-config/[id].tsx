import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, TextInput } from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TournamentService } from '../../services/TournamentService';
import { Tournament } from '../../services/types';
import { ThemeColors, useTheme } from '../../theme/ThemeContext';
import { getTypography, Layout } from '../../theme/DesignSystem';

export default function PoolConfigScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { colors } = useTheme();
    const styles = getStyles(colors);

    const [tournament, setTournament] = useState<Tournament | null>(null);
    const [poolCount, setPoolCount] = useState(2);
    const [poolSize, setPoolSize] = useState(4);
    const [qualifiersPerPool, setQualifiersPerPool] = useState(2);
    const [poolFormat, setPoolFormat] = useState<'round_robin' | 'partial'>('round_robin');

    useEffect(() => {
        if (!id) return;
        const unsub = TournamentService.subscribeToTournament(id, (data) => {
            if (data && !tournament) {
                setTournament(data);
                setPoolCount(data.poolCount || 2);
                setPoolSize(data.poolSize || 4);
                setQualifiersPerPool(data.qualifiersPerPool || 2);
                setPoolFormat(data.poolFormat || 'round_robin');
            } else if (data) {
                setTournament(data);
            }
        });
        return () => unsub();
    }, [id]);

    const handleSave = async () => {
        if (!tournament) return;
        try {
            await TournamentService.updatePoolConfig(tournament.id, { poolCount, poolSize, qualifiersPerPool, poolFormat });
            Alert.alert('Saved', 'Pool configuration updated.');
            router.back();
        } catch (e: any) {
            Alert.alert('Error', e.message);
        }
    };

    const allTeams = tournament ? Object.values(tournament.participants || {}).filter(p => p.id !== 'BYE') : [];
    const totalTeams = allTeams.length;

    // Generate preview pools using snake seeding
    const previewPools: Record<string, typeof allTeams> = {};
    const sorted = [...allTeams].sort((a, b) => a.seed - b.seed);
    const poolLetters = Array.from({ length: poolCount }, (_, i) => String.fromCharCode(65 + i));
    poolLetters.forEach(l => { previewPools[l] = []; });

    sorted.forEach((team, index) => {
        const cyclePos = index % (poolCount * 2);
        const poolIdx = cyclePos < poolCount ? cyclePos : (poolCount * 2 - 1 - cyclePos);
        const letter = poolLetters[Math.min(poolIdx, poolCount - 1)];
        // Respect manual overrides
        const override = tournament?.manualPoolAssignments?.[team.id];
        if (override && previewPools[override]) {
            previewPools[override].push(team);
        } else {
            previewPools[letter].push(team);
        }
    });

    if (!tournament) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={{ color: colors.text }}>Loading...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
                    <Ionicons name="chevron-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Pool Configuration</Text>
                <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                    <Text style={styles.saveBtnText}>Save</Text>
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                {/* Quick Stats */}
                <View style={styles.statsRow}>
                    <View style={styles.statBox}>
                        <Text style={styles.statValue}>{totalTeams}</Text>
                        <Text style={styles.statLabel}>Teams</Text>
                    </View>
                    <View style={styles.statBox}>
                        <Text style={styles.statValue}>{poolCount}</Text>
                        <Text style={styles.statLabel}>Pools</Text>
                    </View>
                    <View style={styles.statBox}>
                        <Text style={styles.statValue}>{qualifiersPerPool * poolCount}</Text>
                        <Text style={styles.statLabel}>Advance</Text>
                    </View>
                </View>

                {/* Pool Count */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Number of Pools</Text>
                    <View style={styles.segmentRow}>
                        {[2, 3, 4, 5, 6].map(n => (
                            <TouchableOpacity
                                key={n}
                                style={[styles.segmentBtn, poolCount === n && styles.segmentBtnActive]}
                                onPress={() => setPoolCount(n)}
                            >
                                <Text style={[styles.segmentText, poolCount === n && styles.segmentTextActive]}>{n}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* Qualifiers Per Pool */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Qualifiers Per Pool</Text>
                    <Text style={styles.sectionHint}>Number of teams that advance from each pool to the bracket.</Text>
                    <View style={styles.segmentRow}>
                        {[1, 2, 3].map(n => (
                            <TouchableOpacity
                                key={n}
                                style={[styles.segmentBtn, qualifiersPerPool === n && styles.segmentBtnActive]}
                                onPress={() => setQualifiersPerPool(n)}
                            >
                                <Text style={[styles.segmentText, qualifiersPerPool === n && styles.segmentTextActive]}>Top {n}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* Pool Format */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Pool Play Format</Text>
                    <View style={{ flexDirection: 'row', borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
                        <TouchableOpacity
                            style={{ flex: 1, paddingVertical: 12, backgroundColor: poolFormat === 'round_robin' ? colors.primary : colors.surfaceSecondary, alignItems: 'center' }}
                            onPress={() => setPoolFormat('round_robin')}
                        >
                            <Text style={{ fontWeight: '700', fontSize: 13, color: poolFormat === 'round_robin' ? '#FFF' : colors.textSecondary }}>Round Robin</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={{ flex: 1, paddingVertical: 12, backgroundColor: poolFormat === 'partial' ? colors.primary : colors.surfaceSecondary, alignItems: 'center' }}
                            onPress={() => setPoolFormat('partial')}
                        >
                            <Text style={{ fontWeight: '700', fontSize: 13, color: poolFormat === 'partial' ? '#FFF' : colors.textSecondary }}>Partial</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Pool Preview */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Pool Preview</Text>
                    <Text style={styles.sectionHint}>Teams are distributed via snake seeding. Manual overrides are respected.</Text>
                    {poolLetters.map(letter => (
                        <View key={letter} style={styles.poolPreview}>
                            <View style={styles.poolHeader}>
                                <Text style={styles.poolLetter}>Pool {letter}</Text>
                                <Text style={styles.poolTeamCount}>{previewPools[letter]?.length || 0} teams</Text>
                            </View>
                            {(previewPools[letter] || []).map((team, idx) => (
                                <View key={team.id} style={styles.poolTeamRow}>
                                    <Text style={styles.poolSeed}>({team.seed})</Text>
                                    <Text style={styles.poolTeamName}>{team.name}</Text>
                                    {tournament.manualPoolAssignments?.[team.id] && (
                                        <View style={styles.overrideBadge}>
                                            <Text style={styles.overrideBadgeText}>Manual</Text>
                                        </View>
                                    )}
                                </View>
                            ))}
                        </View>
                    ))}
                </View>
            </ScrollView>
        </View>
    );
}

const getStyles = (colors: ThemeColors) => {
    const Typography = getTypography(colors);
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        header: {
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16,
            backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
        },
        headerTitle: { ...Typography.title, fontSize: 20 },
        saveBtn: { paddingHorizontal: 18, paddingVertical: 8, backgroundColor: colors.primary, borderRadius: 20 },
        saveBtnText: { ...Typography.button, color: '#FFF' },
        content: { padding: 16, gap: 20, paddingBottom: 40 },
        statsRow: { flexDirection: 'row', gap: 12 },
        statBox: {
            flex: 1, backgroundColor: colors.surface, borderRadius: 16, padding: 16,
            alignItems: 'center', borderWidth: 1, borderColor: colors.border,
        },
        statValue: { ...Typography.title, fontSize: 28, color: colors.primary },
        statLabel: { ...Typography.caption, color: colors.textSecondary, marginTop: 4 },
        section: {
            backgroundColor: colors.surface, borderRadius: 16, padding: 16,
            gap: 12, borderWidth: 1, borderColor: colors.border,
        },
        sectionTitle: { ...Typography.subtitle, fontSize: 16 },
        sectionHint: { ...Typography.caption, color: colors.textSecondary, marginTop: -4 },
        segmentRow: { flexDirection: 'row', gap: 8 },
        segmentBtn: {
            flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center',
            backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border,
        },
        segmentBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
        segmentText: { fontWeight: '700', fontSize: 14, color: colors.textSecondary },
        segmentTextActive: { color: '#FFF' },
        poolPreview: {
            backgroundColor: colors.surfaceSecondary, borderRadius: 12, padding: 12, gap: 8,
        },
        poolHeader: {
            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 4,
        },
        poolLetter: { ...Typography.subtitle, fontSize: 15, color: colors.primary },
        poolTeamCount: { ...Typography.caption, color: colors.textSecondary },
        poolTeamRow: {
            flexDirection: 'row', alignItems: 'center', gap: 8,
            paddingVertical: 6, paddingHorizontal: 8,
            backgroundColor: colors.surface, borderRadius: 8,
        },
        poolSeed: { ...Typography.caption, color: colors.textSecondary, width: 28 },
        poolTeamName: { ...Typography.body, flex: 1 },
        overrideBadge: {
            backgroundColor: colors.primary, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2,
        },
        overrideBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
    });
};
