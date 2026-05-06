import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth } from '../../../firebaseConfig';
import ImageCropperModal from '../../../src/components/ImageCropperModal';
import { ensureHttps, isHttpUrl, isVerifiedMediaLink, isVerifiedSocialLink } from '../../services/linkUtils';
import { TeamService } from '../../services/TeamService';
import { SocialLinks, Team, TeamJoinCodes, TeamMediaItem, TeamPageConfig } from '../../services/types';
import { getTypography, Layout } from '../../theme/DesignSystem';
import { ThemeColors, useTheme } from '../../theme/ThemeContext';

const MAX_IMAGE_DATA_URL_LENGTH = 1_900_000;
const ACCENT_PRESETS = ['#1877F2', '#FF0000', '#E4405F', '#000000', '#25D366', '#0A66C2', '#5865F2', '#FFFC00', '#FF4500', '#1DA1F2'];

type MediaType = 'image' | 'youtube' | 'link';

export default function TeamEditPageScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { colors } = useTheme();
    const styles = getStyles(colors);

    const [team, setTeam] = useState<Team | null>(null);
    const [joinCodes, setJoinCodes] = useState<TeamJoinCodes | null>(null);
    const [isHydrated, setIsHydrated] = useState(false);

    const [avatarUrl, setAvatarUrl] = useState('');
    const [bannerUrl, setBannerUrl] = useState('');
    const [bio, setBio] = useState('');
    const [coachDisplayName, setCoachDisplayName] = useState('');

    const [isPublic, setIsPublic] = useState(true);
    const [advancedStatsPublic, setAdvancedStatsPublic] = useState(true);
    const [mediaPublic, setMediaPublic] = useState(true);
    const [showCoachCode, setShowCoachCode] = useState(false);
    const [showFanCode, setShowFanCode] = useState(false);
    const [showFanCount, setShowFanCount] = useState(true);

    const [socialLinks, setSocialLinks] = useState<SocialLinks>({});
    const [mediaItems, setMediaItems] = useState<TeamMediaItem[]>([]);
    const [accentColor, setAccentColor] = useState('');
    const [announcementText, setAnnouncementText] = useState('');
    const [announcementUntil, setAnnouncementUntil] = useState('');

    const [mediaTitle, setMediaTitle] = useState('');
    const [mediaUrl, setMediaUrl] = useState('');
    const [mediaType, setMediaType] = useState<MediaType>('image');

    const [isSaving, setIsSaving] = useState(false);
    const [isObserverCodeBusy, setIsObserverCodeBusy] = useState(false);
    const [errorText, setErrorText] = useState('');
    const [showSavedToast, setShowSavedToast] = useState(false);
    const [cropTarget, setCropTarget] = useState<{
        uri: string;
        width: number;
        height: number;
        target: 'avatar' | 'banner';
    } | null>(null);
    const hideToastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!id) return;
        const unsubTeam = TeamService.subscribeToTeam(id, (nextTeam) => setTeam(nextTeam));
        const unsubCodes = TeamService.subscribeToTeamJoinCodes(id, (codes) => setJoinCodes(codes));
        return () => {
            unsubTeam();
            unsubCodes();
        };
    }, [id]);

    useEffect(() => {
        if (!team || isHydrated) return;

        const pageConfig = team.pageConfig || {};
        const branding = pageConfig.branding || {};
        const settings = pageConfig.settings || {
            isPublic: true,
            advancedStatsPublic: true,
            mediaPublic: true,
        };

        setAvatarUrl(branding.avatarUrl || '');
        setBannerUrl(branding.bannerUrl || '');
        setBio(branding.bio || '');
        setCoachDisplayName((branding.coachDisplayName || '').trim());

        setIsPublic(settings.isPublic ?? true);
        setAdvancedStatsPublic(settings.advancedStatsPublic ?? true);
        setMediaPublic(settings.mediaPublic ?? true);
        setShowCoachCode(settings.showCoachCode ?? false);
        setShowFanCode(settings.showFanCode ?? false);
        setShowFanCount(settings.showFanCount ?? true);

        setSocialLinks({ ...(pageConfig.socialLinks || {}) });
        setMediaItems([...(pageConfig.media || [])]);
        const nextAccent = pageConfig.theme?.accentColor || '';
        setAccentColor(ACCENT_PRESETS.includes(nextAccent) ? nextAccent : ACCENT_PRESETS[0]);
        setAnnouncementText(pageConfig.announcement?.message || '');
        if (typeof pageConfig.announcement?.expiresAt === 'number') {
            setAnnouncementUntil(new Date(pageConfig.announcement.expiresAt).toISOString().slice(0, 10));
        }
        setIsHydrated(true);
    }, [team, isHydrated]);

    useEffect(() => {
        return () => {
            if (hideToastTimeoutRef.current) {
                clearTimeout(hideToastTimeoutRef.current);
            }
        };
    }, []);

    const canEdit = useMemo(() => {
        const uid = auth.currentUser?.uid;
        if (!uid || !team) return false;
        return uid === team.coachId || !!team.managers?.[uid];
    }, [team]);

    const setSocial = (key: keyof SocialLinks, value: string) => {
        setSocialLinks((prev) => ({ ...prev, [key]: value }));
    };

    const pickImageForCrop = async (targetType: 'avatar' | 'banner') => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: false,
            quality: 1,
        });

        if (result.canceled || !result.assets?.[0]) return;
        const asset = result.assets[0];
        if (!asset.uri) throw new Error('Image URI not available');

        setCropTarget({
            uri: asset.uri,
            width: asset.width || 1000,
            height: asset.height || 1000,
            target: targetType,
        });
    };

    const handlePickAvatar = async () => {
        try {
            await pickImageForCrop('avatar');
        } catch (error: any) {
            setErrorText(error?.message || 'Could not pick image.');
        }
    };

    const handlePickBanner = async () => {
        try {
            await pickImageForCrop('banner');
        } catch (error: any) {
            setErrorText(error?.message || 'Could not pick image.');
        }
    };

    const handleCropConfirm = (dataUrl: string) => {
        if (!cropTarget) return;
        if (cropTarget.target === 'avatar') {
            setAvatarUrl(dataUrl);
        } else {
            setBannerUrl(dataUrl);
        }
        setCropTarget(null);
    };

    const handleAddMedia = () => {
        setErrorText('');
        if (!mediaTitle.trim() || !mediaUrl.trim()) {
            setErrorText('Media title and URL are both required.');
            return;
        }
        const normalizedMediaUrl = ensureHttps(mediaUrl);
        if (!isHttpUrl(normalizedMediaUrl)) {
            setErrorText('Media URL must be valid.');
            return;
        }

        const item: TeamMediaItem = {
            id: `media-${Date.now()}-${Math.round(Math.random() * 10000)}`,
            type: mediaType,
            title: mediaTitle.trim(),
            url: normalizedMediaUrl,
            createdAt: Date.now(),
        };

        if (mediaType === 'image') {
            item.thumbnailUrl = normalizedMediaUrl;
        }

        setMediaItems((prev) => [item, ...prev].slice(0, 10));
        setMediaTitle('');
        setMediaUrl('');
    };

    const handleRemoveMedia = (id: string) => {
        setMediaItems((prev) => prev.filter((entry) => entry.id !== id));
    };

    const handleSave = async () => {
        if (!team || !auth.currentUser || !canEdit) return;

        setErrorText('');

        const socialEntries = Object.entries(socialLinks)
            .map(([k, v]) => [k, ensureHttps(v || '')] as const)
            .filter(([, v]) => !!v);

        for (const [platform, value] of socialEntries) {
            if (!isHttpUrl(value)) {
                setErrorText(`${platform} link must start with http:// or https://`);
                return;
            }
        }

        const cleanMedia = mediaItems
            .map((item) => ({
                ...item,
                title: item.title.trim(),
                url: ensureHttps(item.url),
                thumbnailUrl: item.thumbnailUrl?.trim() || undefined,
            }))
            .filter((item) => !!item.title && !!item.url && isHttpUrl(item.url))
            .slice(0, 10)
            .map((item) => ({
                id: item.id,
                type: item.type,
                title: item.title,
                url: item.url,
                createdAt: item.createdAt,
                ...(item.thumbnailUrl ? { thumbnailUrl: item.thumbnailUrl } : {}),
            }));

        const normalizedAccent = ACCENT_PRESETS.includes(accentColor) ? accentColor : ACCENT_PRESETS[0];

        let announcementExpiresAt: number | undefined;
        if (announcementUntil.trim()) {
            const parsed = new Date(`${announcementUntil.trim()}T23:59:59`).getTime();
            if (!Number.isFinite(parsed)) {
                setErrorText('Announcement expiry must be in YYYY-MM-DD format.');
                return;
            }
            announcementExpiresAt = parsed;
        }

        try {
            setIsSaving(true);
            const nextConfig: TeamPageConfig = {
                branding: {
                    avatarUrl: avatarUrl.trim(),
                    bannerUrl: bannerUrl.trim(),
                    bio: bio.trim(),
                    coachDisplayName: coachDisplayName.trim(),
                },
                settings: {
                    isPublic,
                    advancedStatsPublic,
                    mediaPublic,
                    showCoachCode,
                    showFanCode,
                    showFanCount,
                },
                socialLinks: Object.fromEntries(socialEntries),
                media: cleanMedia,
                theme: {
                    accentColor: normalizedAccent,
                },
            };

            if (announcementText.trim()) {
                nextConfig.announcement = {
                    message: announcementText.trim(),
                    ...(typeof announcementExpiresAt === 'number' ? { expiresAt: announcementExpiresAt } : {}),
                };
            }

            await TeamService.updateTeamPageConfig(team.id, auth.currentUser.uid, nextConfig);
            if (hideToastTimeoutRef.current) {
                clearTimeout(hideToastTimeoutRef.current);
            }
            setShowSavedToast(true);
            hideToastTimeoutRef.current = setTimeout(() => {
                setShowSavedToast(false);
                hideToastTimeoutRef.current = null;
            }, 2200);
        } catch {
            setErrorText('Could not save team page settings. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    const copyToClipboard = async (text: string) => {
        await Clipboard.setStringAsync(text);
        if (hideToastTimeoutRef.current) clearTimeout(hideToastTimeoutRef.current);
        setShowSavedToast(true);
        hideToastTimeoutRef.current = setTimeout(() => {
            setShowSavedToast(false);
            hideToastTimeoutRef.current = null;
        }, 2200);
    };

    const handleObserverCodePress = async () => {
        const uid = auth.currentUser?.uid;
        if (!team || !uid || isObserverCodeBusy) return;

        const existing = joinCodes?.observer;
        if (existing) {
            await copyToClipboard(existing);
            return;
        }

        try {
            setIsObserverCodeBusy(true);
            setErrorText('');
            const code = await TeamService.ensureObserverCode(team.id, uid);
            await copyToClipboard(code);
        } catch {
            setErrorText('Could not create observer code. Check that Firebase rules are deployed and you have team manager access.');
        } finally {
            setIsObserverCodeBusy(false);
        }
    };

    const handlePreviewPublic = () => {
        if (!team) return;
        router.push({ pathname: '/team/[id]', params: { id: team.id, preview: 'public' } } as any);
    };

    if (!team) {
        return (
            <View style={styles.centeredContainer}>
                <Text style={styles.mutedText}>Loading team settings...</Text>
            </View>
        );
    }

    if (!canEdit) {
        return (
            <View style={styles.centeredContainer}>
                <Text style={styles.mutedText}>Only coaches/managers can edit this page.</Text>
                <TouchableOpacity style={styles.backGhostBtn} onPress={() => router.back()}>
                    <Text style={styles.backGhostBtnText}>Back</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.topAppBar}>
                <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={22} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.topAppBarTitle}>Edit Team Page</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView style={styles.mainContent} contentContainerStyle={{ paddingBottom: 40 }}>
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Branding</Text>
                    <View style={styles.imagePickerRow}>
                        <TouchableOpacity style={styles.imagePickerBtn} onPress={handlePickAvatar} activeOpacity={0.8}>
                            <Ionicons name="image-outline" size={16} color={colors.primary} />
                            <Text style={styles.imagePickerBtnText}>Choose Profile Image</Text>
                        </TouchableOpacity>
                        {!!avatarUrl && (
                            <TouchableOpacity style={styles.imageClearBtn} onPress={() => setAvatarUrl('')} activeOpacity={0.8}>
                                <Text style={styles.imageClearBtnText}>Clear</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                    {!!avatarUrl && <Image source={{ uri: avatarUrl }} style={styles.avatarPreview} resizeMode="cover" />}

                    <View style={styles.imagePickerRow}>
                        <TouchableOpacity style={styles.imagePickerBtn} onPress={handlePickBanner} activeOpacity={0.8}>
                            <Ionicons name="images-outline" size={16} color={colors.primary} />
                            <Text style={styles.imagePickerBtnText}>Choose Banner Image</Text>
                        </TouchableOpacity>
                        {!!bannerUrl && (
                            <TouchableOpacity style={styles.imageClearBtn} onPress={() => setBannerUrl('')} activeOpacity={0.8}>
                                <Text style={styles.imageClearBtnText}>Clear</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                    {!!bannerUrl && <Image source={{ uri: bannerUrl }} style={styles.bannerPreview} resizeMode="cover" />}

                    <TextInput
                        style={styles.input}
                        placeholder="Coach display name override (optional)"
                        placeholderTextColor={colors.textSecondary}
                        value={coachDisplayName}
                        onChangeText={setCoachDisplayName}
                        maxLength={40}
                    />

                    <TextInput
                        style={[styles.input, { minHeight: 92, textAlignVertical: 'top' }]}
                        placeholder="Team bio"
                        placeholderTextColor={colors.textSecondary}
                        value={bio}
                        onChangeText={setBio}
                        multiline
                    />
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Visibility</Text>
                    <View style={styles.toggleRow}>
                        <View style={styles.toggleCopy}>
                            <Text style={styles.toggleTitle}>Team Page Public</Text>
                            <Text style={styles.toggleSub}>If off, only team members/coaches should access this page.</Text>
                        </View>
                        <Switch value={isPublic} onValueChange={setIsPublic} thumbColor={colors.onPrimary} trackColor={{ false: colors.border, true: colors.primary }} />
                    </View>
                    <View style={styles.toggleRow}>
                        <View style={styles.toggleCopy}>
                            <Text style={styles.toggleTitle}>Advanced Stats Public</Text>
                            <Text style={styles.toggleSub}>Controls chemistry, EPV, and throw profile visibility.</Text>
                        </View>
                        <Switch value={advancedStatsPublic} onValueChange={setAdvancedStatsPublic} thumbColor={colors.onPrimary} trackColor={{ false: colors.border, true: colors.primary }} />
                    </View>
                    <View style={styles.toggleRow}>
                        <View style={styles.toggleCopy}>
                            <Text style={styles.toggleTitle}>Media Public</Text>
                            <Text style={styles.toggleSub}>Show or hide linked media content for non-coaches.</Text>
                        </View>
                        <Switch value={mediaPublic} onValueChange={setMediaPublic} thumbColor={colors.onPrimary} trackColor={{ false: colors.border, true: colors.primary }} />
                    </View>
                    <View style={styles.toggleRow}>
                        <View style={styles.toggleCopy}>
                            <Text style={styles.toggleTitle}>Show Coach Code on Page</Text>
                            <Text style={styles.toggleSub}>If on, the coach code will be displayed on the public team page.</Text>
                        </View>
                        <Switch value={showCoachCode} onValueChange={setShowCoachCode} thumbColor={colors.onPrimary} trackColor={{ false: colors.border, true: colors.primary }} />
                    </View>
                    <View style={styles.toggleRow}>
                        <View style={styles.toggleCopy}>
                            <Text style={styles.toggleTitle}>Show Fan Code on Page</Text>
                            <Text style={styles.toggleSub}>If on, the spectator code will be displayed on the public team page.</Text>
                        </View>
                        <Switch value={showFanCode} onValueChange={setShowFanCode} thumbColor={colors.onPrimary} trackColor={{ false: colors.border, true: colors.primary }} />
                    </View>
                    <View style={styles.toggleRow}>
                        <View style={styles.toggleCopy}>
                            <Text style={styles.toggleTitle}>Show Fan Count</Text>
                            <Text style={styles.toggleSub}>If on, the number of followers will be visible to everyone.</Text>
                        </View>
                        <Switch value={showFanCount} onValueChange={setShowFanCount} thumbColor={colors.onPrimary} trackColor={{ false: colors.border, true: colors.primary }} />
                    </View>
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Access Codes</Text>
                    <Text style={styles.mutedText}>Observer code is for neutral scorers only. It does not grant coach or roster access.</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
                        <TouchableOpacity style={{ flex: 1, backgroundColor: colors.surfaceSecondary, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center' }} onPress={() => { const code = joinCodes?.coach || team?.accessCode; if (code) copyToClipboard(code); }} activeOpacity={0.7}>
                            <Text style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 4, fontWeight: '700' }}>COACH CODE</Text>
                            <Text style={{ fontSize: 18, fontWeight: '800', letterSpacing: 2, color: colors.primary }}>{joinCodes?.coach || team?.accessCode || 'N/A'}</Text>
                            <Text style={{ fontSize: 10, color: colors.primary, marginTop: 4 }}>Tap to copy</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={{ flex: 1, backgroundColor: colors.surfaceSecondary, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center' }} onPress={() => { const code = joinCodes?.spectator || team?.spectatorCode; if (code) copyToClipboard(code); }} activeOpacity={0.7}>
                            <Text style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 4, fontWeight: '700' }}>FAN CODE</Text>
                            <Text style={{ fontSize: 18, fontWeight: '800', letterSpacing: 2, color: colors.primary }}>{joinCodes?.spectator || team?.spectatorCode || 'N/A'}</Text>
                            <Text style={{ fontSize: 10, color: colors.primary, marginTop: 4 }}>Tap to copy</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={{ flex: 1, minWidth: 150, backgroundColor: colors.surfaceSecondary, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center' }} onPress={handleObserverCodePress} activeOpacity={0.7} disabled={isObserverCodeBusy}>
                            <Text style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 4, fontWeight: '700' }}>OBSERVER CODE</Text>
                            <Text style={{ fontSize: 18, fontWeight: '800', letterSpacing: 2, color: colors.primary }}>{joinCodes?.observer || (isObserverCodeBusy ? '...' : 'CREATE')}</Text>
                            <Text style={{ fontSize: 10, color: colors.primary, marginTop: 4 }}>{joinCodes?.observer ? 'Tap to copy' : 'Tap to create'}</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Social Links</Text>
                    <TextInput style={styles.input} placeholder="X profile URL" placeholderTextColor={colors.textSecondary} value={socialLinks.x || ''} onChangeText={(v) => setSocial('x', v)} autoCapitalize="none" />
                    {!!socialLinks.x && <Text style={styles.verifiedHintText}>{isVerifiedSocialLink('x', socialLinks.x || '') ? 'Verified X link domain' : 'Unverified X link domain'}</Text>}
                    <TextInput style={styles.input} placeholder="YouTube channel URL" placeholderTextColor={colors.textSecondary} value={socialLinks.youtube || ''} onChangeText={(v) => setSocial('youtube', v)} autoCapitalize="none" />
                    {!!socialLinks.youtube && <Text style={styles.verifiedHintText}>{isVerifiedSocialLink('youtube', socialLinks.youtube || '') ? 'Verified YouTube domain' : 'Unverified YouTube domain'}</Text>}
                    <TextInput style={styles.input} placeholder="Facebook page URL" placeholderTextColor={colors.textSecondary} value={socialLinks.facebook || ''} onChangeText={(v) => setSocial('facebook', v)} autoCapitalize="none" />
                    <TextInput style={styles.input} placeholder="Instagram URL" placeholderTextColor={colors.textSecondary} value={socialLinks.instagram || ''} onChangeText={(v) => setSocial('instagram', v)} autoCapitalize="none" />
                    <TextInput style={styles.input} placeholder="Website URL" placeholderTextColor={colors.textSecondary} value={socialLinks.website || ''} onChangeText={(v) => setSocial('website', v)} autoCapitalize="none" />
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Theme Controls</Text>
                    <View style={styles.typeRow}>
                        {ACCENT_PRESETS.map((hex) => {
                            const isSelected = accentColor.toLowerCase() === hex.toLowerCase();
                            return (
                                <TouchableOpacity
                                    key={`accent-${hex}`}
                                    style={[styles.colorChip, { backgroundColor: hex }, isSelected && styles.colorChipActive]}
                                    onPress={() => setAccentColor(hex)}
                                    activeOpacity={0.85}
                                >
                                    {isSelected && <Ionicons name="checkmark" size={13} color={colors.onPrimary} style={styles.colorChipCheck} />}
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                    <View style={styles.selectedAccentRow}>
                        <View style={[styles.selectedAccentSwatch, { backgroundColor: accentColor || ACCENT_PRESETS[0] }]} />
                        <Text style={styles.selectedAccentText}>Current accent: {accentColor || ACCENT_PRESETS[0]}</Text>
                    </View>
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Pinned Announcement</Text>
                    <TextInput
                        style={[styles.input, { minHeight: 88, textAlignVertical: 'top' }]}
                        placeholder="Pinned announcement text"
                        placeholderTextColor={colors.textSecondary}
                        value={announcementText}
                        onChangeText={setAnnouncementText}
                        multiline
                    />
                    <TextInput
                        style={styles.input}
                        placeholder="Expiry date YYYY-MM-DD (optional)"
                        placeholderTextColor={colors.textSecondary}
                        value={announcementUntil}
                        onChangeText={setAnnouncementUntil}
                        autoCapitalize="none"
                    />
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Attach Media</Text>
                    <View style={styles.typeRow}>
                        {(['image', 'youtube', 'link'] as MediaType[]).map((kind) => (
                            <TouchableOpacity
                                key={`media-type-${kind}`}
                                style={[styles.typeChip, mediaType === kind && styles.typeChipActive]}
                                onPress={() => setMediaType(kind)}
                                activeOpacity={0.8}
                            >
                                <Text style={[styles.typeChipText, mediaType === kind && styles.typeChipTextActive]}>{kind.toUpperCase()}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <TextInput
                        style={styles.input}
                        placeholder="Media title"
                        placeholderTextColor={colors.textSecondary}
                        value={mediaTitle}
                        onChangeText={setMediaTitle}
                    />
                    <TextInput
                        style={styles.input}
                        placeholder="Media URL"
                        placeholderTextColor={colors.textSecondary}
                        value={mediaUrl}
                        onChangeText={setMediaUrl}
                        autoCapitalize="none"
                    />

                    <TouchableOpacity style={styles.addMediaBtn} onPress={handleAddMedia} activeOpacity={0.8}>
                        <Ionicons name="add" size={16} color={colors.primary} />
                        <Text style={styles.addMediaBtnText}>Add Media</Text>
                    </TouchableOpacity>

                    {mediaItems.map((item) => (
                        <View key={item.id} style={styles.mediaRow}>
                            <View style={{ flex: 1, paddingRight: 10 }}>
                                <Text style={styles.mediaTitle} numberOfLines={1}>{item.title}</Text>
                                <Text style={styles.mediaMeta} numberOfLines={1}>{item.type.toUpperCase()} • {item.url}</Text>
                                <Text style={styles.verifiedHintText}>{isVerifiedMediaLink(item.type, item.url) ? 'Verified link domain' : 'Unverified link domain'}</Text>
                            </View>
                            <TouchableOpacity onPress={() => handleRemoveMedia(item.id)}>
                                <Ionicons name="trash-outline" size={18} color={colors.error} />
                            </TouchableOpacity>
                        </View>
                    ))}
                </View>

                {!!errorText && (
                    <View style={styles.errorBox}>
                        <Ionicons name="warning-outline" size={16} color={colors.error} />
                        <Text style={styles.errorText}>{errorText}</Text>
                    </View>
                )}

                <TouchableOpacity style={styles.previewBtn} onPress={handlePreviewPublic} activeOpacity={0.8}>
                    <Ionicons name="eye-outline" size={15} color={colors.primary} />
                    <Text style={styles.previewBtnText}>Preview As Public Spectator</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.saveBtn, { opacity: isSaving ? 0.8 : 1 }]}
                    onPress={handleSave}
                    disabled={isSaving}
                    activeOpacity={0.8}
                >
                    <Text style={styles.saveBtnText}>{isSaving ? 'Saving...' : 'Save Team Page Settings'}</Text>
                </TouchableOpacity>
            </ScrollView>

            {showSavedToast && (
                <View pointerEvents="none" style={styles.saveToastWrap}>
                    <View style={styles.saveToast}>
                        <Ionicons name="checkmark-circle" size={16} color="#ffffff" />
                        <Text style={styles.saveToastText}>Saved</Text>
                    </View>
                </View>
            )}

            <ImageCropperModal
                visible={!!cropTarget}
                shape={cropTarget?.target === 'avatar' ? 'circle' : 'banner'}
                title={cropTarget?.target === 'avatar' ? 'Crop Profile Image' : 'Crop Banner Image'}
                target={cropTarget ? { uri: cropTarget.uri, width: cropTarget.width, height: cropTarget.height } : null}
                maxDataUrlLength={MAX_IMAGE_DATA_URL_LENGTH}
                onCancel={() => setCropTarget(null)}
                onConfirm={handleCropConfirm}
                onError={(message) => setErrorText(message)}
            />
        </View>
    );
}

const getStyles = (colors: ThemeColors) => {
    const Typography = getTypography(colors);
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        centeredContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, paddingHorizontal: 22 },
        mutedText: { ...Typography.bodySmall, color: colors.textSecondary, textAlign: 'center' },

        topAppBar: {
            height: 60,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: Layout.padding,
            backgroundColor: colors.surface,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
        },
        backButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
        topAppBarTitle: { ...Typography.title, fontSize: 18 },
        mainContent: { flex: 1, paddingHorizontal: Layout.padding, paddingTop: 16 },

        card: {
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: Layout.radiusLg,
            padding: 14,
            marginBottom: 12,
            ...Layout.shadow,
        },
        cardTitle: { ...Typography.subtitle, fontWeight: '700', marginBottom: 12 },
        imagePickerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
        imagePickerBtn: {
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            borderWidth: 1,
            borderColor: colors.primary,
            backgroundColor: colors.primaryLight,
            borderRadius: Layout.radiusSm,
            paddingVertical: 10,
        },
        imagePickerBtnText: { ...Typography.bodySmall, color: colors.primary, fontWeight: '700' },
        imageClearBtn: {
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: Layout.radiusSm,
            backgroundColor: colors.surfaceSecondary,
            paddingHorizontal: 10,
            paddingVertical: 10,
        },
        imageClearBtnText: { ...Typography.bodySmall, color: colors.textSecondary, fontWeight: '700' },
        avatarPreview: {
            width: 92,
            height: 92,
            borderRadius: 46,
            alignSelf: 'center',
            marginBottom: 10,
            backgroundColor: colors.surfaceSecondary,
            borderWidth: 1,
            borderColor: colors.border,
        },
        bannerPreview: {
            width: '100%',
            aspectRatio: 16 / 6,
            borderRadius: Layout.radiusSm,
            marginBottom: 10,
            backgroundColor: colors.surfaceSecondary,
            borderWidth: 1,
            borderColor: colors.border,
        },
        input: {
            ...Typography.body,
            color: colors.text,
            backgroundColor: colors.surfaceSecondary,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: Layout.radiusMd,
            paddingHorizontal: 12,
            paddingVertical: 11,
            marginBottom: 10,
        },

        toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
        toggleCopy: { flex: 1, paddingRight: 10 },
        toggleTitle: { ...Typography.bodySmall, fontWeight: '700', color: colors.text },
        toggleSub: { ...Typography.bodySmall, color: colors.textSecondary, marginTop: 2 },

        typeRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
        typeChip: {
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: Layout.radiusSm,
            backgroundColor: colors.surfaceSecondary,
            paddingHorizontal: 10,
            paddingVertical: 7,
        },
        typeChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
        typeChipText: { ...Typography.bodySmall, color: colors.textSecondary, fontWeight: '700' },
        typeChipTextActive: { color: colors.primary },
        colorChip: {
            width: 28,
            height: 28,
            borderRadius: 14,
            borderWidth: 2,
            borderColor: 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
        },
        colorChipActive: { borderColor: colors.text },
        colorChipCheck: {
            textShadowColor: 'rgba(0,0,0,0.35)',
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 1,
        },
        selectedAccentRow: {
            marginTop: 4,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
        },
        selectedAccentSwatch: {
            width: 14,
            height: 14,
            borderRadius: 7,
            borderWidth: 1,
            borderColor: colors.border,
        },
        selectedAccentText: {
            ...Typography.bodySmall,
            color: colors.textSecondary,
            fontWeight: '600',
        },
        verifiedHintText: { ...Typography.bodySmall, color: colors.textSecondary, marginBottom: 8 },

        addMediaBtn: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            borderWidth: 1,
            borderColor: colors.primary,
            backgroundColor: colors.primaryLight,
            borderRadius: Layout.radiusMd,
            paddingVertical: 10,
            marginBottom: 10,
        },
        addMediaBtnText: { ...Typography.bodySmall, color: colors.primary, fontWeight: '700' },

        mediaRow: {
            flexDirection: 'row',
            alignItems: 'center',
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: Layout.radiusSm,
            backgroundColor: colors.surfaceSecondary,
            paddingHorizontal: 10,
            paddingVertical: 8,
            marginBottom: 8,
        },
        mediaTitle: { ...Typography.bodySmall, color: colors.text, fontWeight: '700' },
        mediaMeta: { ...Typography.bodySmall, color: colors.textSecondary, marginTop: 1 },

        errorBox: {
            borderWidth: 1,
            borderColor: colors.error,
            backgroundColor: colors.errorBg,
            borderRadius: Layout.radiusSm,
            paddingHorizontal: 10,
            paddingVertical: 8,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            marginBottom: 12,
        },
        errorText: { ...Typography.bodySmall, color: colors.error, flex: 1 },

        saveBtn: {
            backgroundColor: colors.primary,
            borderRadius: Layout.radiusMd,
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 13,
            marginBottom: 8,
        },
        saveBtnText: { ...Typography.button, color: colors.onPrimary },

        saveToastWrap: {
            position: 'absolute',
            left: Layout.padding,
            right: Layout.padding,
            bottom: 20,
            alignItems: 'center',
        },
        saveToast: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: '#16A34A',
            borderRadius: Layout.radiusFull,
            paddingHorizontal: 16,
            paddingVertical: 10,
            ...Layout.shadow,
        },
        saveToastText: { ...Typography.bodySmall, color: '#ffffff', fontWeight: '800' },

        previewBtn: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            borderWidth: 1,
            borderColor: colors.primary,
            backgroundColor: colors.primaryLight,
            borderRadius: Layout.radiusMd,
            paddingVertical: 12,
            marginBottom: 10,
        },
        previewBtnText: { ...Typography.bodySmall, color: colors.primary, fontWeight: '700' },

        backGhostBtn: {
            marginTop: 12,
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: Layout.radiusSm,
            backgroundColor: colors.surface,
        },
        backGhostBtnText: { ...Typography.bodySmall, color: colors.textSecondary, fontWeight: '700' },
    });
};
