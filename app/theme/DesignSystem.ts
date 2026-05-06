// Dynamic Design System
//
// "Live" semantic palette
// -----------------------
// `live` tuned brighter for unmistakable LIVE status on hub cards (`onLive` text stays WCAG-AA on fills).
export const LightColors = {
    primary: '#2563EB',
    primaryLight: '#DBEAFE',
    onPrimary: '#FFFFFF',
    /** Transparent so root ImageBackground shows through between surfaces */
    background: 'transparent',
    surface: '#FFFFFF',
    surfaceSecondary: '#F9FAFB',
    text: '#111827',
    textSecondary: '#6B7280',
    border: '#E5E7EB',
    error: '#EF4444',
    errorBg: '#FEE2E2',
    success: '#10B981',
    warning: '#F59E0B',
    // Live semantic palette — vivid “broadcast” red on light surfaces
    live: '#DC2626',          // red-600
    liveStrong: '#B91C1C',    // red-700
    liveSoft: '#FEE2E2',      // red-100
    onLive: '#FFFFFF',
    liveBorder: '#F43F5E',    // rose-500 accent edge
};

export const DarkColors = {
    primary: '#3B82F6', 
    primaryLight: '#1E3A8A', 
    onPrimary: '#FFFFFF',
    /** Tinted so light artwork behind root ImageBackground is not harsh in dark mode */
    background: 'rgba(5, 5, 5, 0.72)',
    surface: '#121212', 
    surfaceSecondary: '#1C1C1E', 
    text: '#F8FAFC', 
    textSecondary: '#A1A1AA', 
    border: '#27272A', 
    error: '#EF4444',
    errorBg: '#450a0a',
    success: '#10B981',
    warning: '#F59E0B',
    // Live semantic palette — punchy reds that still read cleanly on OLED black
    live: '#EF4444',          // red-500
    liveStrong: '#DC2626',    // red-600
    liveSoft: '#3B0A0A',
    onLive: '#FFFFFF',
    liveBorder: '#F87171',    // red-400 rim
};

// Fallback for non-reactive items or transitional state
export const Colors = LightColors;

export const Typography = {
    title: { fontFamily: 'System', fontSize: 24, fontWeight: '700' as const, color: Colors.text },
    subtitle: { fontFamily: 'System', fontSize: 16, fontWeight: '500' as const, color: Colors.textSecondary },
    body: { fontFamily: 'System', fontSize: 16, fontWeight: '400' as const, color: Colors.text },
    bodySmall: { fontFamily: 'System', fontSize: 14, fontWeight: '400' as const, color: Colors.textSecondary },
    caption: { fontFamily: 'System', fontSize: 12, fontWeight: '400' as const, color: Colors.textSecondary },
    label: { fontFamily: 'System', fontSize: 12, fontWeight: '600' as const, color: Colors.textSecondary, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
    button: { fontFamily: 'System', fontSize: 16, fontWeight: '600' as const },
    mono: { fontFamily: 'monospace', fontSize: 14, fontWeight: '600' as const, color: Colors.text },
};

export const getTypography = (c: typeof LightColors) => ({
    title: { fontFamily: 'System', fontSize: 24, fontWeight: '700' as const, color: c.text },
    subtitle: { fontFamily: 'System', fontSize: 16, fontWeight: '500' as const, color: c.textSecondary },
    body: { fontFamily: 'System', fontSize: 16, fontWeight: '400' as const, color: c.text },
    bodySmall: { fontFamily: 'System', fontSize: 14, fontWeight: '400' as const, color: c.textSecondary },
    caption: { fontFamily: 'System', fontSize: 12, fontWeight: '400' as const, color: c.textSecondary },
    label: { fontFamily: 'System', fontSize: 12, fontWeight: '600' as const, color: c.textSecondary, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
    button: { fontFamily: 'System', fontSize: 16, fontWeight: '600' as const },
    mono: { fontFamily: 'monospace', fontSize: 14, fontWeight: '600' as const, color: c.text },
});

export const Layout = {
    radiusSm: 6,
    radiusMd: 12,
    radiusLg: 16,
    radiusXl: 24,
    radiusFull: 9999,
    padding: 20,
    shadow: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    }
};

// 8pt spacing scale — use these instead of one-off margins to keep rhythm tight.
export const Spacing = {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
    section: 40,
};

// Motion tokens — single source of truth for press feedback / haptics policy.
//
// Press behavior contract (TactilePressable):
//   pressed:   scale -> Motion.pressScale, opacity -> Motion.pressOpacity
//   released:  spring back over Motion.pressDurationMs
//   haptic:    fired ONCE on pressIn, gated by Platform (ios/android only)
//
// Heavy/destructive surfaces should request `haptic="heavy"`; primary actions
// `haptic="medium"`; benign toggles/chips `haptic="selection"`.
export const Motion = {
    pressScale: 0.94,
    pressOpacity: 0.9,
    pressTranslateY: 2,
    pressDurationMs: 90,
    enterDurationMs: 220,
    exitDurationMs: 160,
};
