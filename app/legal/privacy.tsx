import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getTypography, Layout } from '../theme/DesignSystem';
import { ThemeColors, useTheme } from '../theme/ThemeContext';

export default function PrivacyPolicyScreen() {
    const { colors } = useTheme();
    const styles = getStyles(colors);

    return (
        <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 48 }}>
            <View style={styles.topAppBar}>
                <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.topAppBarTitle}>Privacy Policy</Text>
                <View style={{ width: 40 }} />
            </View>
            <View style={styles.content}>
                <Text style={styles.updated}>Draft for launch review • May 2026</Text>
                <Text style={styles.heading}>What RealUltimate collects</Text>
                <Text style={styles.body}>We collect account information, team memberships, roster information, game events, tournament entries, optional profile content, device tokens for notifications, and trust/safety reports submitted in the app.</Text>
                <Text style={styles.heading}>How it is used</Text>
                <Text style={styles.body}>Data is used to run live scoring, team pages, tournament standings, player stats, notifications, player claiming, moderation, support, and product reliability.</Text>
                <Text style={styles.heading}>User-generated content</Text>
                <Text style={styles.body}>Team pages, match rooms, roster profiles, tournament reports, media links, reactions, and public profile fields may be visible to other authenticated users depending on team and tournament settings.</Text>
                <Text style={styles.heading}>Deletion</Text>
                <Text style={styles.body}>Users can request deletion in Profile → Account Details. The app disables notification preferences, clears device tokens, anonymizes the profile, and requests Firebase Auth deletion. Some team/game/tournament records may remain where needed for shared score history, audit logs, or tournament integrity.</Text>
                <Text style={styles.heading}>Contact</Text>
                <Text style={styles.body}>For privacy requests, contact support@realultimate.app. Replace this draft with the final reviewed policy before App Store submission.</Text>
            </View>
        </ScrollView>
    );
}

const getStyles = (colors: ThemeColors) => {
    const Typography = getTypography(colors);
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        topAppBar: { height: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Layout.padding, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
        backButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
        topAppBarTitle: { ...Typography.title, fontSize: 18, color: colors.text },
        content: { padding: Layout.padding, gap: 12 },
        updated: { ...Typography.bodySmall, color: colors.textSecondary, marginBottom: 8 },
        heading: { ...Typography.subtitle, color: colors.text, marginTop: 8 },
        body: { ...Typography.body, color: colors.textSecondary, lineHeight: 22 },
    });
};
