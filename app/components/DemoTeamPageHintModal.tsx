import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getTypography, Layout } from '../theme/DesignSystem';
import { ThemeColors, useTheme } from '../theme/ThemeContext';

export type DemoTeamPageHintVariant = 'coach' | 'follow';

type Props = {
    visible: boolean;
    variant: DemoTeamPageHintVariant;
    teamName: string;
    onDismiss: () => void;
};

export default function DemoTeamPageHintModal({ visible, variant, teamName, onDismiss }: Props) {
    const { colors } = useTheme();
    const styles = getStyles(colors);
    const isCoach = variant === 'coach';

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
            <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onDismiss}>
                <View style={styles.card} onStartShouldSetResponder={() => true}>
                    <View style={styles.iconCircle}>
                        <Ionicons name={isCoach ? 'shield-checkmark' : 'heart'} size={28} color={colors.onPrimary} />
                    </View>
                    <Text style={styles.title}>{isCoach ? 'Coach team page' : 'Following (fan view)'}</Text>
                    <Text style={styles.teamName}>{teamName}</Text>

                    {isCoach ? (
                        <>
                            <Text style={styles.body}>
                                This is your <Text style={styles.em}>managed</Text> team: roster, schedule, win/loss, and past games with full stats.
                            </Text>
                            <Text style={styles.body}>
                                <Text style={styles.em}>Top bar:</Text> back, then <Text style={styles.em}>share</Text> to send the team link, then the{' '}
                                <Text style={styles.em}>pencil</Text> opens <Text style={styles.em}>Team settings</Text> (banner, fan/coach codes, privacy, social links).
                            </Text>
                            <Text style={styles.body}>
                                Scroll for roster and <Text style={styles.em}>Previous games</Text> — tap a row for History, box score, and the shareable match card.
                            </Text>
                            <Text style={styles.body}>
                                Start a live game from the <Text style={styles.em}>Teams</Text> tab (Record on this team) when you demo the scorer.
                            </Text>
                        </>
                    ) : (
                        <>
                            <Text style={styles.body}>
                                You're viewing this team as a <Text style={styles.em}>follower</Text> — the same experience as someone who joined with a fan code (no roster edits, no coach tools).
                            </Text>
                            <Text style={styles.body}>
                                Explore <Text style={styles.em}>schedule</Text>, <Text style={styles.em}>roster</Text>, and <Text style={styles.em}>past games</Text> to tell the story. The <Text style={styles.em}>Follow</Text> chip shows you're on their sideline.
                            </Text>
                            <Text style={styles.body}>
                                Compare with <Text style={styles.em}>University of Iowa</Text> on your account to show the full coach workflow side by side.
                            </Text>
                        </>
                    )}

                    <TouchableOpacity style={styles.primaryBtn} onPress={onDismiss} activeOpacity={0.85}>
                        <Text style={styles.primaryBtnText}>Got it</Text>
                    </TouchableOpacity>
                </View>
            </TouchableOpacity>
        </Modal>
    );
}

const getStyles = (colors: ThemeColors) => {
    const Typography = getTypography(colors);
    return StyleSheet.create({
        overlay: {
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'center',
            padding: Layout.padding,
        },
        card: {
            backgroundColor: colors.surface,
            borderRadius: Layout.radiusLg,
            padding: 22,
            borderWidth: 1,
            borderColor: colors.border,
            ...Layout.shadow,
            maxWidth: 420,
            alignSelf: 'center',
            width: '100%',
        },
        iconCircle: {
            width: 52,
            height: 52,
            borderRadius: 26,
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            alignSelf: 'center',
            marginBottom: 12,
        },
        title: {
            ...Typography.title,
            fontSize: 19,
            textAlign: 'center',
            marginBottom: 4,
        },
        teamName: {
            ...Typography.bodySmall,
            color: colors.primary,
            fontWeight: '700',
            textAlign: 'center',
            marginBottom: 14,
        },
        body: {
            ...Typography.bodySmall,
            color: colors.textSecondary,
            lineHeight: 20,
            marginBottom: 12,
        },
        em: { color: colors.text, fontWeight: '700' },
        primaryBtn: {
            backgroundColor: colors.primary,
            borderRadius: Layout.radiusMd,
            paddingVertical: 14,
            alignItems: 'center',
            marginTop: 8,
        },
        primaryBtnText: { ...Typography.button, color: colors.onPrimary },
    });
};
