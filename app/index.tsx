import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState, useRef } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View, Animated, Easing } from 'react-native';
import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebaseConfig';
import { getTypography, Layout } from './theme/DesignSystem';
import { useTheme, ThemeColors } from './theme/ThemeContext';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

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
      if (currentUser) {
        router.replace('/(tabs)/teams');
      }
    });
    return unsubscribe;
  }, []);

  const handleRegister = async () => {
    setErrorMsg("");
    if (password.length < 6) {
      setErrorMsg("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (error: any) { 
      setErrorMsg(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    setErrorMsg("");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: any) { 
      setErrorMsg(error.message);
    } finally {
      setLoading(false);
    }
  };

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['-180deg', '0deg']
  });

  return (
    <View style={styles.masterContainer}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardContainer}
      >
        <Animated.View style={[styles.headerContainer, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            <Animated.View style={{ transform: [{ rotate: spin }], marginBottom: 16 }}>
                <Ionicons name="aperture" size={80} color={colors.onPrimary} />
            </Animated.View>
            <Text style={styles.title}>RealUltimate</Text>
            <Text style={styles.subtitle}>Team Management & Live Stats</Text>
        </Animated.View>
        
        <Animated.View style={[styles.formContainer, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <TextInput
            style={styles.input}
            placeholder="Email Address"
            placeholderTextColor={colors.textSecondary}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={colors.textSecondary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          {errorMsg ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMsg}</Text>
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
            </View>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

const getStyles = (colors: ThemeColors) => {
  const Typography = getTypography(colors);
  return StyleSheet.create({
    masterContainer: { flex: 1, backgroundColor: colors.primary },
    keyboardContainer: { flex: 1, justifyContent: 'center', padding: Layout.padding },
    
    headerContainer: { alignItems: 'center', marginBottom: 50 },
    title: { ...Typography.title, fontSize: 40, color: colors.onPrimary, letterSpacing: -1 },
    subtitle: { ...Typography.subtitle, color: colors.primaryLight, marginTop: 8 },
    
    formContainer: { backgroundColor: colors.surface, padding: 30, borderRadius: Layout.radiusXl, ...Layout.shadow },
    
    input: { ...Typography.body, backgroundColor: colors.surface, padding: 16, borderRadius: Layout.radiusMd, color: colors.text, marginBottom: 16, borderWidth: 1, borderColor: colors.border },
    
    buttonGroup: { marginTop: 10 },
    primaryButton: { backgroundColor: colors.primary, padding: 16, borderRadius: Layout.radiusMd, alignItems: 'center', marginBottom: 16 },
    primaryButtonText: { ...Typography.button, color: colors.onPrimary },
    
    secondaryButton: { padding: 16, alignItems: 'center' },
    secondaryButtonText: { ...Typography.button, color: colors.primary },
    
    errorBox: { backgroundColor: colors.errorBg, padding: 12, borderRadius: Layout.radiusMd, marginBottom: 16 },
    errorText: { ...Typography.bodySmall, color: colors.error, textAlign: 'center' }
  });
}