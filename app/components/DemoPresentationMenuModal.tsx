import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getTypography, Layout } from '../theme/DesignSystem';
import { ThemeColors, useTheme } from '../theme/ThemeContext';

type Step = 'menu' | 'confirmLoad' | 'confirmAdd';

export type DemoPresentationMenuModalProps = {
    visible: boolean;
    onClose: () => void;
    demoPackInstalled: boolean;
    isSeeding: boolean;
    onOpenTour: () => void;
    onLoadSampleData: () => void;
    onAddAnotherSet: () => void;
};

export default function DemoPresentationMenuModal({
    visible,
    onClose,
    demoPackInstalled,
    isSeeding,
    onOpenTour,
    onLoadSampleData,
    onAddAnotherSet,
}: DemoPresentationMenuModalProps) {
    const { colors } = useTheme();
    const styles = getStyles(colors);
    const [step, setStep] = useState<Step>('menu');

    useEffect(() => {
        if (visible) setStep('menu');
    }, [visible]);

    const closeIfIdle = () => {
        if (isSeeding) return;
        onClose();
    };

    const handleOpenTour = () => {
        onOpenTour();
        onClose();
    };

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={closeIfIdle}>
            <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={closeIfIdle}>
                <View style={styles.card} onStartShouldSetResponder={() => true}>
                    {step === 'menu' ? (
                        <>
                            <Text style={styles.title}>Demo Presentation - Modern Marvels</Text>
                            <Text style={styles.sub}>
                                Iowa showcase: University of Iowa (your coached team) and Iowa State (followed). Three finished games, schedules, and a
                                one-time hint on each team page.
                            </Text>

                            <TouchableOpacity style={styles.primaryBtn} onPress={handleOpenTour} disabled={isSeeding} activeOpacity={0.85}>
                                <Ionicons name="map-outline" size={20} color={colors.onPrimary} />
                                <Text style={styles.primaryBtnText}>Open guided tour</Text>
                            </TouchableOpacity>

                            {!demoPackInstalled ? (
                                <TouchableOpacity
                                    style={styles.secondaryBtn}
                                    onPress={() => setStep('confirmLoad')}
                                    disabled={isSeeding}
                                    activeOpacity={0.85}
                                >
                                    <Ionicons name="download-outline" size={18} color={colors.primary} />
                                    <Text style={styles.secondaryBtnText}>Load Iowa sample data</Text>
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity
                                    style={styles.secondaryBtn}
                                    onPress={() => setStep('confirmAdd')}
                                    disabled={isSeeding}
                                    activeOpacity={0.85}
                                >
                                    <Ionicons name="duplicate-outline" size={18} color={colors.primary} />
                                    <Text style={styles.secondaryBtnText}>Add another showcase set</Text>
                                </TouchableOpacity>
                            )}

                            <TouchableOpacity style={styles.ghostBtn} onPress={closeIfIdle} disabled={isSeeding}>
                                <Text style={styles.ghostBtnText}>Close</Text>
                            </TouchableOpacity>
                        </>
                    ) : step === 'confirmLoad' ? (
                        <>
                            <Text style={styles.title}>Load sample data?</Text>
                            <Text style={styles.sub}>
                                Adds University of Iowa (coach) and Iowa State (followed) with rosters, three finished Hawkeyes vs Cyclones games
                                (full event history), and future matches on the schedule.
                            </Text>
                            <View style={styles.confirmRow}>
                                <TouchableOpacity style={styles.ghostBtnFlex} onPress={() => setStep('menu')} disabled={isSeeding}>
                                    <Text style={styles.ghostBtnText}>Back</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.primaryBtnFlex, isSeeding && { opacity: 0.85 }]}
                                    onPress={onLoadSampleData}
                                    disabled={isSeeding}
                                    activeOpacity={0.85}
                                >
                                    {isSeeding ? (
                                        <ActivityIndicator color={colors.onPrimary} />
                                    ) : (
                                        <Text style={styles.primaryBtnText}>Load</Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </>
                    ) : (
                        <>
                            <Text style={styles.title}>Add another set?</Text>
                            <Text style={styles.sub}>Creates two additional teams, games, and a scheduled match.</Text>
                            <View style={styles.confirmRow}>
                                <TouchableOpacity style={styles.ghostBtnFlex} onPress={() => setStep('menu')} disabled={isSeeding}>
                                    <Text style={styles.ghostBtnText}>Back</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.primaryBtnFlex, isSeeding && { opacity: 0.85 }]}
                                    onPress={onAddAnotherSet}
                                    disabled={isSeeding}
                                    activeOpacity={0.85}
                                >
                                    {isSeeding ? (
                                        <ActivityIndicator color={colors.onPrimary} />
                                    ) : (
                                        <Text style={styles.primaryBtnText}>Add</Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </>
                    )}
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
            alignItems: 'center',
            padding: Layout.padding,
        },
        card: {
            width: '100%',
            maxWidth: 400,
            backgroundColor: colors.surface,
            borderRadius: Layout.radiusLg,
            padding: 24,
            borderWidth: 1,
            borderColor: colors.border,
            ...Layout.shadow,
        },
        title: {
            ...Typography.title,
            fontSize: 20,
            textAlign: 'center',
            marginBottom: 8,
        },
        sub: {
            ...Typography.bodySmall,
            color: colors.textSecondary,
            textAlign: 'center',
            marginBottom: 22,
            lineHeight: 20,
        },
        primaryBtn: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            backgroundColor: colors.primary,
            borderRadius: Layout.radiusMd,
            paddingVertical: 14,
            marginBottom: 10,
        },
        primaryBtnText: {
            ...Typography.button,
            color: colors.onPrimary,
        },
        secondaryBtn: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            borderWidth: 1,
            borderColor: colors.primary,
            backgroundColor: colors.primaryLight,
            borderRadius: Layout.radiusMd,
            paddingVertical: 12,
            marginBottom: 10,
        },
        secondaryBtnText: {
            ...Typography.button,
            color: colors.primary,
            fontSize: 15,
        },
        ghostBtn: {
            alignItems: 'center',
            paddingVertical: 12,
            marginTop: 4,
        },
        ghostBtnText: {
            ...Typography.button,
            color: colors.textSecondary,
        },
        confirmRow: {
            flexDirection: 'row',
            gap: 12,
            marginTop: 8,
        },
        ghostBtnFlex: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 14,
            borderRadius: Layout.radiusMd,
            borderWidth: 1,
            borderColor: colors.border,
        },
        primaryBtnFlex: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 14,
            borderRadius: Layout.radiusMd,
            backgroundColor: colors.primary,
        },
    });
};
