import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import { OAuthProvider, createUserWithEmailAndPassword, onAuthStateChanged, signInWithCredential, signInWithEmailAndPassword } from 'firebase/auth';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth } from '../firebaseConfig';
import { getTypography, Layout } from './theme/DesignSystem';
import { ThemeColors, useTheme } from './theme/ThemeContext';

const INTRO_SLIDES: {
  icon: keyof typeof Ionicons.glyphMap;
  eyebrow: string;
  title: string;
  copy: string;
}[] = [
  {
    icon: 'radio-button-on',
    eyebrow: 'Record anywhere',
    title: 'Track ultimate from the sideline, even offline.',
    copy: 'Start a local game with no account, edit rosters, set lines, and keep games saved on this device.',
  },
  {
    icon: 'people-circle-outline',
    eyebrow: 'One team or both',
    title: 'Choose a simple team recorder or full observer mode.',
    copy: 'Follow possession, record blocks, callahans, turnovers, assists, and field locations for either roster.',
  },
  {
    icon: 'sparkles-outline',
    eyebrow: 'Go live later',
    title: 'Create an account when you want the connected app.',
    copy: 'Cloud teams, tournaments, live spectators, player pages, notifications, and public stat cards unlock after sign in.',
  },
];

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [statusType, setStatusType] = useState<'error' | 'success' | ''>('');
  const [introIndex, setIntroIndex] = useState(0);

  // Animation Values
  const slideAnim = useRef(new Animated.Value(300)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;

  const { colors } = useTheme();
  const styles = getStyles(colors);

  useEffect(() => {
    // Trigger smooth slide-up
    Animated.parallel([
        Animated.timing(slideAnim, {
            toValue: 0,
            duration: 800,
            useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
        }),
        Animated.timing(spinAnim, {
            toValue: 1,
            duration: 1500,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        })
    ]).start();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser && !currentUser.isAnonymous) {
        router.replace('/(tabs)/teams');
      }
    });
    return unsubscribe;
  }, [fadeAnim, slideAnim, spinAnim]);

  const setError = (message: string) => {
    setStatusType('error');
    setStatusMsg(message);
  };

  const mapAuthError = (error: any) => {
    const code = error?.code || '';
    switch (code) {
      case 'auth/invalid-email':
        return 'Enter a valid email address.';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Email or password is incorrect.';
      case 'auth/email-already-in-use':
        return 'That email is already registered. Try signing in instead.';
      case 'auth/weak-password':
        return 'Password is too weak. Use at least 6 characters.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please wait a minute and try again.';
      default:
        return error?.message || 'Something went wrong. Please try again.';
    }
  };

  const handleRegister = async () => {
    setStatusMsg('');
    setStatusType('');
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (error: any) { 
      setError(mapAuthError(error));
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    setStatusMsg('');
    setStatusType('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: any) { 
      setError(mapAuthError(error));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    router.push('/forgot-password');
  };

  const handleAppleSignIn = async () => {
    setStatusMsg('');
    setStatusType('');
    setLoading(true);
    try {
      const rawNonce = await Crypto.getRandomBytesAsync(16).then((bytes) =>
        Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
      );

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: rawNonce,
      });
      if (!credential.identityToken) {
        throw new Error('Apple did not return an identity token.');
      }
      const provider = new OAuthProvider('apple.com');
      const firebaseCredential = provider.credential({
        idToken: credential.identityToken,
        rawNonce,
      });
      await signInWithCredential(auth, firebaseCredential);
    } catch (error: any) {
      if (error?.code !== 'ERR_REQUEST_CANCELED') {
        setError(mapAuthError(error));
      }
    } finally {
      setLoading(false);
    }
  };

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['-180deg', '0deg']
  });

  const handleTryDemo = () => {
    router.push('/demo');
  };

  const handleJoinObserver = () => {
    router.push('/game/join-observer' as any);
  };

  const introSlide = INTRO_SLIDES[introIndex];

  return (
    <View style={styles.masterContainer}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardContainer}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View style={[styles.headerContainer, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            <Animated.View style={{ transform: [{ rotate: spin }], marginBottom: 16 }}>
                <Ionicons name="aperture" size={80} color={colors.onPrimary} />
            </Animated.View>
            <Text style={styles.title}>RealUltimate</Text>
            <Text style={styles.subtitle}>Offline recorder. Live stats. Tournament command center.</Text>
        </Animated.View>

        <Animated.View style={[styles.introCard, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <View style={styles.introIcon}>
            <Ionicons name={introSlide.icon} size={24} color={colors.onPrimary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.introEyebrow}>{introSlide.eyebrow}</Text>
            <Text style={styles.introTitle}>{introSlide.title}</Text>
            <Text style={styles.introCopy}>{introSlide.copy}</Text>
            <View style={styles.introFooter}>
              <View style={styles.dotRow}>
                {INTRO_SLIDES.map((_, index) => (
                  <TouchableOpacity
                    key={`intro-dot-${index}`}
                    style={[styles.dot, introIndex === index && styles.dotActive]}
                    onPress={() => setIntroIndex(index)}
                    accessibilityLabel={`Show intro page ${index + 1}`}
                  />
                ))}
              </View>
              <TouchableOpacity
                style={styles.nextIntroBtn}
                onPress={() => setIntroIndex((current) => (current + 1) % INTRO_SLIDES.length)}
              >
                <Text style={styles.nextIntroText}>Next</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
        
        <Animated.View style={[styles.formContainer, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <TextInput
            style={styles.input}
            placeholder="Email Address"
            placeholderTextColor={colors.textSecondary}
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              if (statusType === 'error') {
                setStatusMsg('');
                setStatusType('');
              }
            }}
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={colors.textSecondary}
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              if (statusType === 'error') {
                setStatusMsg('');
                setStatusType('');
              }
            }}
            secureTextEntry
          />

          {statusMsg ? (
            <View style={[styles.messageBox, statusType === 'error' ? styles.errorBox : styles.successBox]}>
              <Text style={[styles.messageText, statusType === 'error' ? styles.errorText : styles.successText]}>{statusMsg}</Text>
            </View>
          ) : null}

          {loading ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 20 }} />
          ) : (
            <View style={styles.buttonGroup}>
              <TouchableOpacity style={styles.primaryButton} onPress={handleLogin} activeOpacity={0.8}>
                <Text style={styles.primaryButtonText}>Sign In</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.secondaryButton} onPress={handleRegister} activeOpacity={0.6}>
                <Text style={styles.secondaryButtonText}>Create Account</Text>
              </TouchableOpacity>

              {Platform.OS === 'ios' && (
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                  cornerRadius={10}
                  style={styles.appleButton}
                  onPress={handleAppleSignIn}
                />
              )}

              <TouchableOpacity style={styles.demoButton} onPress={handleTryDemo} activeOpacity={0.8}>
                <Ionicons name="play-circle-outline" size={20} color={colors.primary} />
                <Text style={styles.demoButtonText}>Continue offline, no account</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.observerButton} onPress={handleJoinObserver} activeOpacity={0.85}>
                <Ionicons name="radio-outline" size={20} color={colors.onPrimary} />
                <Text style={styles.observerButtonText}>Join Game as Observer</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.tertiaryButton} onPress={handleForgotPassword} activeOpacity={0.7}>
                <Text style={styles.tertiaryButtonText}>Forgot Password?</Text>
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const getStyles = (colors: ThemeColors) => {
  const Typography = getTypography(colors);
  return StyleSheet.create({
    masterContainer: { flex: 1, backgroundColor: colors.primary },
    keyboardContainer: { flex: 1 },
    scrollContent: { flexGrow: 1, justifyContent: 'center', padding: Layout.padding },
    
    headerContainer: { alignItems: 'center', marginBottom: 18 },
    title: { ...Typography.title, fontSize: 40, color: colors.onPrimary, letterSpacing: -1 },
    subtitle: { ...Typography.subtitle, color: colors.primaryLight, marginTop: 8 },
    introCard: { flexDirection: 'row', gap: 14, backgroundColor: 'rgba(255,255,255,0.13)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.24)', borderRadius: Layout.radiusXl, padding: 16, marginBottom: 18 },
    introIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' },
    introEyebrow: { ...Typography.label, color: colors.primaryLight, letterSpacing: 1.4, marginBottom: 4 },
    introTitle: { ...Typography.subtitle, color: colors.onPrimary, fontWeight: '900', lineHeight: 21 },
    introCopy: { ...Typography.bodySmall, color: colors.primaryLight, lineHeight: 19, marginTop: 6 },
    introFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
    dotRow: { flexDirection: 'row', gap: 6 },
    dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.36)' },
    dotActive: { width: 22, backgroundColor: colors.onPrimary },
    nextIntroBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)' },
    nextIntroText: { ...Typography.caption, color: colors.onPrimary, fontWeight: '900' },
    
    formContainer: { backgroundColor: colors.surface, padding: 30, borderRadius: Layout.radiusXl, ...Layout.shadow },
    
    input: { ...Typography.body, backgroundColor: colors.surface, padding: 16, borderRadius: Layout.radiusMd, color: colors.text, marginBottom: 16, borderWidth: 1, borderColor: colors.border },
    
    buttonGroup: { marginTop: 10 },
    primaryButton: { backgroundColor: colors.primary, padding: 16, borderRadius: Layout.radiusMd, alignItems: 'center', marginBottom: 16 },
    primaryButtonText: { ...Typography.button, color: colors.onPrimary },
    
    secondaryButton: { padding: 16, alignItems: 'center' },
    secondaryButtonText: { ...Typography.button, color: colors.primary },
    appleButton: { width: '100%', height: 48, marginBottom: 12 },
    demoButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, marginBottom: 8, borderRadius: Layout.radiusMd, backgroundColor: colors.primaryLight, borderWidth: 1, borderColor: colors.primary },
    demoButtonText: { ...Typography.button, color: colors.primary },
    observerButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, marginBottom: 8, borderRadius: Layout.radiusMd, backgroundColor: colors.live, borderWidth: 1, borderColor: colors.liveBorder },
    observerButtonText: { ...Typography.button, color: colors.onLive },
    tertiaryButton: { paddingTop: 4, paddingBottom: 8, alignItems: 'center' },
    tertiaryButtonText: { ...Typography.bodySmall, color: colors.textSecondary, textDecorationLine: 'underline' },
    
    messageBox: { padding: 12, borderRadius: Layout.radiusMd, marginBottom: 16, borderWidth: 1 },
    messageText: { ...Typography.bodySmall, textAlign: 'center', fontWeight: '600' },
    errorBox: { backgroundColor: colors.errorBg, borderColor: colors.error },
    errorText: { color: colors.error },
    successBox: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
    successText: { color: colors.primary }
  });
}