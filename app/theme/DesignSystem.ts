// Dynamic Design System
export const LightColors = {
    primary: '#2563EB',
    primaryLight: '#DBEAFE',
    onPrimary: '#FFFFFF',
    background: '#F3F4F6',
    surface: '#FFFFFF',
    surfaceSecondary: '#F9FAFB',
    text: '#111827',
    textSecondary: '#6B7280',
    border: '#E5E7EB',
    error: '#EF4444',
    errorBg: '#FEE2E2',
    success: '#10B981',
    warning: '#F59E0B',
};

export const DarkColors = {
    primary: '#3B82F6', 
    primaryLight: '#1E3A8A', 
    onPrimary: '#FFFFFF',
    background: '#050505', 
    surface: '#121212', 
    surfaceSecondary: '#1C1C1E', 
    text: '#F8FAFC', 
    textSecondary: '#A1A1AA', 
    border: '#27272A', 
    error: '#EF4444',
    errorBg: '#450a0a',
    success: '#10B981',
    warning: '#F59E0B',
};

// Fallback for non-reactive items or transitional state
export const Colors = LightColors;

export const Typography = {
    title: { fontFamily: 'System', fontSize: 24, fontWeight: '700' as const, color: Colors.text },
    subtitle: { fontFamily: 'System', fontSize: 16, fontWeight: '500' as const, color: Colors.textSecondary },
    body: { fontFamily: 'System', fontSize: 16, fontWeight: '400' as const, color: Colors.text },
    bodySmall: { fontFamily: 'System', fontSize: 14, fontWeight: '400' as const, color: Colors.textSecondary },
    label: { fontFamily: 'System', fontSize: 12, fontWeight: '600' as const, color: Colors.textSecondary, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
    button: { fontFamily: 'System', fontSize: 16, fontWeight: '600' as const },
};

export const getTypography = (c: typeof LightColors) => ({
    title: { fontFamily: 'System', fontSize: 24, fontWeight: '700' as const, color: c.text },
    subtitle: { fontFamily: 'System', fontSize: 16, fontWeight: '500' as const, color: c.textSecondary },
    body: { fontFamily: 'System', fontSize: 16, fontWeight: '400' as const, color: c.text },
    bodySmall: { fontFamily: 'System', fontSize: 14, fontWeight: '400' as const, color: c.textSecondary },
    label: { fontFamily: 'System', fontSize: 12, fontWeight: '600' as const, color: c.textSecondary, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
    button: { fontFamily: 'System', fontSize: 16, fontWeight: '600' as const },
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
