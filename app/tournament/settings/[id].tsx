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
    const [teamSelfServeEnabled, setTeamSelfServeEnabled] = useState(false);
    const [coachChatEnabled, setCoachChatEnabled] = useState(false);
    const [teamScoreSubmissionEnabled, setTeamScoreSubmissionEnabled] = useState(false);
    const [requireScoreVerification, setRequireScoreVerification] = useState(false);
    const [mandatorySpiritEnabled, setMandatorySpiritEnabled] = useState(false);
    const [misconductTrackingEnabled, setMisconductTrackingEnabled] = useState(true);
    const [playerClaimingEnabled, setPlayerClaimingEnabled] = useState(false);
    const [tradingCardsEnabled, setTradingCardsEnabled] = useState(true);
    const [lineCallAssistantEnabled, setLineCallAssistantEnabled] = useState(true);
    const [practiceKpiEnabled, setPracticeKpiEnabled] = useState(false);
    const [recapCardsEnabled, setRecapCardsEnabled] = useState(true);
    const [teamSpecificNotificationsEnabled, setTeamSpecificNotificationsEnabled] = useState(true);
    const [predictionEnabled, setPredictionEnabled] = useState(true);
    const [scoreChallengeWindowMinutes, setScoreChallengeWindowMinutes] = useState('15');
    const [publicBracketEnabled, setPublicBracketEnabled] = useState(true);
    const [publicRosterStatsEnabled, setPublicRosterStatsEnabled] = useState(true);
    const [fieldAssignmentPublic, setFieldAssignmentPublic] = useState(true);
    const [matchRoomMediaEnabled, setMatchRoomMediaEnabled] = useState(false);
    const [bracketPredictionEnabled, setBracketPredictionEnabled] = useState(true);
    const [spiritChampionBadgeEnabled, setSpiritChampionBadgeEnabled] = useState(true);
    const [tournamentPageDensity, setTournamentPageDensity] = useState<'compact' | 'comfortable'>('comfortable');
    const [recapCardStyle, setRecapCardStyle] = useState<'classic' | 'bold' | 'minimal'>('classic');
    const [coachChatVisibility, setCoachChatVisibility] = useState<'coaches_only' | 'td_visible'>('coaches_only');
    const [venueName, setVenueName] = useState('');
    const [venueAddress, setVenueAddress] = useState('');
    const [parkingInfo, setParkingInfo] = useState('');
    const [medicalInfo, setMedicalInfo] = useState('');
    const [weatherPolicy, setWeatherPolicy] = useState('');
    const [scheduleNotes, setScheduleNotes] = useState('');
    const [sponsorLine, setSponsorLine] = useState('');
    const [publicContactEmail, setPublicContactEmail] = useState('');

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
                setTeamSelfServeEnabled(data.teamSelfServeEnabled ?? data.enrollmentMode === 'open');
                setCoachChatEnabled(data.coachChatEnabled ?? data.enrollmentMode === 'open');
                setTeamScoreSubmissionEnabled(data.teamScoreSubmissionEnabled ?? data.enrollmentMode === 'open');
                setRequireScoreVerification(data.requireScoreVerification ?? data.enrollmentMode === 'open');
                setMandatorySpiritEnabled(data.mandatorySpiritEnabled ?? false);
                setMisconductTrackingEnabled(data.misconductTrackingEnabled ?? true);
                setPlayerClaimingEnabled(data.playerClaimingEnabled ?? false);
                setTradingCardsEnabled(data.tradingCardsEnabled ?? true);
                setLineCallAssistantEnabled(data.lineCallAssistantEnabled ?? true);
                setPracticeKpiEnabled(data.practiceKpiEnabled ?? false);
                setRecapCardsEnabled(data.recapCardsEnabled ?? true);
                setTeamSpecificNotificationsEnabled(data.teamSpecificNotificationsEnabled ?? true);
                setPredictionEnabled(data.predictionEnabled ?? true);
                setScoreChallengeWindowMinutes(data.scoreChallengeWindowMinutes ? String(data.scoreChallengeWindowMinutes) : '15');
                setPublicBracketEnabled(data.publicBracketEnabled ?? true);
                setPublicRosterStatsEnabled(data.publicRosterStatsEnabled ?? true);
                setFieldAssignmentPublic(data.fieldAssignmentPublic ?? true);
                setMatchRoomMediaEnabled(data.matchRoomMediaEnabled ?? false);
                setBracketPredictionEnabled(data.bracketPredictionEnabled ?? true);
                setSpiritChampionBadgeEnabled(data.spiritChampionBadgeEnabled ?? true);
                setTournamentPageDensity(data.tournamentPageDensity || 'comfortable');
                setRecapCardStyle(data.recapCardStyle || 'classic');
                setCoachChatVisibility(data.coachChatVisibility || 'coaches_only');
                setVenueName(data.venueName || '');
                setVenueAddress(data.venueAddress || '');
                setParkingInfo(data.parkingInfo || '');
                setMedicalInfo(data.medicalInfo || '');
                setWeatherPolicy(data.weatherPolicy || '');
                setScheduleNotes(data.scheduleNotes || '');
                setSponsorLine(data.sponsorLine || '');
                setPublicContactEmail(data.publicContactEmail || '');
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
                runMode: teamSelfServeEnabled ? 'team_self_serve' : 'manual',
                teamSelfServeEnabled,
                coachChatEnabled,
                teamScoreSubmissionEnabled,
                requireScoreVerification,
                scoreChallengeWindowMinutes: scoreChallengeWindowMinutes ? Number(scoreChallengeWindowMinutes) : 15,
                mandatorySpiritEnabled,
                spiritLeaderboardEnabled: true,
                misconductTrackingEnabled,
                playerClaimingEnabled,
                tradingCardsEnabled,
                lineCallAssistantEnabled,
                practiceKpiEnabled,
                recapCardsEnabled,
                teamSpecificNotificationsEnabled,
                predictionEnabled,
                publicBracketEnabled,
                publicRosterStatsEnabled,
                fieldAssignmentPublic,
                matchRoomMediaEnabled,
                bracketPredictionEnabled,
                spiritChampionBadgeEnabled,
                tournamentPageDensity,
                recapCardStyle,
                coachChatVisibility,
                venueName: venueName.trim(),
                venueAddress: venueAddress.trim(),
                parkingInfo: parkingInfo.trim(),
                medicalInfo: medicalInfo.trim(),
                weatherPolicy: weatherPolicy.trim(),
                scheduleNotes: scheduleNotes.trim(),
                sponsorLine: sponsorLine.trim(),
                publicContactEmail: publicContactEmail.trim(),
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

    const renderToggle = (
        label: string,
        description: string,
        value: boolean,
        onToggle: () => void
    ) => (
        <TouchableOpacity
            style={[styles.toggleRow, value && styles.toggleRowActive]}
            onPress={onToggle}
            activeOpacity={0.75}
        >
            <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>{label}</Text>
                <Text style={styles.toggleDescription}>{description}</Text>
            </View>
            <Ionicons name={value ? 'toggle' : 'toggle-outline'} size={30} color={value ? colors.primary : colors.textSecondary} />
        </TouchableOpacity>
    );

    const renderSegment = <T extends string>(
        label: string,
        value: T,
        options: { key: T; label: string }[],
        onChange: (value: T) => void
    ) => (
        <View style={styles.inputRow}>
            <Text style={styles.label}>{label}</Text>
            <View style={styles.segmentRow}>
                {options.map((option) => (
                    <TouchableOpacity
                        key={option.key}
                        style={[styles.segmentBtn, value === option.key && styles.segmentBtnActive]}
                        onPress={() => onChange(option.key)}
                        activeOpacity={0.8}
                    >
                        <Text style={[styles.segmentText, value === option.key && styles.segmentTextActive]}>{option.label}</Text>
                    </TouchableOpacity>
                ))}
            </View>
        </View>
    );

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
                    <Text style={styles.sectionTitle}>Tournament Logistics</Text>
                    <View style={styles.inputRow}>
                        <Text style={styles.label}>Venue Name</Text>
                        <TextInput style={styles.input} placeholder="e.g. Riverfront Sports Complex" placeholderTextColor={colors.textSecondary} value={venueName} onChangeText={setVenueName} />
                    </View>
                    <View style={styles.inputRow}>
                        <Text style={styles.label}>Venue Address</Text>
                        <TextInput style={styles.input} placeholder="Address or field map note" placeholderTextColor={colors.textSecondary} value={venueAddress} onChangeText={setVenueAddress} />
                    </View>
                    <View style={styles.inputRow}>
                        <Text style={styles.label}>Parking / Check-In</Text>
                        <TextInput style={[styles.input, { minHeight: 72 }]} multiline textAlignVertical="top" placeholder="Where coaches park, where teams check in, tent location..." placeholderTextColor={colors.textSecondary} value={parkingInfo} onChangeText={setParkingInfo} />
                    </View>
                    <View style={styles.inputRow}>
                        <Text style={styles.label}>Medical / Safety</Text>
                        <TextInput style={[styles.input, { minHeight: 72 }]} multiline textAlignVertical="top" placeholder="Trainer tent, emergency contact, lightning shelter..." placeholderTextColor={colors.textSecondary} value={medicalInfo} onChangeText={setMedicalInfo} />
                    </View>
                    <View style={styles.inputRow}>
                        <Text style={styles.label}>Weather Policy</Text>
                        <TextInput style={[styles.input, { minHeight: 72 }]} multiline textAlignVertical="top" placeholder="Delay rules, field closure policy, communication channel..." placeholderTextColor={colors.textSecondary} value={weatherPolicy} onChangeText={setWeatherPolicy} />
                    </View>
                    <View style={styles.inputRow}>
                        <Text style={styles.label}>Schedule Notes</Text>
                        <TextInput style={[styles.input, { minHeight: 72 }]} multiline textAlignVertical="top" placeholder="Observer notes, reseed timing, bracket release plans..." placeholderTextColor={colors.textSecondary} value={scheduleNotes} onChangeText={setScheduleNotes} />
                    </View>
                    <View style={styles.inputRow}>
                        <Text style={styles.label}>Sponsor / Event Line</Text>
                        <TextInput style={styles.input} placeholder="Presented by..." placeholderTextColor={colors.textSecondary} value={sponsorLine} onChangeText={setSponsorLine} />
                    </View>
                    <View style={styles.inputRow}>
                        <Text style={styles.label}>Public Contact Email</Text>
                        <TextInput style={styles.input} autoCapitalize="none" keyboardType="email-address" placeholder="td@example.com" placeholderTextColor={colors.textSecondary} value={publicContactEmail} onChangeText={setPublicContactEmail} />
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
                    <Text style={styles.sectionTitle}>Team-Run Tournament Systems</Text>
                    {renderToggle(
                        'Team Self-Serve Mode',
                        'Teams can use match rooms, start linked recordings, and submit scores themselves.',
                        teamSelfServeEnabled,
                        () => setTeamSelfServeEnabled(!teamSelfServeEnabled)
                    )}
                    {renderToggle(
                        'Coach Match Rooms',
                        'Creates a per-match coach chat for scheduling, field issues, and score discussion.',
                        coachChatEnabled,
                        () => setCoachChatEnabled(!coachChatEnabled)
                    )}
                    {renderToggle(
                        'Team Score Submission',
                        'Lets each side submit scores from their linked recorder flow.',
                        teamScoreSubmissionEnabled,
                        () => setTeamScoreSubmissionEnabled(!teamScoreSubmissionEnabled)
                    )}
                    {renderToggle(
                        'TD Score Verification',
                        'Holds conflicting or team-submitted scores for tournament director review.',
                        requireScoreVerification,
                        () => setRequireScoreVerification(!requireScoreVerification)
                    )}
                    <View style={styles.inputRow}>
                        <Text style={styles.label}>Score Challenge Window (Minutes)</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="15"
                            keyboardType="number-pad"
                            placeholderTextColor={colors.textSecondary}
                            value={scoreChallengeWindowMinutes}
                            onChangeText={setScoreChallengeWindowMinutes}
                        />
                    </View>
                    {renderToggle(
                        'Mandatory SOTG',
                        'Requires spirit submissions before team-run match scores can be treated as complete.',
                        mandatorySpiritEnabled,
                        () => setMandatorySpiritEnabled(!mandatorySpiritEnabled)
                    )}
                    {renderToggle(
                        'Misconduct / Card Tracking',
                        'Enables blue, yellow, and red card reports for TD review.',
                        misconductTrackingEnabled,
                        () => setMisconductTrackingEnabled(!misconductTrackingEnabled)
                    )}
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Engagement & Player Identity</Text>
                    {renderToggle(
                        'Player Claim Codes',
                        'Coaches can issue claim codes so players can verify roster links to their accounts.',
                        playerClaimingEnabled,
                        () => setPlayerClaimingEnabled(!playerClaimingEnabled)
                    )}
                    {renderToggle(
                        'Seasonal Trading Cards',
                        'Enables rarity cards, signature move badges, and shareable player identity surfaces.',
                        tradingCardsEnabled,
                        () => setTradingCardsEnabled(!tradingCardsEnabled)
                    )}
                    {renderToggle(
                        'Expanded Line Assistant',
                        'Keeps lineup recommendations and chemistry insights available during game setup.',
                        lineCallAssistantEnabled,
                        () => setLineCallAssistantEnabled(!lineCallAssistantEnabled)
                    )}
                    {renderToggle(
                        'Practice Drill KPIs',
                        'Allows tournament/team reports to suggest drills from tracked game weaknesses.',
                        practiceKpiEnabled,
                        () => setPracticeKpiEnabled(!practiceKpiEnabled)
                    )}
                    {renderToggle(
                        'Recap Cards',
                        'Enables shareable finals, upset, milestone, and player-of-the-match cards.',
                        recapCardsEnabled,
                        () => setRecapCardsEnabled(!recapCardsEnabled)
                    )}
                    {renderToggle(
                        'Team-Specific Notifications',
                        'Lets fans follow only selected teams for live alerts and milestones.',
                        teamSpecificNotificationsEnabled,
                        () => setTeamSpecificNotificationsEnabled(!teamSpecificNotificationsEnabled)
                    )}
                    {renderToggle(
                        'Fan Predictions',
                        'Shows prediction and win-swing features on live games when enabled.',
                        predictionEnabled,
                        () => setPredictionEnabled(!predictionEnabled)
                    )}
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Public Page Customization</Text>
                    {renderToggle(
                        'Public Bracket',
                        'Show bracket and elimination paths to spectators.',
                        publicBracketEnabled,
                        () => setPublicBracketEnabled(!publicBracketEnabled)
                    )}
                    {renderToggle(
                        'Public Roster Stats',
                        'Allow public tournament pages to show linked team/player stat previews.',
                        publicRosterStatsEnabled,
                        () => setPublicRosterStatsEnabled(!publicRosterStatsEnabled)
                    )}
                    {renderToggle(
                        'Public Field Assignments',
                        'Show field names and day labels on spectator match cards.',
                        fieldAssignmentPublic,
                        () => setFieldAssignmentPublic(!fieldAssignmentPublic)
                    )}
                    {renderToggle(
                        'Match Room Media',
                        'Allow coaches to attach stream links or media context inside match rooms.',
                        matchRoomMediaEnabled,
                        () => setMatchRoomMediaEnabled(!matchRoomMediaEnabled)
                    )}
                    {renderToggle(
                        'Bracket Predictions',
                        'Enable fans to predict bracket winners once seeds are published.',
                        bracketPredictionEnabled,
                        () => setBracketPredictionEnabled(!bracketPredictionEnabled)
                    )}
                    {renderToggle(
                        'Spirit Champion Badge',
                        'Show a Spirit Champion badge on the tournament page when SOTG is enabled.',
                        spiritChampionBadgeEnabled,
                        () => setSpiritChampionBadgeEnabled(!spiritChampionBadgeEnabled)
                    )}
                    {renderSegment('Page Density', tournamentPageDensity, [
                        { key: 'compact', label: 'Compact' },
                        { key: 'comfortable', label: 'Comfortable' },
                    ], setTournamentPageDensity)}
                    {renderSegment('Recap Card Style', recapCardStyle, [
                        { key: 'classic', label: 'Classic' },
                        { key: 'bold', label: 'Bold' },
                        { key: 'minimal', label: 'Minimal' },
                    ], setRecapCardStyle)}
                    {renderSegment('Coach Chat Visibility', coachChatVisibility, [
                        { key: 'coaches_only', label: 'Coaches Only' },
                        { key: 'td_visible', label: 'TD Visible' },
                    ], setCoachChatVisibility)}
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
        toggleRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            padding: 12,
            borderRadius: Layout.radiusMd,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.background,
        },
        toggleRowActive: {
            borderColor: colors.primary,
            backgroundColor: colors.primaryLight,
        },
        toggleLabel: {
            ...Typography.body,
            fontWeight: '700',
            color: colors.text,
        },
        toggleDescription: {
            ...Typography.bodySmall,
            color: colors.textSecondary,
            marginTop: 3,
        },
        segmentRow: {
            flexDirection: 'row',
            borderRadius: Layout.radiusSm,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: colors.border,
        },
        segmentBtn: {
            flex: 1,
            paddingVertical: 10,
            paddingHorizontal: 8,
            backgroundColor: colors.surfaceSecondary,
            alignItems: 'center',
        },
        segmentBtnActive: {
            backgroundColor: colors.primary,
        },
        segmentText: {
            ...Typography.bodySmall,
            color: colors.textSecondary,
            fontWeight: '700',
        },
        segmentTextActive: {
            color: colors.onPrimary,
        },
        label: {
            ...Typography.label,
            color: colors.textSecondary,
        },
        input: {
            ...Typography.body,
            backgroundColor: colors.background,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: Layout.radiusMd,
            padding: 12,
            color: colors.text,
        },
        dateBtn: {
            backgroundColor: colors.background,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: Layout.radiusMd,
            padding: 12,
        },
        dateBtnText: {
            ...Typography.body,
            color: colors.text,
        },
        uploadBtn: {
            backgroundColor: colors.surfaceSecondary,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: Layout.radiusSm,
            paddingHorizontal: 12,
            paddingVertical: 8,
        },
        uploadBtnText: {
            ...Typography.button,
            color: colors.primary,
            fontSize: 13,
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
