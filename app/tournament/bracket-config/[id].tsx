import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TournamentService } from '../../services/TournamentService';
import { Tournament } from '../../services/types';
import { ThemeColors, useTheme } from '../../theme/ThemeContext';
import { getTypography, Layout } from '../../theme/DesignSystem';

export default function BracketConfigScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { colors } = useTheme();
    const styles = getStyles(colors);

    const [tournament, setTournament] = useState<Tournament | null>(null);
    const [bracketFormat, setBracketFormat] = useState<'single_elim' | 'double_elim'>('single_elim');
    const [includeConsolation, setIncludeConsolation] = useState(true);
    const [includeThirdPlace, setIncludeThirdPlace] = useState(false);
    const [crossoverEnabled, setCrossoverEnabled] = useState(false);
    const [qualifiersPerPool, setQualifiersPerPool] = useState(2);

    useEffect(() => {
        if (!id) return;
        const unsub = TournamentService.subscribeToTournament(id, (data) => {
            if (data && !tournament) {
                setTournament(data);
                setBracketFormat((data.bracketFormat as any) || 'single_elim');
                setIncludeConsolation(data.includeConsolation ?? true);
                setIncludeThirdPlace(data.includeThirdPlace ?? false);
                setCrossoverEnabled(data.crossoverEnabled ?? false);
                setQualifiersPerPool(data.qualifiersPerPool || 2);
            } else if (data) {
                setTournament(data);
            }
        });
        return () => unsub();
    }, [id]);

    const handleSave = async () => {
        if (!tournament) return;
        try {
            await TournamentService.updateBracketConfig(tournament.id, {
                bracketFormat, includeConsolation, includeThirdPlace, crossoverEnabled, qualifiersPerPool,
            });
            Alert.alert('Saved', 'Bracket configuration updated.');
            router.back();
        } catch (e: any) {
            Alert.alert('Error', e.message);
        }
    };

    const totalTeams = tournament ? Object.values(tournament.participants || {}).filter(p => p.id !== 'BYE').length : 0;
    const poolCount = tournament?.poolCount || 2;
    const advancingTeams = qualifiersPerPool * poolCount;
    const isPoolToBracket = tournament?.engine === 'pool_to_bracket';

    if (!tournament) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={{ color: colors.text }}>Loading...</Text>
            </View>
        );
    }

    const ToggleRow = ({ label, hint, value, onToggle }: { label: string; hint: string; value: boolean; onToggle: () => void }) => (
        <TouchableOpacity style={styles.toggleRow} onPress={onToggle} activeOpacity={0.7}>
            <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>{label}</Text>
                <Text style={styles.toggleHint}>{hint}</Text>
            </View>
            <View style={[styles.toggleTrack, value && styles.toggleTrackActive]}>
                <View style={[styles.toggleThumb, value && styles.toggleThumbActive]} />
            </View>
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
                    <Ionicons name="chevron-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Bracket Config</Text>
                <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                    <Text style={styles.saveBtnText}>Save</Text>
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                {/* Summary Cards */}
                <View style={styles.statsRow}>
                    <View style={styles.statBox}>
                        <Text style={styles.statValue}>{totalTeams}</Text>
                        <Text style={styles.statLabel}>Total</Text>
                    </View>
                    <View style={styles.statBox}>
                        <Text style={[styles.statValue, { color: '#34C759' }]}>{advancingTeams}</Text>
                        <Text style={styles.statLabel}>Advance</Text>
                    </View>
                    <View style={styles.statBox}>
                        <Text style={[styles.statValue, { color: '#FF9500' }]}>{totalTeams - advancingTeams}</Text>
                        <Text style={styles.statLabel}>Eliminated</Text>
                    </View>
                </View>

                {/* Bracket Format */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Bracket Format</Text>
                    <View style={{ flexDirection: 'row', borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
                        <TouchableOpacity
                            style={{ flex: 1, paddingVertical: 14, backgroundColor: bracketFormat === 'single_elim' ? colors.primary : colors.surfaceSecondary, alignItems: 'center' }}
                            onPress={() => setBracketFormat('single_elim')}
                        >
                            <Text style={{ fontWeight: '700', fontSize: 13, color: bracketFormat === 'single_elim' ? '#FFF' : colors.textSecondary }}>Single Elimination</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={{ flex: 1, paddingVertical: 14, backgroundColor: bracketFormat === 'double_elim' ? colors.primary : colors.surfaceSecondary, alignItems: 'center' }}
                            onPress={() => setBracketFormat('double_elim')}
                        >
                            <Text style={{ fontWeight: '700', fontSize: 13, color: bracketFormat === 'double_elim' ? '#FFF' : colors.textSecondary }}>Double Elimination</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Qualifiers (only for pool_to_bracket) */}
                {isPoolToBracket && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Qualifiers Per Pool</Text>
                        <Text style={styles.sectionHint}>How many teams advance from each pool into the bracket phase.</Text>
                        <View style={styles.segmentRow}>
                            {[1, 2, 3, 4].map(n => (
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
                )}

                {/* Toggle Options */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Options</Text>
                    <ToggleRow
                        label="Consolation Bracket"
                        hint="Teams eliminated in round 1 play a separate bracket."
                        value={includeConsolation}
                        onToggle={() => setIncludeConsolation(!includeConsolation)}
                    />
                    <ToggleRow
                        label="3rd Place Match"
                        hint="Losers of the semi-finals play for 3rd place."
                        value={includeThirdPlace}
                        onToggle={() => setIncludeThirdPlace(!includeThirdPlace)}
                    />
                    {isPoolToBracket && (
                        <ToggleRow
                            label="Crossover Matches"
                            hint="Bridge matches between pool play and bracket play to refine seeding."
                            value={crossoverEnabled}
                            onToggle={() => setCrossoverEnabled(!crossoverEnabled)}
                        />
                    )}
                </View>

                {/* Bracket Structure Preview */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Bracket Preview</Text>
                    <View style={styles.previewBox}>
                        <Text style={styles.previewLine}>
                            <Text style={{ color: colors.primary, fontWeight: '700' }}>{advancingTeams}</Text> teams enter the championship bracket
                        </Text>
                        {includeConsolation && (
                            <Text style={styles.previewLine}>
                                <Text style={{ color: '#FF9500', fontWeight: '700' }}>{totalTeams - advancingTeams}</Text> teams enter the consolation bracket
                            </Text>
                        )}
                        {crossoverEnabled && (
                            <Text style={styles.previewLine}>
                                <Text style={{ color: '#AF52DE', fontWeight: '700' }}>Crossover</Text> round before elimination begins
                            </Text>
                        )}
                        {includeThirdPlace && (
                            <Text style={styles.previewLine}>
                                3rd place match between semi-final losers
                            </Text>
                        )}
                        <Text style={[styles.previewLine, { marginTop: 8, fontStyle: 'italic' }]}>
                            Format: {bracketFormat === 'single_elim' ? 'Single Elimination' : 'Double Elimination'}
                        </Text>
                    </View>
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
        segmentText: { fontWeight: '700', fontSize: 13, color: colors.textSecondary },
        segmentTextActive: { color: '#FFF' },
        toggleRow: {
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingVertical: 12, paddingHorizontal: 4,
            borderBottomWidth: 1, borderBottomColor: colors.border,
        },
        toggleLabel: { ...Typography.body, fontWeight: '600', fontSize: 14 },
        toggleHint: { ...Typography.caption, color: colors.textSecondary, marginTop: 2 },
        toggleTrack: {
            width: 50, height: 28, borderRadius: 14,
            backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border,
            justifyContent: 'center', paddingHorizontal: 2,
        },
        toggleTrackActive: { backgroundColor: colors.primary, borderColor: colors.primary },
        toggleThumb: {
            width: 22, height: 22, borderRadius: 11,
            backgroundColor: colors.textSecondary,
        },
        toggleThumbActive: { backgroundColor: '#FFF', alignSelf: 'flex-end' },
        previewBox: {
            backgroundColor: colors.surfaceSecondary, borderRadius: 12, padding: 14, gap: 6,
        },
        previewLine: { ...Typography.body, fontSize: 13, lineHeight: 20, color: colors.text },
    });
};
