import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getTypography, Layout } from '../theme/DesignSystem';
import { ThemeColors, useTheme } from '../theme/ThemeContext';

type Props = {
    visible: boolean;
    ourTeamName: string;
    opponentName: string;
    onDismiss: () => void;
    onContinue: () => void;
};

export default function DemoRecorderStartModal({ visible, ourTeamName, opponentName, onDismiss, onContinue }: Props) {
    const { colors } = useTheme();
    const styles = getStyles(colors);

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
            <View style={styles.overlay}>
                <View style={styles.card}>
                    <View style={styles.iconCircle}>
                        <Ionicons name="mic" size={26} color={colors.onPrimary} />
                    </View>
                    <Text style={styles.title}>How to record this demo</Text>
                    <Text style={styles.sub}>
                        {ourTeamName} vs {opponentName}
                    </Text>

                    <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
                        <Text style={styles.p}>
                            <Text style={styles.em}>Scoreboard:</Text> Use the goal buttons under each team when someone scores. Possession and the disc
                            chip at center show who has the disc.
                        </Text>
                        <Text style={styles.p}>
                            <Text style={styles.em}>Your roster:</Text> Tap a player, then use the action tiles (goal, assist, turnover, D, etc.). With{' '}
                            <Text style={styles.em}>Advanced tracking</Text> on, you can chain passes and time-of-possession.
                        </Text>
                        <Text style={styles.p}>
                            <Text style={styles.em}>Lineups:</Text> Between points, adjust who is on the line from the roster section (O-line / D-line
                            helpers if you have enough players tagged).
                        </Text>
                        <Text style={styles.p}>
                            <Text style={styles.em}>Clock & caps:</Text> The header shows match time. Soft/hard cap rules follow the minutes you set in
                            setup. <Text style={styles.em}>Timeout</Text> starts and ends from the control row.
                        </Text>
                        <Text style={styles.p}>
                            <Text style={styles.em}>Halftime:</Text> When you reach half, you can run the halftime timer from the prompt if you use it.
                        </Text>
                        <Text style={styles.p}>
                            <Text style={styles.em}>Finish:</Text> Tap <Text style={styles.em}>End match</Text> when the game is done (or to stop early).
                            You will get a post-game summary, history entry, and optional spirit scores if enabled.
                        </Text>
                        <Text style={styles.p}>
                            <Text style={styles.em}>Handoff:</Text> The radio icon in the header lets you delegate or share recording with another device
                            when you need a bench helper.
                        </Text>
                    </ScrollView>

                    <TouchableOpacity style={styles.primaryBtn} onPress={onContinue} activeOpacity={0.85}>
                        <Text style={styles.primaryBtnText}>Start recording</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.ghostBtn} onPress={onDismiss} activeOpacity={0.75}>
                        <Text style={styles.ghostBtnText}>Not now</Text>
                    </TouchableOpacity>
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
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'center',
            padding: Layout.padding,
        },
        card: {
            backgroundColor: colors.surface,
            borderRadius: Layout.radiusLg,
            padding: 20,
            borderWidth: 1,
            borderColor: colors.border,
            ...Layout.shadow,
            maxWidth: 440,
            width: '100%',
            alignSelf: 'center',
            maxHeight: '88%',
        },
        iconCircle: {
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            alignSelf: 'center',
            marginBottom: 10,
        },
        title: { ...Typography.title, fontSize: 18, textAlign: 'center', marginBottom: 4 },
        sub: {
            ...Typography.bodySmall,
            color: colors.primary,
            fontWeight: '700',
            textAlign: 'center',
            marginBottom: 12,
        },
        scroll: { maxHeight: 360, marginBottom: 12 },
        p: { ...Typography.bodySmall, color: colors.textSecondary, lineHeight: 20, marginBottom: 12 },
        em: { color: colors.text, fontWeight: '700' },
        primaryBtn: {
            backgroundColor: colors.primary,
            borderRadius: Layout.radiusMd,
            paddingVertical: 14,
            alignItems: 'center',
        },
        primaryBtnText: { ...Typography.button, color: colors.onPrimary },
        ghostBtn: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
        ghostBtnText: { ...Typography.button, color: colors.textSecondary, fontSize: 14 },
    });
};
