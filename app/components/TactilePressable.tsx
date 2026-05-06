import React, { useCallback, useRef } from 'react';
import { Animated, Platform, Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import { Motion } from '../theme/DesignSystem';

// Lazy require so web / non-haptic platforms don't bundle-fail if the module
// is ever unavailable. expo-haptics is in package.json; this is just a guard.
let Haptics: any = null;
try {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
        Haptics = require('expo-haptics');
    }
} catch {
    Haptics = null;
}

export type TactileHaptic = 'none' | 'selection' | 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

const triggerHaptic = (kind: TactileHaptic) => {
    if (!Haptics || kind === 'none') return;
    try {
        switch (kind) {
            case 'selection':
                Haptics.selectionAsync?.();
                return;
            case 'light':
                Haptics.impactAsync?.(Haptics.ImpactFeedbackStyle?.Light);
                return;
            case 'medium':
                Haptics.impactAsync?.(Haptics.ImpactFeedbackStyle?.Medium);
                return;
            case 'heavy':
                Haptics.impactAsync?.(Haptics.ImpactFeedbackStyle?.Heavy);
                return;
            case 'success':
                Haptics.notificationAsync?.(Haptics.NotificationFeedbackType?.Success);
                return;
            case 'warning':
                Haptics.notificationAsync?.(Haptics.NotificationFeedbackType?.Warning);
                return;
            case 'error':
                Haptics.notificationAsync?.(Haptics.NotificationFeedbackType?.Error);
                return;
        }
    } catch {
        // Swallow — haptics are nice-to-have, never block the UI.
    }
};

export interface TactilePressableProps extends Omit<PressableProps, 'style'> {
    style?: StyleProp<ViewStyle>;
    /** Haptic feedback on pressIn. Default `selection`. */
    haptic?: TactileHaptic;
    /** Disable the press-scale animation (e.g. for tiny chip rows). */
    noScale?: boolean;
    children?: React.ReactNode;
}

/**
 * TactilePressable — single primitive for press feedback across the app.
 *
 * Uses Animated transform/opacity with `useNativeDriver: true` so the
 * animation never trips the JS thread during scoring bursts.
 *
 * Replaces ad-hoc `<TouchableOpacity activeOpacity={0.8}>` so spacing,
 * timing, and haptics evolve from a single contract.
 */
export const TactilePressable: React.FC<TactilePressableProps> = ({
    style,
    children,
    haptic = 'selection',
    noScale = false,
    onPressIn,
    onPressOut,
    disabled,
    ...rest
}) => {
    const scale = useRef(new Animated.Value(1)).current;
    const opacity = useRef(new Animated.Value(1)).current;
    const translateY = useRef(new Animated.Value(0)).current;

    const handlePressIn: PressableProps['onPressIn'] = useCallback((e: any) => {
        if (disabled) return;
        if (!noScale) {
            Animated.spring(scale, {
                toValue: Motion.pressScale,
                useNativeDriver: true,
                speed: 52,
                bounciness: 2,
            }).start();
            Animated.spring(translateY, {
                toValue: Motion.pressTranslateY,
                useNativeDriver: true,
                speed: 52,
                bounciness: 0,
            }).start();
            Animated.timing(opacity, {
                toValue: Motion.pressOpacity,
                duration: Motion.pressDurationMs,
                useNativeDriver: true,
            }).start();
        }
        triggerHaptic(haptic);
        onPressIn?.(e);
    }, [disabled, noScale, haptic, onPressIn, scale, opacity, translateY]);

    const handlePressOut: PressableProps['onPressOut'] = useCallback((e: any) => {
        if (!noScale) {
            Animated.spring(scale, {
                toValue: 1,
                useNativeDriver: true,
                speed: 42,
                bounciness: 10,
            }).start();
            Animated.spring(translateY, {
                toValue: 0,
                useNativeDriver: true,
                speed: 42,
                bounciness: 8,
            }).start();
            Animated.timing(opacity, {
                toValue: 1,
                duration: Motion.pressDurationMs,
                useNativeDriver: true,
            }).start();
        }
        onPressOut?.(e);
    }, [noScale, onPressOut, scale, opacity, translateY]);

    return (
        <Pressable
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            disabled={disabled}
            {...rest}
            android_ripple={rest.android_ripple || { color: 'rgba(255,255,255,0.18)', borderless: false }}
        >
            <Animated.View style={[{ transform: [{ scale }, { translateY }], opacity }, style, disabled && { opacity: 0.5 }]}>
                {children}
            </Animated.View>
        </Pressable>
    );
};

export default TactilePressable;
