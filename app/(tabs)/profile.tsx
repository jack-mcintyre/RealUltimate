import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { signOut, updatePassword } from 'firebase/auth';
import { onValue, ref, update } from 'firebase/database';
import React, { useEffect, useState } from 'react';
import { Alert, Image, Linking, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth, db } from '../../firebaseConfig';
import { ensureHttps, getHostname, isHttpUrl, isVerifiedSocialLink } from '../services/linkUtils';
import { TeamService } from '../services/TeamService';
import { SocialLinks, Team, UserPublicProfile } from '../services/types';
import { getTypography, Layout } from '../theme/DesignSystem';
import { ThemeColors, useTheme } from '../theme/ThemeContext';

const MAX_IMAGE_DATA_URL_LENGTH = 1_900_000;

export default function ProfileScreen() {
    const [email, setEmail] = useState<string | null>(null);
    const [teams, setTeams] = useState<Team[]>([]);
    const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
    const [activeRole, setActiveRole] = useState<'coach' | 'spectator' | null>(null);
    const [publicProfile, setPublicProfile] = useState<UserPublicProfile>({});

    const [pushModalVisible, setPushModalVisible] = useState(false);
    const [pushSetting, setPushSetting] = useState<'all' | 'game' | 'off'>('game');
    
    const [accountModalVisible, setAccountModalVisible] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [profileModalVisible, setProfileModalVisible] = useState(false);
    const [profileAvatarUrl, setProfileAvatarUrl] = useState('');
    const [profileBannerUrl, setProfileBannerUrl] = useState('');
    const [profileBio, setProfileBio] = useState('');
    const [profileSocial, setProfileSocial] = useState<SocialLinks>({});

    const [themeModalVisible, setThemeModalVisible] = useState(false);
    const { colors, themePref, setThemePref } = useTheme();
    const styles = getStyles(colors);

    const user = auth.currentUser;

    useEffect(() => {
        if (!user) return;
        setEmail(user.email);

        const profileRef = ref(db, `users/${user.uid}/profile`);
        const unsubProfile = onValue(profileRef, (snap) => {
            const data = snap.val();
            if (data) {
                setActiveTeamId(data.activeTeamId);
                setActiveRole(data.activeRole);
                if (data.pushSetting) setPushSetting(data.pushSetting);
                const nextPublic: UserPublicProfile = data.publicProfile || {};
                setPublicProfile(nextPublic);
                setProfileAvatarUrl(nextPublic.avatarUrl || '');
                setProfileBannerUrl(nextPublic.bannerUrl || '');
                setProfileBio(nextPublic.bio || '');
                setProfileSocial(nextPublic.socialLinks || {});
            }
        });

        const unsubTeams = TeamService.getTeamsForUser(user.uid, (coached, spectated) => {
            setTeams([...coached, ...spectated]);
        });

        return () => {
            unsubProfile();
            unsubTeams();
        };
    }, [user]);

    const handleSelectActiveTeam = async (t: Team) => {
        if (!user) return;
        const newRole = t.role || 'spectator';
        try {
            await update(ref(db, `users/${user.uid}/profile`), {
                activeTeamId: t.id,
                activeRole: newRole
            });
            setActiveTeamId(t.id);
            setActiveRole(newRole);
        } catch (e) {
            console.error("Failed to update active team", e);
        }
    };

    const handleLogout = async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error("Logout failed", error);
        }
    };

    const handleSetPushSetting = async (val: 'all' | 'game' | 'off') => {
        if (!user) return;
        await update(ref(db, `users/${user.uid}/profile`), { pushSetting: val });
        setPushSetting(val);
        setPushModalVisible(false);
    };

    const handleUpdatePassword = async () => {
        if (!user || !newPassword.trim()) return;
        try {
            await updatePassword(user, newPassword);
            Alert.alert("Success", "Password updated successfully.");
            setNewPassword('');
            setAccountModalVisible(false);
        } catch {
            Alert.alert("Update Failed", "For security, modifying credentials requires a recent login. Please log out and back in to change your password.");
        }
    };

    const setProfileSocialLink = (key: keyof SocialLinks, value: string) => {
        setProfileSocial((prev) => ({ ...prev, [key]: value }));
    };

    const pickImageDataUrl = async (aspect: [number, number]) => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect,
            quality: 0.72,
            base64: true,
        });

        if (result.canceled || !result.assets?.[0]) return '';
        const asset = result.assets[0];
        if (!asset.base64) throw new Error('Image data not available.');

        const mime = asset.mimeType || 'image/jpeg';
        const dataUrl = `data:${mime};base64,${asset.base64}`;
        if (dataUrl.length > MAX_IMAGE_DATA_URL_LENGTH) {
            throw new Error('Image too large. Choose a smaller image.');
        }

        return dataUrl;
    };

    const handlePickProfileAvatar = async () => {
        try {
            const next = await pickImageDataUrl([1, 1]);
            if (next) setProfileAvatarUrl(next);
        } catch (error: any) {
            Alert.alert('Image Error', error?.message || 'Could not pick image.');
        }
    };

    const handlePickProfileBanner = async () => {
        try {
            const next = await pickImageDataUrl([16, 6]);
            if (next) setProfileBannerUrl(next);
        } catch (error: any) {
            Alert.alert('Image Error', error?.message || 'Could not pick image.');
        }
    };

    const handleSavePublicProfile = async () => {
        if (!user) return;

        const socialEntries = Object.entries(profileSocial)
            .map(([k, v]) => [k, ensureHttps((v || '').trim())] as const)
            .filter(([, v]) => !!v);

        for (const [platform, value] of socialEntries) {
            if (!isHttpUrl(value)) {
                Alert.alert('Invalid URL', `${platform} link must start with http:// or https://`);
                return;
            }
        }

        if (profileAvatarUrl && profileAvatarUrl.length > MAX_IMAGE_DATA_URL_LENGTH) {
            Alert.alert('Image too large', 'Profile picture is too large. Choose a smaller image.');
            return;
        }
        if (profileBannerUrl && profileBannerUrl.length > MAX_IMAGE_DATA_URL_LENGTH) {
            Alert.alert('Image too large', 'Banner image is too large. Choose a smaller image.');
            return;
        }

        const nextPublicProfile: UserPublicProfile = {
            avatarUrl: profileAvatarUrl.trim(),
            bannerUrl: profileBannerUrl.trim(),
            bio: profileBio.trim(),
            socialLinks: Object.fromEntries(socialEntries),
        };

        await update(ref(db, `users/${user.uid}/profile`), { publicProfile: nextPublicProfile });
        setPublicProfile(nextPublicProfile);
        setProfileModalVisible(false);
    };

    const openExternalProfile = async (url: string) => {
        const normalized = ensureHttps(url || '');
        if (!normalized || !getHostname(normalized)) {
            Alert.alert('Invalid URL', 'Please use a valid http or https link.');
            return;
        }
        await Linking.openURL(normalized);
    };

    const handleSupportPress = () => {
        Alert.alert('Support', 'Email support@realultimate.app for help or feedback.');
    };

    const activeTeam = teams.find(t => t.id === activeTeamId);
    const publicSocialEntries = [
        { key: 'x', label: 'X', url: publicProfile.socialLinks?.x || '' },
        { key: 'youtube', icon: 'logo-youtube' as const, url: publicProfile.socialLinks?.youtube || '' },
        { key: 'facebook', icon: 'logo-facebook' as const, url: publicProfile.socialLinks?.facebook || '' },
        { key: 'instagram', icon: 'logo-instagram' as const, url: publicProfile.socialLinks?.instagram || '' },
        { key: 'website', icon: 'globe-outline' as const, url: publicProfile.socialLinks?.website || '' },
    ].filter((entry) => !!entry.url);

    return (
        <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
            <View style={styles.topAppBar}>
                <Text style={styles.logoText}>Profile</Text>
            </View>

            <View style={styles.mainContent}>
                <View style={styles.header}>
                    <View style={styles.profileBannerWrap}>
                        {publicProfile.bannerUrl ? (
                            <Image source={{ uri: publicProfile.bannerUrl }} style={styles.profileBannerImage} resizeMode="cover" />
                        ) : (
                            <View style={styles.profileBannerFallback}>
                                <Text style={styles.profileBannerFallbackText}>{(email || 'PROFILE').toUpperCase()}</Text>
                            </View>
                        )}
                    </View>

                    <View style={styles.avatarOverlay}>
                        {publicProfile.avatarUrl ? (
                            <Image source={{ uri: publicProfile.avatarUrl }} style={styles.avatarImage} resizeMode="cover" />
                        ) : (
                            <View style={styles.avatarCircle}>
                                <Ionicons name="person" size={40} color={colors.primary} />
                            </View>
                        )}
                    </View>

                    <Text style={styles.emailText}>{email || 'Loading...'}</Text>

                    {!!publicProfile.bio && (
                        <Text style={styles.profileBioText}>{publicProfile.bio}</Text>
                    )}

                    {!!publicSocialEntries.length && (
                        <View style={styles.socialIconRow}>
                            {publicSocialEntries.map((entry) => (
                                <TouchableOpacity
                                    key={`profile-social-${entry.key}`}
                                    style={styles.socialIconBtn}
                                    onPress={() => openExternalProfile(entry.url)}
                                    activeOpacity={0.8}
                                >
                                    {entry.key === 'x' ? (
                                        <Text style={styles.xMarkText}>X</Text>
                                    ) : (
                                        <Ionicons name={entry.icon as any} size={15} color={colors.primary} />
                                    )}
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}

                    <TouchableOpacity style={styles.profileEditBtn} onPress={() => setProfileModalVisible(true)} activeOpacity={0.8}>
                        <Ionicons name="create-outline" size={14} color={colors.primary} />
                        <Text style={styles.profileEditBtnText}>Edit Profile</Text>
                    </TouchableOpacity>

                    {activeTeam ? (
                        <View style={styles.roleBadge}>
                            <Ionicons name={activeRole === 'coach' ? 'shield-checkmark' : 'eye'} size={14} color={colors.primary} style={{ marginRight: 6 }} />
                            <Text style={styles.roleText}>
                                {activeRole === 'coach' ? 'Manager' : 'Spectator'} • {activeTeam.name}
                            </Text>
                        </View>
                    ) : (
                        <View style={[styles.roleBadge, { backgroundColor: colors.surfaceSecondary }]}>
                            <Text style={[styles.roleText, { color: colors.textSecondary }]}>No Active Team</Text>
                        </View>
                    )}
                </View>

                <Text style={styles.sectionTitle}>DEFAULT ACTIVE TEAM</Text>
                {teams.length === 0 ? (
                    <View style={styles.emptyStateCard}>
                        <Text style={styles.emptyText}>You are not part of any teams.</Text>
                    </View>
                ) : (
                    <View style={styles.optionsContainer}>
                        {teams.map((t, index) => (
                            <TouchableOpacity 
                                key={`${t.id}-${t.role}`}
                                style={[styles.optionRow, index === teams.length - 1 && { borderBottomWidth: 0 }]} 
                                onPress={() => handleSelectActiveTeam(t)}
                                activeOpacity={0.7}
                            >
                                <Ionicons 
                                    name={activeTeamId === t.id && activeRole === t.role ? "radio-button-on" : "radio-button-off"} 
                                    size={24} 
                                    color={activeTeamId === t.id && activeRole === t.role ? colors.primary : colors.textSecondary} 
                                />
                                <View style={{ flex: 1, marginLeft: 16 }}>
                                    <Text style={styles.optionText}>{t.name}</Text>
                                    <Text style={styles.subText}>{t.role === 'coach' ? 'Manager / Coach' : 'Spectator / Fan'}</Text>
                                </View>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}

                <Text style={styles.sectionTitle}>ACCOUNT</Text>
                <View style={styles.optionsContainer}>
                    <TouchableOpacity style={styles.optionRow} activeOpacity={0.7} onPress={() => setAccountModalVisible(true)}>
                        <Ionicons name="settings-outline" size={24} color={colors.textSecondary} />
                        <Text style={styles.optionTextBaseline}>Account Details</Text>
                        <Ionicons name="chevron-forward" size={20} color={colors.border} />
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.optionRow} activeOpacity={0.7} onPress={() => setPushModalVisible(true)}>
                        <Ionicons name="notifications-outline" size={24} color={colors.textSecondary} />
                        <View style={{ flex: 1, marginLeft: 16 }}>
                            <Text style={styles.optionText}>Push Notifications</Text>
                            <Text style={styles.subText}>{pushSetting === 'all' ? 'Every Score' : pushSetting === 'game' ? 'Game Start & End' : 'Off'}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={colors.border} />
                    </TouchableOpacity>
                    
                    <TouchableOpacity style={styles.optionRow} activeOpacity={0.7} onPress={() => setThemeModalVisible(true)}>
                        <Ionicons name="color-palette-outline" size={24} color={colors.textSecondary} />
                        <View style={{ flex: 1, marginLeft: 16 }}>
                            <Text style={styles.optionText}>Appearance</Text>
                            <Text style={styles.subText}>{themePref === 'system' ? 'System Default' : themePref === 'dark' ? 'Dark Mode' : 'Light Mode'}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={colors.border} />
                    </TouchableOpacity>

                    <TouchableOpacity style={[styles.optionRow, { borderBottomWidth: 0 }]} activeOpacity={0.7} onPress={handleSupportPress}>
                        <Ionicons name="help-circle-outline" size={24} color={colors.textSecondary} />
                        <Text style={styles.optionTextBaseline}>Support</Text>
                        <Ionicons name="chevron-forward" size={20} color={colors.border} />
                    </TouchableOpacity>
                </View>

                <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.8}>
                    <Text style={styles.logoutText}>Log Out</Text>
                </TouchableOpacity>
            </View>

            {/* PUSH NOTIFICATIONS MODAL */}
            <Modal visible={pushModalVisible} animationType="fade" transparent={true} onRequestClose={() => setPushModalVisible(false)}>
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setPushModalVisible(false)}>
                    <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
                        <Text style={styles.modalTitle}>Push Notifications</Text>
                        <Text style={styles.modalSub}>Receive field updates even when the app is closed.</Text>
                        
                        <View style={{ width: '100%', marginBottom: 24 }}>
                            {[
                                { key: 'all', label: 'Every Score & Event', desc: 'Real-time updates for every point.' },
                                { key: 'game', label: 'Game Start & End Only', desc: 'Alerts when a match begins or concludes.' },
                                { key: 'off', label: 'Off', desc: 'Do not send push notifications.' }
                            ].map(opt => (
                                <TouchableOpacity 
                                    key={opt.key} 
                                    style={[styles.radioRow, pushSetting === opt.key && styles.radioRowActive]} 
                                    onPress={() => handleSetPushSetting(opt.key as any)}
                                >
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.radioLabel, pushSetting === opt.key && { color: colors.primary }]}>{opt.label}</Text>
                                        <Text style={styles.radioDesc}>{opt.desc}</Text>
                                    </View>
                                    <Ionicons name={pushSetting === opt.key ? "radio-button-on" : "radio-button-off"} size={24} color={pushSetting === opt.key ? colors.primary : colors.textSecondary} />
                                </TouchableOpacity>
                            ))}
                        </View>
                        
                        <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setPushModalVisible(false)}>
                            <Text style={styles.modalCloseBtnText}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>

            {/* ACCOUNT DETAILS MODAL */}
            <Modal visible={accountModalVisible} animationType="slide" transparent={true} onRequestClose={() => setAccountModalVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { padding: 24 }]}>
                        <Text style={styles.modalTitle}>Account Details</Text>
                        <Text style={[styles.modalSub, { marginBottom: 24 }]}>RealUltimate natively respects your OS text size scaling settings.</Text>

                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>EMAIL (READ ONLY)</Text>
                            <TextInput style={[styles.inputField, { backgroundColor: colors.surfaceSecondary, color: colors.textSecondary }]} value={email || ''} editable={false} />
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>NEW PASSWORD</Text>
                            <TextInput 
                                style={styles.inputField} 
                                placeholder="Enter new password" 
                                placeholderTextColor={colors.textSecondary}
                                secureTextEntry 
                                value={newPassword} 
                                onChangeText={setNewPassword} 
                            />
                        </View>

                        <View style={styles.modalActionRow}>
                            <TouchableOpacity style={[styles.modalActionBtn, styles.modalActionBtnSecondary]} onPress={() => setAccountModalVisible(false)}>
                                <Text style={[styles.modalActionBtnText, { color: colors.textSecondary }]}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.modalActionBtn, styles.modalActionBtnPrimary]} onPress={handleUpdatePassword}>
                                <Text style={[styles.modalActionBtnText, { color: '#fff' }]}>Update Password</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* PUBLIC PROFILE MODAL */}
            <Modal visible={profileModalVisible} animationType="slide" transparent={true} onRequestClose={() => setProfileModalVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { padding: 24 }]}> 
                        <Text style={styles.modalTitle}>Edit Profile</Text>
                        <Text style={[styles.modalSub, { marginBottom: 20 }]}>Choose images from your device and add your public links.</Text>

                        <ScrollView style={{ width: '100%', maxHeight: 420 }} showsVerticalScrollIndicator={false}>
                            <View style={styles.inputGroup}> 
                                <Text style={styles.inputLabel}>PROFILE PICTURE</Text>
                                <View style={styles.imagePickerRow}>
                                    <TouchableOpacity style={styles.imagePickBtn} onPress={handlePickProfileAvatar} activeOpacity={0.8}>
                                        <Ionicons name="image-outline" size={16} color={colors.primary} />
                                        <Text style={styles.imagePickBtnText}>Choose Image</Text>
                                    </TouchableOpacity>
                                    {!!profileAvatarUrl && (
                                        <TouchableOpacity style={styles.imageClearBtn} onPress={() => setProfileAvatarUrl('')} activeOpacity={0.8}>
                                            <Text style={styles.imageClearBtnText}>Clear</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                                {!!profileAvatarUrl && (
                                    <Image source={{ uri: profileAvatarUrl }} style={styles.profileAvatarPreview} resizeMode="cover" />
                                )}
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>BANNER IMAGE</Text>
                                <View style={styles.imagePickerRow}>
                                    <TouchableOpacity style={styles.imagePickBtn} onPress={handlePickProfileBanner} activeOpacity={0.8}>
                                        <Ionicons name="images-outline" size={16} color={colors.primary} />
                                        <Text style={styles.imagePickBtnText}>Choose Banner</Text>
                                    </TouchableOpacity>
                                    {!!profileBannerUrl && (
                                        <TouchableOpacity style={styles.imageClearBtn} onPress={() => setProfileBannerUrl('')} activeOpacity={0.8}>
                                            <Text style={styles.imageClearBtnText}>Clear</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                                {!!profileBannerUrl && (
                                    <Image source={{ uri: profileBannerUrl }} style={styles.profileBannerPreview} resizeMode="cover" />
                                )}
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>BIO</Text>
                                <TextInput
                                    style={[styles.inputField, { minHeight: 88, textAlignVertical: 'top' }]}
                                    placeholder="Short profile bio"
                                    placeholderTextColor={colors.textSecondary}
                                    value={profileBio}
                                    onChangeText={setProfileBio}
                                    multiline
                                />
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>X URL</Text>
                                <TextInput style={styles.inputField} placeholder="https://x.com/..." placeholderTextColor={colors.textSecondary} autoCapitalize="none" value={profileSocial.x || ''} onChangeText={(v) => setProfileSocialLink('x', v)} />
                                {!!profileSocial.x && (
                                    <Text style={styles.linkHintText}>{isVerifiedSocialLink('x', profileSocial.x) ? 'Verified X domain' : 'Unverified X domain'}</Text>
                                )}
                            </View>
                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>YOUTUBE URL</Text>
                                <TextInput style={styles.inputField} placeholder="https://youtube.com/..." placeholderTextColor={colors.textSecondary} autoCapitalize="none" value={profileSocial.youtube || ''} onChangeText={(v) => setProfileSocialLink('youtube', v)} />
                                {!!profileSocial.youtube && (
                                    <Text style={styles.linkHintText}>{isVerifiedSocialLink('youtube', profileSocial.youtube) ? 'Verified YouTube domain' : 'Unverified YouTube domain'}</Text>
                                )}
                            </View>
                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>FACEBOOK URL</Text>
                                <TextInput style={styles.inputField} placeholder="https://facebook.com/..." placeholderTextColor={colors.textSecondary} autoCapitalize="none" value={profileSocial.facebook || ''} onChangeText={(v) => setProfileSocialLink('facebook', v)} />
                            </View>
                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>INSTAGRAM URL</Text>
                                <TextInput style={styles.inputField} placeholder="https://instagram.com/..." placeholderTextColor={colors.textSecondary} autoCapitalize="none" value={profileSocial.instagram || ''} onChangeText={(v) => setProfileSocialLink('instagram', v)} />
                            </View>
                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>WEBSITE URL</Text>
                                <TextInput style={styles.inputField} placeholder="https://..." placeholderTextColor={colors.textSecondary} autoCapitalize="none" value={profileSocial.website || ''} onChangeText={(v) => setProfileSocialLink('website', v)} />
                            </View>
                        </ScrollView>

                        <View style={styles.modalActionRow}>
                            <TouchableOpacity style={[styles.modalActionBtn, styles.modalActionBtnSecondary]} onPress={() => setProfileModalVisible(false)}>
                                <Text style={[styles.modalActionBtnText, { color: colors.textSecondary }]}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.modalActionBtn, styles.modalActionBtnPrimary]} onPress={handleSavePublicProfile}>
                                <Text style={[styles.modalActionBtnText, { color: '#fff' }]}>Save Profile</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* APPEARANCE MODAL */}
            <Modal visible={themeModalVisible} animationType="fade" transparent={true} onRequestClose={() => setThemeModalVisible(false)}>
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setThemeModalVisible(false)}>
                    <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
                        <Text style={styles.modalTitle}>Appearance</Text>
                        <Text style={styles.modalSub}>Customize the app visual theme.</Text>
                        
                        <View style={{ width: '100%', marginBottom: 24 }}>
                            {[
                                { key: 'system', label: 'System Default' },
                                { key: 'light', label: 'Light Mode' },
                                { key: 'dark', label: 'Dark Mode' }
                            ].map(opt => (
                                <TouchableOpacity 
                                    key={opt.key} 
                                    style={[styles.radioRow, themePref === opt.key && styles.radioRowActive]} 
                                    onPress={() => { setThemePref(opt.key as any); setThemeModalVisible(false); }}
                                >
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.radioLabel, themePref === opt.key && { color: colors.primary }]}>{opt.label}</Text>
                                    </View>
                                    <Ionicons name={themePref === opt.key ? "radio-button-on" : "radio-button-off"} size={24} color={themePref === opt.key ? colors.primary : colors.textSecondary} />
                                </TouchableOpacity>
                            ))}
                        </View>
                        
                        <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setThemeModalVisible(false)}>
                            <Text style={styles.modalCloseBtnText}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>

        </ScrollView>
    );
}

const getStyles = (colors: ThemeColors) => {
    const Typography = getTypography(colors);
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        
        topAppBar: { height: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
        logoText: { ...Typography.title, fontSize: 18 },
        
        mainContent: { padding: Layout.padding, paddingTop: 24 },

        header: { alignItems: 'center', marginBottom: 32 },
        profileBannerWrap: {
            width: '100%',
            height: 120,
            borderRadius: Layout.radiusMd,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: 12,
        },
        profileBannerImage: { width: '100%', height: '100%' },
        profileBannerFallback: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.primaryLight,
        },
        profileBannerFallbackText: { ...Typography.bodySmall, color: colors.primary, fontWeight: '700', letterSpacing: 1 },
        avatarOverlay: {
            marginTop: -44,
            marginBottom: 2,
            width: 84,
            height: 84,
            borderWidth: 2,
            borderColor: colors.surface,
            borderRadius: 42,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
        },
        avatarImage: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.surfaceSecondary },
        avatarCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primaryLight, justifyContent: 'center', alignItems: 'center' },
        emailText: { ...Typography.title, fontSize: 20, marginBottom: 6, textAlign: 'center' },
        profileBioText: { ...Typography.bodySmall, color: colors.textSecondary, textAlign: 'center', marginBottom: 8 },
        socialIconRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
        socialIconBtn: {
            width: 30,
            height: 30,
            borderRadius: 15,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: colors.primary,
            backgroundColor: colors.primaryLight,
        },
        xMarkText: { ...Typography.bodySmall, color: colors.primary, fontWeight: '800' },
        profileEditBtn: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            borderWidth: 1,
            borderColor: colors.primary,
            backgroundColor: colors.primaryLight,
            borderRadius: Layout.radiusFull,
            paddingHorizontal: 10,
            paddingVertical: 6,
            marginBottom: 10,
        },
        profileEditBtnText: { ...Typography.bodySmall, color: colors.primary, fontWeight: '700' },
        roleBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primaryLight, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Layout.radiusFull },
        roleText: { ...Typography.bodySmall, color: colors.primary, fontWeight: '600' },
        
        sectionTitle: { ...Typography.label, marginBottom: 12 },
        
        emptyStateCard: { padding: 24, backgroundColor: colors.surface, borderRadius: Layout.radiusLg, alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', marginBottom: 32 },
        emptyText: { ...Typography.bodySmall, textAlign: 'center' },

        optionsContainer: { backgroundColor: colors.surface, borderRadius: Layout.radiusLg, marginBottom: 32, borderWidth: 1, borderColor: colors.border, ...Layout.shadow },
        optionRow: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
        optionText: { ...Typography.body, fontWeight: '600' },
        optionTextBaseline: { flex: 1, ...Typography.body, marginLeft: 16 },
        subText: { ...Typography.bodySmall, marginTop: 2 },
        
        logoutButton: { flexDirection: 'row', backgroundColor: colors.surface, padding: 16, borderRadius: Layout.radiusMd, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border, ...Layout.shadow },
        logoutText: { ...Typography.button, color: colors.error },

        // Modals
        modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
        modalContent: { backgroundColor: colors.surface, borderRadius: Layout.radiusLg, padding: 32, width: '100%', maxWidth: 400, alignItems: 'center', ...Layout.shadow },
        modalTitle: { ...Typography.title, fontSize: 20, marginBottom: 8 },
        modalSub: { ...Typography.bodySmall, textAlign: 'center', marginBottom: 24 },
        
        radioRow: { flexDirection: 'row', width: '100%', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
        radioRowActive: { borderBottomColor: colors.primary },
        radioLabel: { ...Typography.body, fontWeight: '600' },
        radioDesc: { ...Typography.bodySmall, fontSize: 12, marginTop: 2 },
        
        modalCloseBtn: { width: '100%', paddingVertical: 14, borderRadius: Layout.radiusMd, borderWidth: 1, borderColor: colors.border, alignItems: 'center', marginTop: 8 },
        modalCloseBtnText: { ...Typography.button, color: colors.text },

        modalActionRow: { flexDirection: 'row', gap: 10, width: '100%', marginTop: 14 },
        modalActionBtn: {
            flex: 1,
            height: 44,
            borderRadius: Layout.radiusMd,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: colors.border,
        },
        modalActionBtnSecondary: { backgroundColor: colors.surfaceSecondary },
        modalActionBtnPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
        modalActionBtnText: { ...Typography.button },

        inputGroup: { width: '100%', marginBottom: 16 },
        inputLabel: { ...Typography.label, marginBottom: 8 },
        inputField: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: Layout.radiusMd, padding: 12, fontSize: 16, color: colors.text },
        imagePickerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
        imagePickBtn: {
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
        imagePickBtnText: { ...Typography.bodySmall, color: colors.primary, fontWeight: '700' },
        imageClearBtn: {
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: Layout.radiusSm,
            backgroundColor: colors.surfaceSecondary,
            paddingHorizontal: 10,
            paddingVertical: 10,
        },
        imageClearBtnText: { ...Typography.bodySmall, color: colors.textSecondary, fontWeight: '700' },
        profileAvatarPreview: { width: 86, height: 86, borderRadius: 43, backgroundColor: colors.surfaceSecondary, marginTop: 10, alignSelf: 'center' },
        profileBannerPreview: { width: '100%', height: 110, borderRadius: Layout.radiusSm, backgroundColor: colors.surfaceSecondary, marginTop: 10 },
        linkHintText: { ...Typography.bodySmall, color: colors.textSecondary, marginTop: 6 },
    });
}
