import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ScrollView, Platform } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';

import { TournamentService } from '../../services/TournamentService';
import { Tournament } from '../../services/types';
import { ThemeColors, useTheme } from '../../theme/ThemeContext';
import { getTypography, Layout } from '../../theme/DesignSystem';

export default function TournamentSettingsScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { colors } = useTheme();
    const styles = getStyles(colors);

    const [tournament, setTournament] = useState<Tournament | null>(null);
    const [name, setName] = useState('');
    const [hostName, setHostName] = useState('');
    const [startDate, setStartDate] = useState(new Date());
    const [endDate, setEndDate] = useState(new Date());
    const [enrollmentDeadline, setEnrollmentDeadline] = useState(new Date());

    const [showStartDatePicker, setShowStartDatePicker] = useState(false);
    const [showEndDatePicker, setShowEndDatePicker] = useState(false);
    const [showEnrollmentDatePicker, setShowEnrollmentDatePicker] = useState(false);

    useEffect(() => {
        if (!id) return;
        const unsubscribe = TournamentService.subscribeToTournament(id, (data) => {
            if (data && !tournament) {
                setTournament(data);
                setName(data.name || '');
                setHostName(data.hostName || '');
                if (data.startDate) setStartDate(new Date(data.startDate));
                if (data.endDate) setEndDate(new Date(data.endDate));
                if (data.enrollmentDeadline) setEnrollmentDeadline(new Date(data.enrollmentDeadline));
            } else if (data) {
                setTournament(data);
            }
        });
        return () => unsubscribe();
    }, [id]);

    const handleSave = async () => {
        if (!tournament) return;
        try {
            await TournamentService.updateTournamentSettings(tournament.id, {
                name,
                hostName,
                startDate: startDate.toISOString().split('T')[0],
                endDate: endDate.toISOString().split('T')[0],
                enrollmentDeadline: enrollmentDeadline.toISOString().split('T')[0],
            });
            router.back();
        } catch (error: any) {
            Alert.alert('Error', error.message);
        }
    };

    const handleDelete = () => {
        Alert.alert('Delete Tournament', 'Are you sure you want to permanently delete this tournament?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: async () => {
                if (tournament) {
                    await TournamentService.deleteTournament(tournament.id);
                    router.replace('/(tabs)/tournaments');
                }
            }}
        ]);
    };

    const renderDatePicker = (
        label: string, 
        date: Date, 
        show: boolean, 
        setShow: (val: boolean) => void, 
        onChange: (event: any, selectedDate?: Date) => void
    ) => {
        return (
            <View style={styles.inputRow}>
                <Text style={styles.label}>{label}</Text>
                {Platform.OS === 'web' ? (
                    <input 
                        type="date" 
                        value={date.toISOString().split('T')[0]} 
                        onChange={(e) => onChange(null, new Date(e.target.value))}
                        style={{ padding: 8, borderRadius: 8, border: `1px solid ${colors.border}`, backgroundColor: colors.surface, color: colors.text, width: 150 }}
                    />
                ) : (
                    <>
                        <TouchableOpacity style={styles.dateBtn} onPress={() => setShow(true)}>
                            <Text style={styles.dateBtnText}>{date.toLocaleDateString()}</Text>
                        </TouchableOpacity>
                        {show && (
                            <DateTimePicker
                                value={date}
                                mode="date"
                                display="default"
                                onChange={(event, selectedDate) => {
                                    setShow(false);
                                    if (selectedDate) onChange(event, selectedDate);
                                }}
                            />
                        )}
                    </>
                )}
            </View>
        );
    };

    if (!tournament) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={{ color: colors.text }}>Loading...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                    <Ionicons name="chevron-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Tournament Settings</Text>
                <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                    <Text style={styles.saveBtnText}>Save</Text>
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                <View style={styles.section}>
                    <View style={styles.inputRow}>
                        <Text style={styles.label}>Name</Text>
                        <TextInput 
                            style={styles.input} 
                            value={name} 
                            onChangeText={setName} 
                        />
                    </View>
                    <View style={styles.inputRow}>
                        <Text style={styles.label}>Organizer</Text>
                        <TextInput 
                            style={styles.input} 
                            placeholder="Independent" 
                            placeholderTextColor={colors.textSecondary} 
                            value={hostName} 
                            onChangeText={setHostName} 
                        />
                    </View>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Scheduling</Text>
                    {renderDatePicker('Start Date', startDate, showStartDatePicker, setShowStartDatePicker, (e, d) => d && setStartDate(d))}
                    {renderDatePicker('End Date', endDate, showEndDatePicker, setShowEndDatePicker, (e, d) => d && setEndDate(d))}
                    {renderDatePicker('Join Deadline', enrollmentDeadline, showEnrollmentDatePicker, setShowEnrollmentDatePicker, (e, d) => d && setEnrollmentDeadline(d))}
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Access Codes</Text>
                    <View style={styles.codeRow}>
                        <Text style={styles.label}>Spectator Join Code</Text>
                        <View style={styles.codeBox}>
                            <Text style={styles.codeText}>{tournament.joinCode || 'Public'}</Text>
                        </View>
                    </View>
                    <View style={styles.codeRow}>
                        <Text style={styles.label}>Admin Access Code</Text>
                        <View style={styles.codeBox}>
                            <Text style={styles.codeText}>{tournament.adminCode || 'N/A'}</Text>
                        </View>
                    </View>
                </View>

                <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
                    <Ionicons name="trash-outline" size={20} color="#FFF" />
                    <Text style={styles.deleteBtnText}>Delete Tournament</Text>
                </TouchableOpacity>
            </ScrollView>
        </View>
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
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: 50,
            paddingBottom: 16,
            paddingHorizontal: 16,
            backgroundColor: colors.surface,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
        },
        backBtn: {
            padding: 4,
        },
        headerTitle: {
            ...Typography.title,
            fontSize: 20,
        },
        saveBtn: {
            paddingHorizontal: 16,
            paddingVertical: 8,
            backgroundColor: colors.primary,
            borderRadius: Layout.radiusSm,
        },
        saveBtnText: {
            ...Typography.button,
            color: colors.onPrimary,
        },
        content: {
            padding: 16,
            gap: 24,
        },
        section: {
            backgroundColor: colors.surface,
            borderRadius: Layout.radiusLg,
            padding: 16,
            gap: 16,
            borderWidth: 1,
            borderColor: colors.border,
        },
        sectionTitle: {
            ...Typography.subtitle,
            color: colors.textSecondary,
            marginBottom: 4,
        },
        inputRow: {
            gap: 8,
        },
        label: {
            ...Typography.label,
            color: colors.textSecondary,
        },
        input: {
            backgroundColor: colors.background,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: Layout.radiusMd,
            padding: 12,
            color: colors.text,
            ...Typography.body,
        },
        dateBtn: {
            backgroundColor: colors.background,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: Layout.radiusMd,
            padding: 12,
        },
        dateBtnText: {
            color: colors.text,
            ...Typography.body,
        },
        codeRow: {
            gap: 8,
        },
        codeBox: {
            backgroundColor: colors.background,
            padding: 12,
            borderRadius: Layout.radiusMd,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
        },
        codeText: {
            ...Typography.mono,
            fontSize: 18,
            letterSpacing: 2,
            color: colors.text,
        },
        deleteBtn: {
            flexDirection: 'row',
            backgroundColor: '#FF3B30',
            padding: 16,
            borderRadius: Layout.radiusMd,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            marginTop: 8,
            marginBottom: 32,
        },
        deleteBtnText: {
            ...Typography.button,
            color: '#FFF',
        },
    });
};
