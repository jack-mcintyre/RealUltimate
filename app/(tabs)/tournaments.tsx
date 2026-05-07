import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth } from '../../firebaseConfig';
import TabSceneShell from '../components/TabSceneShell';
import { TeamService } from '../services/TeamService';
import { TournamentDirectoryItem, TournamentService } from '../services/TournamentService';
import { Team, Tournament, TournamentEngine, TournamentEnrollmentMode, TournamentPrivacy, TournamentSeeding } from '../services/types';
import { TOURNAMENT_TEMPLATES, TournamentTemplate } from '../services/tournamentTemplates';
import { getTypography, Layout } from '../theme/DesignSystem';
import { ThemeColors, useTheme } from '../theme/ThemeContext';

type TournamentDraftParticipant = {
    name: string;
    rating?: number;
};

const CREATE_HELP_TEXT = {
    hostTeam: 'The host team owns and manages this tournament. All bracket updates and scoring permissions are scoped to this team.',
    tournamentName: 'Use a clear event name like "Spring Invite 2026". This appears in tournament cards, detail pages, and shared links.',
    privacy: 'Public tournaments are visible to anyone in the app. Private tournaments include a join code for controlled access.',
    enrollment: 'Manual enrollment means organizers add participants directly. Open enrollment is designed for self-registration flows.',
    engine: 'Pool to Bracket runs round-robin style pool games first, then seeds into playoffs. Single Elim goes straight to knockout matches.',
    seeding: 'Manual keeps list order as entered. Rating sorts by rating high-to-low. Random shuffles entrants before building matchups.',
    consolation: 'When enabled, teams that miss championship progression still get a secondary bracket path for more games.',
    participants: 'Enter one team per line. Optional format "Team Name, 1870" attaches a rating used when seeding mode is set to Rating.',
} as const;

type CreateHelpKey = keyof typeof CREATE_HELP_TEXT;

const parseParticipants = (input: string): TournamentDraftParticipant[] => {
    return input
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
            const normalized = line.replace('|', ',');
            const commaIndex = normalized.indexOf(',');

            const namePart = commaIndex >= 0 ? normalized.slice(0, commaIndex).trim() : normalized.trim();
            const ratingPart = commaIndex >= 0 ? normalized.slice(commaIndex + 1).trim() : '';
            const ratingValue = Number(ratingPart);
            return {
                name: namePart,
                ...(Number.isFinite(ratingValue) ? { rating: ratingValue } : {}),
            };
        });
};

export default function TournamentsTabScreen() {
    const { colors } = useTheme();
    const styles = getStyles(colors);
    const user = auth.currentUser;

    const [myTournaments, setMyTournaments] = useState<Tournament[]>([]);
    const [publicDirectory, setPublicDirectory] = useState<TournamentDirectoryItem[]>([]);

    const [modalVisible, setModalVisible] = useState(false);
    const [activeHelpKey, setActiveHelpKey] = useState<CreateHelpKey | null>(null);
    const [tournamentName, setTournamentName] = useState('');
    const [privacy, setPrivacy] = useState<TournamentPrivacy>('private');
    const [enrollmentMode, setEnrollmentMode] = useState<TournamentEnrollmentMode>('manual');
    const [engine, setEngine] = useState<TournamentEngine>('pool_to_bracket');
    const [seeding, setSeeding] = useState<TournamentSeeding>('manual');
    const [includeConsolation, setIncludeConsolation] = useState(true);
    const [participantsInput, setParticipantsInput] = useState('');
    const [publicSearchText, setPublicSearchText] = useState('');
    const [joinCodeInput, setJoinCodeInput] = useState('');
    const [formError, setFormError] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isResolvingCode, setIsResolvingCode] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<string>('custom');
    const modalAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (!user) {
            setMyTournaments([]);
            return;
        }
        const unsubscribe = TournamentService.subscribeToMyTournaments(user.uid, (tournaments) => {
            setMyTournaments(tournaments);
        });
        return () => unsubscribe();
    }, [user]);

    const tournaments = myTournaments;

    const filteredPublicTournaments = useMemo(() => {
        const query = publicSearchText.trim().toLowerCase();
        if (!query) return publicDirectory;
        return publicDirectory.filter((item) => {
            const name = (item.name || '').toLowerCase();
            const teamName = (item.teamName || '').toLowerCase();
            return name.includes(query) || teamName.includes(query);
        });
    }, [publicDirectory, publicSearchText]);



    useEffect(() => {
        if (!modalVisible) {
            modalAnim.setValue(0);
            return;
        }

        Animated.timing(modalAnim, {
            toValue: 1,
            duration: 220,
            useNativeDriver: true,
        }).start();
    }, [modalAnim, modalVisible]);

    useEffect(() => {
        const unsubscribe = TournamentService.subscribeToPublicTournaments((items) => {
            setPublicDirectory(items);
        });

        return () => unsubscribe();
    }, []);

    const resetDraft = () => {
        setTournamentName('');
        setPrivacy('private');
        setEnrollmentMode('manual');
        setEngine('pool_to_bracket');
        setSeeding('manual');
        setIncludeConsolation(true);
        setParticipantsInput('');
        setActiveHelpKey(null);
        setFormError('');
        setSelectedTemplate('custom');
    };

    const applyTemplate = (templateId: string) => {
        setSelectedTemplate(templateId);
        const template = TOURNAMENT_TEMPLATES.find(t => t.id === templateId);
        if (!template) return;
        setEngine(template.config.engine);
        setIncludeConsolation(template.config.includeConsolation);
    };

    const closeCreateModal = () => {
        Animated.timing(modalAnim, {
            toValue: 0,
            duration: 180,
            useNativeDriver: true,
        }).start(() => {
            setModalVisible(false);
            setActiveHelpKey(null);
            setFormError('');
        });
    };

    const openCreateModal = () => {
        if (!user) {
            Alert.alert('Sign in required', 'You must be signed in to create a tournament.');
            return;
        }
        resetDraft();
        setModalVisible(true);
    };

    const handleCreateTournament = async () => {
        setFormError('');
        if (!user) {
            setFormError('You must be signed in to create a tournament.');
            return;
        }

        const normalizedTournamentName = tournamentName.trim();
        if (!normalizedTournamentName) {
            setFormError('Enter a tournament name before creating.');
            return;
        }

        const participants = parseParticipants(participantsInput);
        if (participants.length < 2) {
            setFormError('Add at least 2 teams (one per line).');
            return;
        }

        try {
            setIsSaving(true);
            const tournamentId = await TournamentService.createTournament(
                {
                    name: normalizedTournamentName,
                    privacy,
                    enrollmentMode,
                    engine,
                    seeding,
                    includeConsolation,
                    participants,
                },
                user.uid
            );

            // Apply template config if one was selected
            const template = TOURNAMENT_TEMPLATES.find(t => t.id === selectedTemplate);
            if (template && template.id !== 'custom') {
                const cfg = template.config;
                if (cfg.poolCount || cfg.poolSize || cfg.qualifiersPerPool || cfg.poolFormat) {
                    await TournamentService.updatePoolConfig(tournamentId, {
                        poolCount: cfg.poolCount,
                        poolSize: cfg.poolSize,
                        qualifiersPerPool: cfg.qualifiersPerPool,
                        poolFormat: cfg.poolFormat,
                    });
                }
                await TournamentService.updateBracketConfig(tournamentId, {
                    bracketFormat: cfg.bracketFormat,
                    includeConsolation: cfg.includeConsolation,
                    includeThirdPlace: cfg.includeThirdPlace,
                    crossoverEnabled: cfg.crossoverEnabled,
                });
                if (cfg.scheduleDays) {
                    await TournamentService.updateScheduleDays(tournamentId, cfg.scheduleDays);
                }
            }

            setModalVisible(false);
            modalAnim.setValue(0);
            resetDraft();
            router.push(`/tournament/${tournamentId}`);
        } catch (error: any) {
            const msg = error?.message || 'Could not create tournament.';
            setFormError(msg);
            Alert.alert('Creation Failed', msg);
        } finally {
            setIsSaving(false);
        }
    };

    const handleOpenByCode = async () => {
        const normalizedCode = joinCodeInput.trim().toUpperCase();
        if (!normalizedCode) {
            Alert.alert('Code required', 'Enter a tournament code first.');
            return;
        }

        try {
            setIsResolvingCode(true);
            const resolved = await TournamentService.resolveTournamentByCode(normalizedCode);
            if (!resolved) {
                Alert.alert('Not found', 'No tournament was found for that code.');
                return;
            }

            if (resolved.role === 'admin' && user?.uid) {
                await TournamentService.joinTournamentAsAdmin(normalizedCode, user.uid);
                Alert.alert('Admin Access Granted', 'You are now an admin of this tournament!');
            }

            router.push({
                pathname: '/tournament/[id]',
                params: { id: resolved.tournamentId },
            });
        } catch (error: any) {
            Alert.alert('Code error', error?.message || 'Could not open tournament by code.');
        } finally {
            setIsResolvingCode(false);
        }
    };

    const renderSectionLabel = (label: string, helpKey: CreateHelpKey) => {
        const isOpen = activeHelpKey === helpKey;
        return (
            <View style={styles.sectionLabelWrap}>
                <View style={styles.sectionLabelRow}>
                    <Text style={styles.sectionLabel}>{label}</Text>
                    <Pressable
                        onPress={() => setActiveHelpKey((prev) => (prev === helpKey ? null : helpKey))}
                        onHoverIn={() => setActiveHelpKey(helpKey)}
                        onHoverOut={() => setActiveHelpKey((prev) => (prev === helpKey ? null : prev))}
                        hitSlop={6}
                        style={styles.helpIconBtn}
                    >
                        <Ionicons name="help-circle-outline" size={15} color={colors.textSecondary} />
                    </Pressable>
                </View>
                {isOpen && (
                    <View style={styles.helpBubble}>
                        <Text style={styles.helpBubbleText}>{CREATE_HELP_TEXT[helpKey]}</Text>
                    </View>
                )}
            </View>
        );
    };

    const renderChipGroup = <T extends string>(
        value: T,
        onChange: (next: T) => void,
        options: { key: T; label: string }[]
    ) => (
        <View style={styles.sectionBlock}>
            <View style={styles.chipWrap}>
                {options.map((option) => {
                    const selected = option.key === value;
                    return (
                        <TouchableOpacity
                            key={option.key}
                            style={[styles.chip, selected && styles.chipActive]}
                            onPress={() => onChange(option.key)}
                        >
                            <Text style={[styles.chipText, selected && styles.chipTextActive]}>{option.label}</Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );

    return (
        <TabSceneShell>
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={styles.headerTitle}>Tournaments</Text>
                    <Text style={styles.headerSubtitle}>Create pools, bracket play, spirit leaderboard, and consolation paths.</Text>
                </View>
                <TouchableOpacity style={styles.createBtn} onPress={openCreateModal}>
                    <Ionicons name="add" size={18} color={colors.onPrimary} />
                    <Text style={styles.createBtnText}>Create</Text>
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.listContent}>
                <View style={styles.publicSearchCard}>
                    <Text style={styles.publicSearchTitle}>Find Public Open-Join Tournaments</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Search by tournament or team name"
                        placeholderTextColor={colors.textSecondary}
                        value={publicSearchText}
                        onChangeText={setPublicSearchText}
                    />
                    <View style={styles.joinCodeRow}>
                        <TextInput
                            style={[styles.input, { flex: 1 }]}
                            placeholder="Enter tournament code"
                            placeholderTextColor={colors.textSecondary}
                            value={joinCodeInput}
                            onChangeText={setJoinCodeInput}
                            autoCapitalize="characters"
                            maxLength={6}
                        />
                        <TouchableOpacity
                            style={[styles.codeOpenBtn, isResolvingCode && { opacity: 0.6 }]}
                            disabled={isResolvingCode}
                            onPress={handleOpenByCode}
                        >
                            <Text style={styles.codeOpenBtnText}>{isResolvingCode ? 'Opening...' : 'Open Code'}</Text>
                        </TouchableOpacity>
                    </View>

                    {filteredPublicTournaments.length === 0 ? (
                        <Text style={styles.emptyPublicText}>No open-enrollment tournaments match your search yet.</Text>
                    ) : (
                        <View style={{ gap: 8 }}>
                            {filteredPublicTournaments.slice(0, 16).map((item) => (
                                <TouchableOpacity
                                    key={`public-${item.tournamentId}`}
                                    style={styles.publicTournamentRow}
                                    onPress={() =>
                                        router.push({
                                            pathname: '/tournament/[id]',
                                            params: { id: item.tournamentId },
                                        })
                                    }
                                >
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.publicTournamentTitle}>{item.name}</Text>
                                        <Text style={styles.publicTournamentMeta}>{item.teamName} • {item.participantCount} teams</Text>
                                    </View>
                                    <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}
                </View>

                <Text style={styles.sectionHeader}>My Tournaments</Text>
                {tournaments.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Ionicons name="trophy-outline" size={28} color={colors.textSecondary} />
                        <Text style={styles.emptyTitle}>No tournaments yet</Text>
                        <Text style={styles.emptyText}>Create your first event and choose between single elimination or pool-to-bracket.</Text>
                    </View>
                ) : (
                    tournaments.map((tournament) => (
                        <TouchableOpacity
                            key={tournament.id}
                            style={styles.tournamentCard}
                            onPress={() =>
                                router.push({
                                    pathname: '/tournament/[id]',
                                    params: { id: tournament.id },
                                })
                            }
                        >
                            <View style={styles.cardRowTop}>
                                <Text style={styles.cardTitle}>{tournament.name}</Text>
                                <View style={styles.statusPill}>
                                    <Text style={styles.statusPillText}>{tournament.status.toUpperCase()}</Text>
                                </View>
                            </View>
                            <Text style={styles.cardMeta}>{tournament.teamName}</Text>
                            <Text style={styles.cardMeta}>
                                {tournament.engine === 'single_elim' ? 'Single Elimination' : 'Pool to Bracket'} • {tournament.privacy}
                            </Text>
                            <Text style={styles.cardMeta}>{Object.keys(tournament.participants || {}).length} teams</Text>
                        </TouchableOpacity>
                    ))
                )}
            </ScrollView>

            <Modal visible={modalVisible} animationType="fade" transparent onRequestClose={closeCreateModal}>
                <View style={styles.modalOverlay}>
                    <Pressable style={styles.modalDismissZone} onPress={closeCreateModal} />
                    <Animated.View
                        style={[
                            styles.modalCard,
                            {
                                opacity: modalAnim,
                                transform: [
                                    {
                                        translateY: modalAnim.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: [80, 0],
                                        }),
                                    },
                                ],
                            },
                        ]}
                    >
                        <Text style={styles.modalTitle}>Create Tournament</Text>

                        {/* Template Selector */}
                        <View style={{ marginBottom: 8 }}>
                            <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Choose a Template</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 8 }}>
                                {TOURNAMENT_TEMPLATES.map(t => (
                                    <TouchableOpacity
                                        key={t.id}
                                        style={{
                                            width: 130, paddingVertical: 14, paddingHorizontal: 12, borderRadius: 14,
                                            backgroundColor: selectedTemplate === t.id ? t.color + '18' : colors.surfaceSecondary,
                                            borderWidth: 2, borderColor: selectedTemplate === t.id ? t.color : colors.border,
                                            alignItems: 'center', gap: 6,
                                        }}
                                        onPress={() => applyTemplate(t.id)}
                                    >
                                        <Ionicons name={t.icon as any} size={22} color={selectedTemplate === t.id ? t.color : colors.textSecondary} />
                                        <Text style={{ fontSize: 12, fontWeight: '700', color: selectedTemplate === t.id ? colors.text : colors.textSecondary, textAlign: 'center' }}>{t.name}</Text>
                                        <Text style={{ fontSize: 9, color: colors.textSecondary, textAlign: 'center', lineHeight: 12 }} numberOfLines={2}>{t.description}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>

                        <ScrollView style={{ width: '100%' }} contentContainerStyle={{ paddingBottom: 6 }}>

                            <View style={styles.sectionBlock}>
                                {renderSectionLabel('Tournament Name', 'tournamentName')}
                                <TextInput
                                    style={styles.input}
                                    placeholder="Spring Invite 2026"
                                    placeholderTextColor={colors.textSecondary}
                                    value={tournamentName}
                                    onChangeText={setTournamentName}
                                    maxLength={80}
                                />
                            </View>

                            {renderSectionLabel('Privacy', 'privacy')}
                            {renderChipGroup(privacy, setPrivacy, [
                                { key: 'public', label: 'Public' },
                                { key: 'private', label: 'Private + Code' },
                            ])}

                            {renderSectionLabel('Enrollment', 'enrollment')}
                            {renderChipGroup(enrollmentMode, setEnrollmentMode, [
                                { key: 'manual', label: 'Manual' },
                                { key: 'open', label: 'Open Enrollment' },
                            ])}

                            {renderSectionLabel('Engine', 'engine')}
                            {renderChipGroup(engine, setEngine, [
                                { key: 'pool_to_bracket', label: 'Pool -> Bracket' },
                                { key: 'single_elim', label: 'Single Elim' },
                            ])}

                            {renderSectionLabel('Seeding', 'seeding')}
                            {renderChipGroup(seeding, setSeeding, [
                                { key: 'manual', label: 'Manual Order' },
                                { key: 'rating', label: 'Rating' },
                                { key: 'random', label: 'Random' },
                            ])}

                            <View style={styles.switchRow}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
                                    <Text style={styles.switchLabel}>Include Consolation Path</Text>
                                    <Pressable
                                        onPress={() => setActiveHelpKey((prev) => (prev === 'consolation' ? null : 'consolation'))}
                                        onHoverIn={() => setActiveHelpKey('consolation')}
                                        onHoverOut={() => setActiveHelpKey((prev) => (prev === 'consolation' ? null : prev))}
                                        hitSlop={6}
                                    >
                                        <Ionicons name="help-circle-outline" size={15} color={colors.textSecondary} />
                                    </Pressable>
                                </View>
                                <Switch
                                    value={includeConsolation}
                                    onValueChange={setIncludeConsolation}
                                    trackColor={{ false: colors.border, true: colors.primary }}
                                    thumbColor={includeConsolation ? colors.onPrimary : colors.surface}
                                />
                            </View>
                            {activeHelpKey === 'consolation' && (
                                <View style={styles.helpBubbleInline}>
                                    <Text style={styles.helpBubbleText}>{CREATE_HELP_TEXT.consolation}</Text>
                                </View>
                            )}

                            <View style={styles.sectionBlock}>
                                {renderSectionLabel('Participants', 'participants')}
                                <Text style={styles.hintText}>One team per line. Optional rating format: Team Name, 1870</Text>
                                <TextInput
                                    style={[styles.input, styles.multilineInput]}
                                    multiline
                                    textAlignVertical="top"
                                    placeholder={"Team 1\nTeam 2, 1765\nTeam 3"}
                                    placeholderTextColor={colors.textSecondary}
                                    value={participantsInput}
                                    onChangeText={setParticipantsInput}
                                />
                            </View>
                        </ScrollView>

                        {!!formError && <Text style={styles.formErrorText}>{formError}</Text>}

                        <View style={styles.footerRow}>
                            <TouchableOpacity style={styles.footerBtn} onPress={closeCreateModal} disabled={isSaving}>
                                <Text style={styles.footerBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.footerBtn, styles.footerBtnPrimary]}
                                onPress={handleCreateTournament}
                                disabled={isSaving}
                            >
                                <Text style={styles.footerBtnTextPrimary}>{isSaving ? 'Creating...' : 'Create Tournament'}</Text>
                            </TouchableOpacity>
                        </View>
                    </Animated.View>
                </View>
            </Modal>
        </View>
        </TabSceneShell>
    );
}

const getStyles = (colors: ThemeColors) => {
    const Typography = getTypography(colors);
    return StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: colors.background,
        },
        header: {
            paddingHorizontal: 16,
            paddingTop: 14,
            paddingBottom: 12,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            backgroundColor: colors.surface,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
        },
        headerTitle: {
            ...Typography.title,
            fontSize: 22,
        },
        headerSubtitle: {
            ...Typography.bodySmall,
            color: colors.textSecondary,
            marginTop: 2,
        },
        createBtn: {
            minWidth: 96,
            height: 40,
            borderRadius: Layout.radiusMd,
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 6,
            paddingHorizontal: 12,
        },
        createBtnText: {
            ...Typography.button,
            color: colors.onPrimary,
        },
        listContent: {
            padding: 16,
            gap: 12,
        },
        sectionHeader: {
            ...Typography.label,
            color: colors.textSecondary,
            textTransform: 'uppercase',
            letterSpacing: 0.8,
            marginTop: 2,
            marginBottom: 2,
        },
        publicSearchCard: {
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: Layout.radiusLg,
            backgroundColor: colors.surface,
            padding: 12,
            gap: 10,
        },
        publicSearchTitle: {
            ...Typography.subtitle,
        },
        joinCodeRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
        },
        codeOpenBtn: {
            minWidth: 106,
            height: 42,
            borderRadius: Layout.radiusMd,
            borderWidth: 1,
            borderColor: colors.primary,
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 12,
        },
        codeOpenBtnText: {
            ...Typography.button,
            color: colors.onPrimary,
        },
        emptyPublicText: {
            ...Typography.bodySmall,
            color: colors.textSecondary,
        },
        publicTournamentRow: {
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: Layout.radiusMd,
            backgroundColor: colors.surfaceSecondary,
            paddingHorizontal: 10,
            paddingVertical: 9,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
        },
        publicTournamentTitle: {
            ...Typography.body,
            color: colors.text,
            fontWeight: 'bold',
        },
        publicTournamentMeta: {
            ...Typography.caption,
            color: colors.textSecondary,
            marginTop: 1,
        },
        tournamentCard: {
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: Layout.radiusLg,
            backgroundColor: colors.surface,
            padding: 12,
        },
        cardRowTop: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 4,
            gap: 8,
        },
        cardTitle: {
            ...Typography.subtitle,
            fontWeight: 'bold',
            flex: 1,
        },
        cardMeta: {
            ...Typography.bodySmall,
            color: colors.textSecondary,
            marginTop: 2,
        },
        statusPill: {
            borderRadius: 999,
            backgroundColor: colors.primaryLight,
            paddingHorizontal: 8,
            paddingVertical: 3,
        },
        statusPillText: {
            ...Typography.caption,
            color: colors.primary,
            fontWeight: '700',
        },
        emptyState: {
            marginTop: 36,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: Layout.radiusLg,
            backgroundColor: colors.surface,
            padding: 18,
            alignItems: 'center',
            gap: 8,
        },
        emptyTitle: {
            ...Typography.subtitle,
        },
        emptyText: {
            ...Typography.bodySmall,
            color: colors.textSecondary,
            textAlign: 'center',
            lineHeight: 20,
        },
        modalOverlay: {
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.58)',
            justifyContent: 'flex-end',
            alignItems: 'center',
            paddingHorizontal: 14,
            paddingBottom: 14,
        },
        modalDismissZone: {
            flex: 1,
            width: '100%',
        },
        modalCard: {
            width: '100%',
            maxWidth: 520,
            maxHeight: '88%',
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: Layout.radiusLg,
            backgroundColor: colors.surface,
            padding: 14,
            gap: 10,
            zIndex: 2,
        },
        modalTitle: {
            ...Typography.title,
            fontSize: 20,
            textAlign: 'center',
            marginBottom: 2,
        },
        sectionBlock: {
            marginBottom: 12,
        },
        sectionLabelWrap: {
            marginBottom: 6,
            position: 'relative',
            zIndex: 20,
        },
        sectionLabelRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            alignSelf: 'flex-start',
        },
        sectionLabel: {
            ...Typography.label,
            color: colors.textSecondary,
            textTransform: 'uppercase',
            letterSpacing: 0.8,
        },
        helpIconBtn: {
            width: 18,
            height: 18,
            alignItems: 'center',
            justifyContent: 'center',
        },
        helpBubble: {
            position: 'absolute',
            top: 22,
            left: 0,
            width: '100%',
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: Layout.radiusMd,
            backgroundColor: colors.surface,
            paddingHorizontal: 10,
            paddingVertical: 9,
            ...Layout.shadow,
        },
        helpBubbleInline: {
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: Layout.radiusMd,
            backgroundColor: colors.surface,
            paddingHorizontal: 10,
            paddingVertical: 9,
            marginBottom: 12,
            ...Layout.shadow,
        },
        helpBubbleText: {
            ...Typography.bodySmall,
            color: colors.textSecondary,
            lineHeight: 18,
        },
        chipWrap: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 8,
        },
        chip: {
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surfaceSecondary,
            borderRadius: Layout.radiusMd,
            paddingHorizontal: 10,
            paddingVertical: 8,
        },
        chipActive: {
            borderColor: colors.primary,
            backgroundColor: colors.primaryLight,
        },
        chipText: {
            ...Typography.bodySmall,
            color: colors.textSecondary,
        },
        chipTextActive: {
            color: colors.primary,
            fontWeight: '700',
        },
        input: {
            ...Typography.body,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: Layout.radiusMd,
            backgroundColor: colors.surfaceSecondary,
            color: colors.text,
            paddingHorizontal: 12,
            paddingVertical: 10,
        },
        multilineInput: {
            minHeight: 118,
        },
        hintText: {
            ...Typography.caption,
            color: colors.textSecondary,
            marginBottom: 6,
        },
        switchRow: {
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: Layout.radiusMd,
            backgroundColor: colors.surfaceSecondary,
            paddingHorizontal: 10,
            paddingVertical: 9,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12,
        },
        switchLabel: {
            ...Typography.body,
        },
        footerRow: {
            flexDirection: 'row',
            gap: 10,
        },
        formErrorText: {
            ...Typography.bodySmall,
            color: colors.error,
            marginTop: -2,
            marginBottom: 2,
        },
        footerBtn: {
            flex: 1,
            height: 42,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: Layout.radiusMd,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.surfaceSecondary,
        },
        footerBtnPrimary: {
            backgroundColor: colors.primary,
            borderColor: colors.primary,
        },
        footerBtnText: {
            ...Typography.button,
            color: colors.textSecondary,
        },
        footerBtnTextPrimary: {
            ...Typography.button,
            color: colors.onPrimary,
        },
    });
};
