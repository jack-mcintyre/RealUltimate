import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ScrollView, Platform } from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../../../firebaseConfig';

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

    const [bio, setBio] = useState('');
    const [announcements, setAnnouncements] = useState('');
    const [logoUrl, setLogoUrl] = useState('');
    const [bannerUrl, setBannerUrl] = useState('');

    const [tiebreakerLogic, setTiebreakerLogic] = useState<'head_to_head' | 'point_diff'>('head_to_head');
    const [hardCapScore, setHardCapScore] = useState('');
    const [softCapTimeMinutes, setSoftCapTimeMinutes] = useState('');
    const [timeoutsPerHalf, setTimeoutsPerHalf] = useState('');
    const [liveScorePublic, setLiveScorePublic] = useState(true);

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
                setBio(data.bio || '');
                setAnnouncements(data.announcements || '');
                setLogoUrl(data.logoUrl || '');
                setBannerUrl(data.bannerUrl || '');
                setTiebreakerLogic(data.tiebreakerLogic || 'head_to_head');
                setHardCapScore(data.hardCapScore ? String(data.hardCapScore) : '');
                setSoftCapTimeMinutes(data.softCapTimeMinutes ? String(data.softCapTimeMinutes) : '');
                setTimeoutsPerHalf(data.timeoutsPerHalf ? String(data.timeoutsPerHalf) : '');
                setLiveScorePublic(data.liveScorePublic ?? true);
            } else if (data) {
                setTournament(data);
            }
        });
        return () => unsubscribe();
    }, [id]);

    const handleImagePick = async (type: 'logo' | 'banner') => {
        try {
            // Request permission first
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission Denied', 'We need access to your photo library to upload images.');
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: 'images',
                allowsEditing: true,
                aspect: type === 'logo' ? [1, 1] : [16, 9],
                quality: 0.7,
            });

            if (!result.canceled && result.assets[0]?.uri) {
                const uri = result.assets[0].uri;
                
                const response = await fetch(uri);
                const blob = await response.blob();
                const filename = `${tournament?.id}_${type}_${Date.now()}.jpg`;
                const sRef = storageRef(storage, `tournaments/${filename}`);
                
                await uploadBytes(sRef, blob);
                const downloadUrl = await getDownloadURL(sRef);
                
                if (type === 'logo') {
                    setLogoUrl(downloadUrl);
                } else {
                    setBannerUrl(downloadUrl);
                }
                Alert.alert('Success', `${type === 'logo' ? 'Logo' : 'Banner'} uploaded! Tap Save to apply.`);
            }
        } catch (error: any) {
            console.error('Image upload error:', error);
            Alert.alert('Upload Failed', error.message || 'Could not upload image. Check Firebase Storage rules or try again.');
        }
    };

    const handleSave = async () => {
        if (!tournament) return;
        try {
            await TournamentService.updateTournamentSettings(tournament.id, {
                name,
                hostName,
                startDate: startDate.toISOString().split('T')[0],
                endDate: endDate.toISOString().split('T')[0],
                enrollmentDeadline: enrollmentDeadline.toISOString().split('T')[0],
                bio,
                announcements,
                logoUrl,
                bannerUrl,
                tiebreakerLogic,
                hardCapScore: hardCapScore ? Number(hardCapScore) : undefined,
                softCapTimeMinutes: softCapTimeMinutes ? Number(softCapTimeMinutes) : undefined,
                timeoutsPerHalf: timeoutsPerHalf ? Number(timeoutsPerHalf) : undefined,
                liveScorePublic,
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
            <Stack.Screen options={{ headerShown: false }} />
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
                    <Text style={styles.sectionTitle}>Details</Text>
                    <View style={styles.inputRow}>
                        <Text style={styles.label}>Bio / Description</Text>
                        <TextInput 
                            style={[styles.input, { minHeight: 80 }]} 
                            multiline
                            textAlignVertical="top"
                            placeholder="Brief description of the tournament..." 
                            placeholderTextColor={colors.textSecondary} 
                            value={bio} 
                            onChangeText={setBio} 
                        />
                    </View>
                    <View style={styles.inputRow}>
                        <Text style={styles.label}>Announcements</Text>
                        <TextInput 
                            style={[styles.input, { minHeight: 80 }]} 
                            multiline
                            textAlignVertical="top"
                            placeholder="Important updates for teams and spectators..." 
                            placeholderTextColor={colors.textSecondary} 
                            value={announcements} 
                            onChangeText={setAnnouncements} 
                        />
                    </View>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Branding Images</Text>
                    <View style={styles.inputRow}>
                        <Text style={styles.label}>Logo</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            {logoUrl ? <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceSecondary, overflow: 'hidden' }}><Text style={{ color: colors.textSecondary, textAlign: 'center', lineHeight: 40, fontSize: 10 }}>IMG</Text></View> : null}
                            <TouchableOpacity style={styles.uploadBtn} onPress={() => handleImagePick('logo')}>
                                <Text style={styles.uploadBtnText}>{logoUrl ? 'Change Logo' : 'Upload Logo'}</Text>
                            </TouchableOpacity>
                            {logoUrl ? (
                                <TouchableOpacity onPress={() => setLogoUrl('')} style={{ padding: 8 }}>
                                    <Ionicons name="trash-outline" size={20} color="#FF3B30" />
                                </TouchableOpacity>
                            ) : null}
                        </View>
                    </View>
                    <View style={styles.inputRow}>
                        <Text style={styles.label}>Banner</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            {bannerUrl ? <View style={{ width: 60, height: 34, borderRadius: 4, backgroundColor: colors.surfaceSecondary, overflow: 'hidden' }}><Text style={{ color: colors.textSecondary, textAlign: 'center', lineHeight: 34, fontSize: 10 }}>IMG</Text></View> : null}
                            <TouchableOpacity style={styles.uploadBtn} onPress={() => handleImagePick('banner')}>
                                <Text style={styles.uploadBtnText}>{bannerUrl ? 'Change Banner' : 'Upload Banner'}</Text>
                            </TouchableOpacity>
                            {bannerUrl ? (
                                <TouchableOpacity onPress={() => setBannerUrl('')} style={{ padding: 8 }}>
                                    <Ionicons name="trash-outline" size={20} color="#FF3B30" />
                                </TouchableOpacity>
                            ) : null}
                        </View>
                    </View>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Rules & Game Settings</Text>
                    <View style={styles.inputRow}>
                        <Text style={styles.label}>Tiebreaker Logic</Text>
                        <View style={{ flexDirection: 'row', borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
                            <TouchableOpacity style={{ flex: 1, paddingVertical: 10, backgroundColor: tiebreakerLogic === 'head_to_head' ? colors.primary : colors.surfaceSecondary, alignItems: 'center' }} onPress={() => setTiebreakerLogic('head_to_head')}>
                                <Text style={{ fontSize: 13, fontWeight: '700', color: tiebreakerLogic === 'head_to_head' ? '#FFF' : colors.textSecondary }}>Head-to-Head</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={{ flex: 1, paddingVertical: 10, backgroundColor: tiebreakerLogic === 'point_diff' ? colors.primary : colors.surfaceSecondary, alignItems: 'center' }} onPress={() => setTiebreakerLogic('point_diff')}>
                                <Text style={{ fontSize: 13, fontWeight: '700', color: tiebreakerLogic === 'point_diff' ? '#FFF' : colors.textSecondary }}>Point Differential</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                    <View style={styles.inputRow}>
                        <Text style={styles.label}>Hard Cap Score</Text>
                        <TextInput 
                            style={styles.input} 
                            placeholder="15"
                            keyboardType="number-pad" 
                            placeholderTextColor={colors.textSecondary} 
                            value={hardCapScore} 
                            onChangeText={setHardCapScore} 
                        />
                    </View>
                    <View style={styles.inputRow}>
                        <Text style={styles.label}>Soft Cap Time (Minutes)</Text>
                        <TextInput 
                            style={styles.input} 
                            placeholder="90"
                            keyboardType="number-pad" 
                            placeholderTextColor={colors.textSecondary} 
                            value={softCapTimeMinutes} 
                            onChangeText={setSoftCapTimeMinutes} 
                        />
                    </View>
                    <View style={styles.inputRow}>
                        <Text style={styles.label}>Timeouts Per Half</Text>
                        <TextInput 
                            style={styles.input} 
                            placeholder="2"
                            keyboardType="number-pad" 
                            placeholderTextColor={colors.textSecondary} 
                            value={timeoutsPerHalf} 
                            onChangeText={setTimeoutsPerHalf} 
                        />
                    </View>
                    <View style={styles.inputRow}>
                        <Text style={styles.label}>Public Live Scores</Text>
                        <TouchableOpacity 
                            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: liveScorePublic ? colors.primary : colors.border, backgroundColor: liveScorePublic ? colors.primary : colors.surfaceSecondary }}
                            onPress={() => setLiveScorePublic(!liveScorePublic)}
                        >
                            <Text style={{ fontSize: 13, fontWeight: '700', color: liveScorePublic ? '#FFF' : colors.textSecondary }}>{liveScorePublic ? 'Visible to Spectators' : 'Hidden Until Verified'}</Text>
                        </TouchableOpacity>
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
