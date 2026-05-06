import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getTypography, Layout } from '../theme/DesignSystem';
import { ThemeColors, useTheme } from '../theme/ThemeContext';

export default function TermsOfServiceScreen() {
    const { colors } = useTheme();
    const styles = getStyles(colors);

    return (
        <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 48 }}>
            <View style={styles.topAppBar}>
                <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.topAppBarTitle}>Terms of Service</Text>
                <View style={{ width: 40 }} />
            </View>
            <View style={styles.content}>
                <Text style={styles.updated}>Draft for launch review • May 2026</Text>
                <Text style={styles.heading}>Use of RealUltimate</Text>
                <Text style={styles.body}>RealUltimate is for tracking ultimate frisbee teams, games, tournaments, and public team content. Users are responsible for the accuracy and legality of the content they submit.</Text>
                <Text style={styles.heading}>Safety and moderation</Text>
                <Text style={styles.body}>Do not post harassment, threats, impersonation, private information, spam, or illegal content. RealUltimate may remove content, limit access, or preserve reports needed for safety review.</Text>
                <Text style={styles.heading}>Stats and shared records</Text>
                <Text style={styles.body}>Game and tournament records may be shared between teams and tournament directors. Deleting an account does not necessarily remove historical game results that involve other teams.</Text>
                <Text style={styles.heading}>No professional advice</Text>
                <Text style={styles.body}>Analytics, lineup suggestions, win probability, and practice recommendations are informational tools for coaches and players. They are not medical, legal, or professional advice.</Text>
                <Text style={styles.heading}>Launch note</Text>
                <Text style={styles.body}>This is a product draft and should be reviewed before submission. Add your final company/operator details, governing law, subscription terms if any, and age policy before release.</Text>
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
