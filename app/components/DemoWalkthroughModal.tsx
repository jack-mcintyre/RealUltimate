import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getTypography, Layout } from '../theme/DesignSystem';
import { ThemeColors, useTheme } from '../theme/ThemeContext';

export type DemoWalkthroughProps = {
    visible: boolean;
    onClose: () => void;
    universityIowaTeamId: string;
    followTeamId: string;
};

const STEPS = [
    {
        title: 'Demo data loaded',
        body: 'Two teams: University of Iowa is yours to coach; Iowa State sits under Following for a true fan-style page. Three Hawkeyes–Cyclone games (mixed outcomes), full rosters, and schedules — names and stats behave like real recordings.',
        icon: 'checkmark-circle' as const,
    },
    {
        title: 'Open each team page',
        body: 'The first time you land on each demo team, a short panel explains what you are looking at — coach tools vs follow-only — and where Team settings (pencil) and share live.',
        icon: 'information-circle' as const,
    },
    {
        title: 'History & recorder',
        body: 'Use Previous games → History for event logs, box score, and the shareable match card. Start a live scoring session from the Teams tab with Record on the Hawkeyes.',
        icon: 'radio' as const,
    },
    {
        title: 'Watch & compare',
        body: 'When a game is live, Watch shows the fan feed. Flip between Iowa (coach) and Iowa State (following) to contrast workflows in one demo.',
        icon: 'eye' as const,
    },
];

export default function DemoWalkthroughModal({ visible, onClose, universityIowaTeamId, followTeamId }: DemoWalkthroughProps) {
    const { colors } = useTheme();
    const styles = getStyles(colors);
    const [step, setStep] = useState(0);

    const close = () => {
        setStep(0);
        onClose();
    };

    const goTeams = () => {
        close();
        router.push('/(tabs)/teams');
    };

    const goUniTeam = () => {
        close();
        if (universityIowaTeamId) {
            router.push(`/team/${universityIowaTeamId}` as any);
        } else {
            goTeams();
        }
    };

    const goFollowTeam = () => {
        close();
        if (followTeamId) {
            router.push(`/team/${followTeamId}` as any);
        } else {
            goTeams();
        }
    };

    const goRecorder = () => {
        close();
        if (universityIowaTeamId) {
            router.push(`/game/record/${universityIowaTeamId}` as any);
        } else {
            goTeams();
        }
    };

    const current = STEPS[step];
    const isLast = step === STEPS.length - 1;

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
            <View style={styles.overlay}>
                <View style={styles.card}>
                    <View style={styles.headerRow}>
                        <Text style={styles.kicker}>MODERN MARVELS</Text>
                        <TouchableOpacity onPress={close} hitSlop={12} accessibilityLabel="Close demo tour">
                            <Ionicons name="close" size={26} color={colors.textSecondary} />
                        </TouchableOpacity>
                    </View>
                    <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
                        <View style={styles.iconCircle}>
                            <Ionicons name={current.icon} size={36} color={colors.onPrimary} />
                        </View>
                        <Text style={styles.title}>{current.title}</Text>
                        <Text style={styles.body}>{current.body}</Text>

                        {step === 1 ? (
                            <View style={styles.teamLinkStack}>
                                <TouchableOpacity style={styles.secondaryBtn} onPress={goUniTeam} activeOpacity={0.85}>
                                    <Text style={styles.secondaryBtnText}>University of Iowa (coach)</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.secondaryBtn} onPress={goFollowTeam} activeOpacity={0.85}>
                                    <Text style={styles.secondaryBtnText}>Iowa State (following)</Text>
                                </TouchableOpacity>
                            </View>
                        ) : null}

                        {step === 2 ? (
                            <TouchableOpacity style={styles.primaryBtn} onPress={goRecorder} activeOpacity={0.85}>
                                <Ionicons name="mic-circle-outline" size={20} color={colors.onPrimary} />
                                <Text style={styles.primaryBtnText}>Open recorder (Hawkeyes)</Text>
                            </TouchableOpacity>
                        ) : null}

                        <View style={styles.dots}>
                            {STEPS.map((_, i) => (
                                <View key={String(i)} style={[styles.dot, i === step && styles.dotActive]} />
                            ))}
                        </View>
                    </ScrollView>

                    <View style={styles.footer}>
                        {step > 0 ? (
                            <TouchableOpacity style={styles.footerGhost} onPress={() => setStep((s) => Math.max(0, s - 1))}>
                                <Text style={styles.footerGhostText}>Back</Text>
                            </TouchableOpacity>
                        ) : (
                            <View style={styles.footerGhost} />
                        )}
                        {isLast ? (
                            <TouchableOpacity style={styles.footerPrimary} onPress={goTeams} activeOpacity={0.85}>
                                <Text style={styles.footerPrimaryText}>Go to Teams</Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity style={styles.footerPrimary} onPress={() => setStep((s) => s + 1)} activeOpacity={0.85}>
                                <Text style={styles.footerPrimaryText}>Next</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const getStyles = (colors: ThemeColors) => {
    const Typography = getTypography(colors);
    return StyleSheet.create({
        overlay: {
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.55)',
            justifyContent: 'center',
            padding: Layout.padding,
        },
        card: {
            backgroundColor: colors.surface,
            borderRadius: Layout.radiusXl,
            maxHeight: '88%',
            borderWidth: 1,
            borderColor: colors.border,
            ...Layout.shadow,
        },
        headerRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 18,
            paddingTop: 14,
        },
        kicker: {
            ...Typography.label,
            color: colors.primary,
            letterSpacing: 1.6,
        },
        scroll: {
            paddingHorizontal: 20,
            paddingBottom: 12,
        },
        iconCircle: {
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            alignSelf: 'center',
            marginTop: 12,
            marginBottom: 14,
        },
        title: {
            ...Typography.title,
            fontSize: 22,
            textAlign: 'center',
            marginBottom: 10,
            color: colors.text,
        },
        body: {
            ...Typography.body,
            color: colors.textSecondary,
            lineHeight: 22,
            textAlign: 'center',
            marginBottom: 16,
        },
        actionRow: {
            gap: 10,
            marginBottom: 8,
        },
        teamLinkStack: {
            gap: 10,
            marginBottom: 8,
        },
        secondaryBtn: {
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: Layout.radiusMd,
            paddingVertical: 12,
            alignItems: 'center',
            backgroundColor: colors.surface,
        },
        secondaryBtnText: {
            ...Typography.button,
            color: colors.primary,
        },
        primaryBtn: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            backgroundColor: colors.primary,
            borderRadius: Layout.radiusMd,
            paddingVertical: 14,
            marginBottom: 12,
        },
        primaryBtnText: {
            ...Typography.button,
            color: colors.onPrimary,
        },
        dots: {
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 6,
            marginTop: 8,
            marginBottom: 4,
        },
        dot: {
            width: 7,
            height: 7,
            borderRadius: 4,
            backgroundColor: colors.border,
        },
        dotActive: {
            backgroundColor: colors.primary,
            width: 18,
        },
        footer: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingVertical: 14,
            borderTopWidth: 1,
            borderTopColor: colors.border,
        },
        footerGhost: {
            minWidth: 72,
            paddingVertical: 10,
        },
        footerGhostText: {
            ...Typography.button,
            color: colors.textSecondary,
        },
        footerPrimary: {
            flex: 1,
            marginLeft: 12,
            backgroundColor: colors.primary,
            borderRadius: Layout.radiusMd,
            paddingVertical: 14,
            alignItems: 'center',
        },
        footerPrimaryText: {
            ...Typography.button,
            color: colors.onPrimary,
        },
    });
};
