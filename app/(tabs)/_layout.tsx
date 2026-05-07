import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs, router } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { useEffect } from 'react';
import { auth } from '../../firebaseConfig';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getTypography } from '../theme/DesignSystem';
import { useTheme } from '../theme/ThemeContext';

export default function TabLayout() {
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    
    // Auth Guard
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (!user) {
                router.replace('/');
            }
        });
        return unsubscribe;
    }, []);

    return (
        <Tabs
            detachInactiveScreens
            screenOptions={{
                freezeOnBlur: true,
                sceneStyle: { backgroundColor: 'transparent' },
                tabBarActiveTintColor: colors.primary,
                tabBarInactiveTintColor: colors.textSecondary,
                tabBarStyle: { 
                    backgroundColor: colors.surface, 
                    borderTopWidth: 1, 
                    borderTopColor: colors.border,
                    paddingTop: 4,
                    paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
                    height: 50 + (insets.bottom > 0 ? insets.bottom : 8),
                },
                tabBarLabelStyle: {
                    ...getTypography(colors).label,
                    fontSize: 10,
                    marginTop: 0,
                },
                headerShown: false,
            }}
        >
            <Tabs.Screen
                name="teams"
                options={{
                    title: 'Teams',
                    tabBarIcon: ({ color, focused }) => (
                        <Ionicons name={focused ? 'grid' : 'grid-outline'} color={color} size={22} />
                    )
                }} />
            <Tabs.Screen
                name="tournaments"
                options={{
                    title: 'Tournaments',
                    tabBarIcon: ({ color, focused }) => (
                        <Ionicons name={focused ? 'trophy' : 'trophy-outline'} color={color} size={22} />
                    )
                }} />
            <Tabs.Screen
                name="profile"
                options={{
                    title: 'Profile',
                    tabBarIcon: ({ color, focused }) => (
                        <Ionicons name={focused ? 'person' : 'person-outline'} color={color} size={22} />
                    )
                }} />
        </Tabs>
    )
}