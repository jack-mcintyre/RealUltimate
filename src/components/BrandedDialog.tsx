import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Layout, getTypography } from '../../app/theme/DesignSystem';
import { ThemeColors } from '../../app/theme/ThemeContext';

type BrandedDialogProps = {
    visible: boolean;
    title: string;
    message: string;
    colors: ThemeColors;
    icon?: keyof typeof Ionicons.glyphMap;
    accentColor?: string;
    primaryLabel?: string;
    onPrimary: () => void;
    secondaryLabel?: string;
    onSecondary?: () => void;
    dismissOnBackdrop?: boolean;
};

export default function BrandedDialog({
    visible,
    title,
    message,
    colors,
    icon = 'sparkles-outline',
    accentColor,
    primaryLabel = 'Got it',
    onPrimary,
    secondaryLabel,
    onSecondary,
    dismissOnBackdrop = true,
}: BrandedDialogProps) {
    const scaleAnim = useRef(new Animated.Value(0.9)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;
    const accent = accentColor || colors.primary;

    useEffect(() => {
        if (!visible) return;
        scaleAnim.setValue(0.9);
        opacityAnim.setValue(0);
        Animated.parallel([
            Animated.timing(opacityAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
            Animated.spring(scaleAnim, { toValue: 1, friction: 7, tension: 95, useNativeDriver: true }),
        ]).start();
    }, [visible, opacityAnim, scaleAnim]);

    return (
        <Modal visible={visible} transparent animationType="none" onRequestClose={onPrimary}>
            <Pressable
                style={styles.overlay}
                onPress={dismissOnBackdrop ? onPrimary : undefined}
            >
                <Animated.View
                    style={[
                        styles.card,
                        {
                            opacity: opacityAnim,
                            transform: [{ scale: scaleAnim }],
                            backgroundColor: colors.surface,
                            borderColor: colors.border,
                        },
                    ]}
                >
                    <View style={[styles.iconWrap, { backgroundColor: colors.surfaceSecondary, borderColor: accent }]}> 
                        <Ionicons name={icon} size={20} color={accent} />
                    </View>
                    <Text style={[getTypography(colors).title, styles.title]}>{title}</Text>
                    <Text style={[getTypography(colors).body, styles.message, { color: colors.textSecondary }]}>{message}</Text>

                    <View style={styles.actionsRow}>
                        {!!secondaryLabel && !!onSecondary && (
                            <Pressable
                                style={[styles.btn, styles.btnGhost, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}
                                onPress={onSecondary}
                            >
                                <Text style={[getTypography(colors).button, { color: colors.textSecondary }]}>{secondaryLabel}</Text>
                            </Pressable>
                        )}
                        <Pressable
                            style={[styles.btn, styles.btnPrimary, { backgroundColor: accent, borderColor: accent }]}
                            onPress={onPrimary}
                        >
                            <Text style={[getTypography(colors).button, { color: colors.onPrimary }]}>{primaryLabel}</Text>
                        </Pressable>
                    </View>
                </Animated.View>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(6, 12, 22, 0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    card: {
        width: '100%',
        maxWidth: 430,
        borderRadius: Layout.radiusLg,
        borderWidth: 1,
        padding: 18,
        alignItems: 'center',
        ...Layout.shadow,
    },
    iconWrap: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        marginBottom: 10,
    },
    title: {
        fontSize: 20,
        textAlign: 'center',
        marginBottom: 8,
    },
    message: {
        textAlign: 'center',
        lineHeight: 21,
        marginBottom: 14,
    },
    actionsRow: {
        width: '100%',
        flexDirection: 'row',
        gap: 10,
    },
    btn: {
        flex: 1,
        borderRadius: Layout.radiusMd,
        borderWidth: 1,
        paddingVertical: 11,
        alignItems: 'center',
        justifyContent: 'center',
    },
    btnGhost: {},
    btnPrimary: {},
});
