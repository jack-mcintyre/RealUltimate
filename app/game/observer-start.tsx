import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth } from '../../firebaseConfig';
import { GameService } from '../services/GameService';
import { TeamService } from '../services/TeamService';
import { Layout } from '../theme/DesignSystem';
import { useTheme } from '../theme/ThemeContext';

export default function ObserverNeutralStartScreen() {
    const { colors } = useTheme();
    const [codeTeamA, setCodeTeamA] = useState('');
    const [codeTeamB, setCodeTeamB] = useState('');
    const [location, setLocation] = useState('');
    const [isStarting, setIsStarting] = useState(false);

    const handleStart = async () => {
        const uid = auth.currentUser?.uid;
        if (!uid) {
            Alert.alert('Sign in required', 'Log in as the referee or scorer to record for both teams.');
            return;
        }

        const a = codeTeamA.trim().toUpperCase();
        const b = codeTeamB.trim().toUpperCase();
        if (a.length !== 6 || b.length !== 6) {
            Alert.alert('Observer codes needed', 'Enter both six-letter observer (scorer) codes from each team.');
            return;
        }
        if (a === b) {
            Alert.alert('Different teams', 'Use each team\'s distinct observer code.');
            return;
        }

        setIsStarting(true);
        try {
            // Prefer the dedicated observer code. Fall back to spectator (fan) code
            // for legacy teams that haven't yet generated an observer code.
            const resolveTeam = async (code: string) => {
                const observerHit = await TeamService.lookupTeamByObserverCode(code);
                if (observerHit) return observerHit;
                return TeamService.lookupTeamBySpectatorCode(code);
            };
            const [teamA, teamB] = await Promise.all([resolveTeam(a), resolveTeam(b)]);

            if (!teamA || !teamB) {
                Alert.alert(
                    'Invalid observer code(s)',
                    'Each code must be the team observer (scorer) code — not the coach invitation code.'
                );
                return;
            }
            if (teamA.id === teamB.id) {
                Alert.alert('Same team', 'Enter observer codes from two different teams.');
                return;
            }

            const gameId = await GameService.createNeutralObserverGame({
                observerUid: uid,
                teamA,
                teamB,
                gameLocation: location.trim() || undefined,
            });

            router.replace({
                pathname: '/game/record/[teamId]',
                params: { teamId: 'dual_observer', dualGameId: gameId },
            } as any);
        } catch (e: any) {
            Alert.alert('Could not start', e?.message || 'Check your connection and permissions, then try again.');
        } finally {
            setIsStarting(false);
        }
    };

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.root, { backgroundColor: colors.background }]}>
            <View style={[styles.bar, { borderBottomColor: colors.border }]}>
                <TouchableOpacity accessibilityRole="button" onPress={() => router.back()} style={[styles.circle, { borderColor: colors.border }]} activeOpacity={0.75}>
                    <Ionicons name="arrow-back" size={22} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.barTitle, { color: colors.text }]} numberOfLines={1}>
                    Neutral scorer
                </Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <Text style={[styles.kicker, { color: colors.primary }]}>NO COACH ACCESS</Text>
                <Text style={[styles.title, { color: colors.text }]}>Record for two teams</Text>
                <Text style={[styles.body, { color: colors.textSecondary }]}>
                    Ask each coach for their team observer (scorer) code — separate from the public fan code. You do not need their coach code. When the game ends, each team can add the match to their profile or decline.
                </Text>

                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.label, { color: colors.textSecondary }]}>FIRST TEAM OBSERVER CODE</Text>
                    <TextInput
                        style={[styles.codeInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}
                        placeholder="XXXXXX"
                        placeholderTextColor={colors.textSecondary}
                        value={codeTeamA}
                        onChangeText={setCodeTeamA}
                        maxLength={6}
                        autoCapitalize="characters"
                    />
                    <Text style={[styles.label, { color: colors.textSecondary, marginTop: 14 }]}>SECOND TEAM OBSERVER CODE</Text>
                    <TextInput
                        style={[styles.codeInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}
                        placeholder="XXXXXX"
                        placeholderTextColor={colors.textSecondary}
                        value={codeTeamB}
                        onChangeText={setCodeTeamB}
                        maxLength={6}
                        autoCapitalize="characters"
                    />
                    <Text style={[styles.label, { color: colors.textSecondary, marginTop: 14 }]}>LOCATION (OPTIONAL)</Text>
                    <TextInput
                        style={[styles.locInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}
                        placeholder="e.g. Fields 5–6"
                        placeholderTextColor={colors.textSecondary}
                        value={location}
                        onChangeText={setLocation}
                    />
                </View>

                <TouchableOpacity style={[styles.primary, { backgroundColor: colors.primary, opacity: isStarting ? 0.85 : 1 }]} onPress={handleStart} disabled={isStarting} activeOpacity={0.88}>
                    <Ionicons name="play" size={20} color={colors.onPrimary} style={{ marginRight: 10 }} />
                    <Text style={[styles.primaryText, { color: colors.onPrimary }]}>{isStarting ? 'Starting…' : 'Open recorder'}</Text>
                </TouchableOpacity>

                <Text style={[styles.footnote, { color: colors.textSecondary }]}>
                    Advanced pass tracking stays off here for stability; possession and roster taps work normally.
                </Text>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    bar: {
        paddingTop: 12,
        paddingBottom: 12,
        paddingHorizontal: Layout.padding,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottomWidth: 1,
    },
    circle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
    },
    barTitle: { fontSize: 17, fontWeight: '800', flex: 1, textAlign: 'center' },
    scroll: { padding: Layout.padding, paddingBottom: 48 },
    kicker: { fontSize: 11, fontWeight: '900', letterSpacing: 2, marginBottom: 6 },
    title: { fontSize: 26, fontWeight: '900', marginBottom: 10, lineHeight: 30 },
    body: { fontSize: 15, lineHeight: 22, marginBottom: 22 },
    card: { borderRadius: Layout.radiusLg, borderWidth: 1, padding: 18, marginBottom: 20 },
    label: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 8 },
    codeInput: {
        borderWidth: 1,
        borderRadius: Layout.radiusMd,
        paddingVertical: 14,
        paddingHorizontal: 16,
        fontSize: 22,
        fontWeight: '800',
        letterSpacing: 6,
        textAlign: 'center',
    },
    locInput: {
        borderWidth: 1,
        borderRadius: Layout.radiusMd,
        paddingVertical: 12,
        paddingHorizontal: 14,
        fontSize: 16,
    },
    primary: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        borderRadius: Layout.radiusMd,
        marginBottom: 16,
    },
    primaryText: { fontWeight: '800', fontSize: 16 },
    footnote: { fontSize: 13, lineHeight: 18 },
});
