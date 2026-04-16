import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { sendPasswordResetEmail } from 'firebase/auth';
import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth } from '../firebaseConfig';
import { getTypography, Layout } from './theme/DesignSystem';
import { ThemeColors, useTheme } from './theme/ThemeContext';

export default function ForgotPasswordScreen() {
    const { colors } = useTheme();
    const styles = getStyles(colors);

    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState<{ type: 'error' | 'success' | ''; message: string }>({ type: '', message: '' });

    const mapAuthError = (error: any) => {
        const code = error?.code || '';
        switch (code) {
            case 'auth/invalid-email':
                return 'Enter a valid email address.';
            case 'auth/user-not-found':
                return 'No account found with that email.';
            case 'auth/too-many-requests':
                return 'Too many attempts. Please wait a minute and try again.';
            default:
                return error?.message || 'Could not send reset email. Please try again.';
        }
    };

    const handleSendLink = async () => {
        const trimmedEmail = email.trim();
        if (!trimmedEmail) {
            setStatus({ type: 'error', message: 'Enter your account email first.' });
            return;
        }

        try {
            setIsLoading(true);
            setStatus({ type: '', message: '' });
            await sendPasswordResetEmail(auth, trimmedEmail);
            setStatus({ type: 'success', message: 'Password reset link sent. Check your inbox and spam folder.' });
        } catch (error: any) {
            setStatus({ type: 'error', message: mapAuthError(error) });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
            <View style={styles.topAppBar}>
                <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
                    <Ionicons name="arrow-back" size={22} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.topTitle}>Forgot Password</Text>
                <View style={{ width: 40 }} />
            </View>

            <View style={styles.content}>
                <Text style={styles.description}>Enter your email and we will send you a password reset link.</Text>

                <TextInput
                    style={styles.input}
                    placeholder="Email Address"
                    placeholderTextColor={colors.textSecondary}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    value={email}
                    onChangeText={setEmail}
                />

                {!!status.message && (
                    <View style={[styles.statusBox, status.type === 'error' ? styles.errorBox : styles.successBox]}>
                        <Text style={[styles.statusText, status.type === 'error' ? styles.errorText : styles.successText]}>{status.message}</Text>
                    </View>
                )}

                <TouchableOpacity
                    style={[styles.sendBtn, { opacity: isLoading ? 0.85 : 1 }]}
                    onPress={handleSendLink}
                    disabled={isLoading}
                    activeOpacity={0.8}
                >
                    {isLoading ? (
                        <ActivityIndicator color={colors.onPrimary} />
                    ) : (
                        <Text style={styles.sendBtnText}>Send Reset Link</Text>
                    )}
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}

const getStyles = (colors: ThemeColors) => {
    const Typography = getTypography(colors);
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
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
        backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
        topTitle: { ...Typography.title, fontSize: 18 },

        content: { flex: 1, padding: Layout.padding, paddingTop: 24 },
        description: { ...Typography.bodySmall, color: colors.textSecondary, marginBottom: 14 },
        input: {
            ...Typography.body,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: Layout.radiusMd,
            paddingHorizontal: 14,
            paddingVertical: 12,
            color: colors.text,
            marginBottom: 12,
        },

        statusBox: {
            borderWidth: 1,
            borderRadius: Layout.radiusSm,
            paddingHorizontal: 10,
            paddingVertical: 8,
            marginBottom: 12,
        },
        statusText: { ...Typography.bodySmall, fontWeight: '600' },
        errorBox: { borderColor: colors.error, backgroundColor: colors.errorBg },
        successBox: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
        errorText: { color: colors.error },
        successText: { color: colors.primary },

        sendBtn: {
            backgroundColor: colors.primary,
            borderRadius: Layout.radiusMd,
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 13,
        },
        sendBtnText: { ...Typography.button, color: colors.onPrimary },
    });
};
