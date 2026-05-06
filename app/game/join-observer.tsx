import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ObserverSessionService } from '../services/ObserverSessionService';
import { getTypography, Layout } from '../theme/DesignSystem';
import { useTheme } from '../theme/ThemeContext';

export default function JoinObserverScreen() {
    const { colors } = useTheme();
    const styles = getStyles(colors);
    const [pin, setPin] = useState('');
    const [isJoining, setIsJoining] = useState(false);

    const handleJoin = async () => {
        try {
            setIsJoining(true);
            const { session } = await ObserverSessionService.joinByPin(pin);
            router.replace({
                pathname: '/game/record/[teamId]',
                params: { teamId: 'dual_observer', dualGameId: session.gameId },
            } as any);
        } catch (error: any) {
            Alert.alert('Could not join', error?.message || 'Check the PIN and try again.');
        } finally {
            setIsJoining(false);
        }
    };

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.root}>
            <View style={styles.topBar}>
                <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.75}>
                    <Ionicons name="arrow-back" size={22} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.topTitle}>Join Observer Session</Text>
                <View style={{ width: 40 }} />
            </View>

            <View style={styles.content}>
                <View style={styles.iconCircle}>
                    <Ionicons name="keypad-outline" size={34} color={colors.onPrimary} />
                </View>
                <Text style={styles.kicker}>NO ACCOUNT REQUIRED</Text>
                <Text style={styles.title}>{"Enter the coach's observer PIN"}</Text>
                <Text style={styles.copy}>
                    {"We'll sign this device in anonymously, lock recording to this game, and mark your events as unverified until the coach finalizes."}
                </Text>

                <TextInput
                    style={styles.pinInput}
                    value={pin}
                    onChangeText={(value) => setPin(value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    placeholderTextColor={colors.textSecondary}
                    keyboardType="number-pad"
                    maxLength={6}
                />

                <TouchableOpacity
                    style={[styles.joinBtn, { opacity: pin.length === 6 && !isJoining ? 1 : 0.6 }]}
                    onPress={handleJoin}
                    disabled={pin.length !== 6 || isJoining}
                    activeOpacity={0.85}
                >
                    <Ionicons name="radio-outline" size={19} color={colors.onPrimary} />
                    <Text style={styles.joinBtnText}>{isJoining ? 'Joining...' : 'Start Recording'}</Text>
                </TouchableOpacity>

                <Text style={styles.footnote}>
                    Ask the coach for the 6-digit observer PIN shown in their recorder options.
                </Text>
            </View>
        </KeyboardAvoidingView>
    );
}

const getStyles = (colors: ReturnType<typeof useTheme>['colors']) => {
    const Typography = getTypography(colors);
    return StyleSheet.create({
        root: { flex: 1, backgroundColor: colors.background },
        topBar: { height: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Layout.padding, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
        backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
        topTitle: { ...Typography.title, fontSize: 18, flex: 1, textAlign: 'center' },
        content: { flex: 1, padding: Layout.padding, justifyContent: 'center' },
        iconCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.live, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
        kicker: { ...Typography.label, color: colors.live, marginBottom: 8, letterSpacing: 1.5 },
        title: { ...Typography.title, fontSize: 28, lineHeight: 32, marginBottom: 10 },
        copy: { ...Typography.bodySmall, color: colors.textSecondary, lineHeight: 20, marginBottom: 24 },
        pinInput: { ...Typography.title, fontSize: 32, letterSpacing: 10, textAlign: 'center', color: colors.text, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: Layout.radiusLg, paddingVertical: 16, paddingHorizontal: 12, marginBottom: 14 },
        joinBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: Layout.radiusMd, paddingVertical: 15, marginBottom: 14 },
        joinBtnText: { ...Typography.button, color: colors.onPrimary },
        footnote: { ...Typography.caption, color: colors.textSecondary, textAlign: 'center', lineHeight: 17 },
    });
};
