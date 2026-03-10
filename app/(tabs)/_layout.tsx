import Ionicons from '@expo/vector-icons/Ionicons'
import { Tabs, router } from 'expo-router'
import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../firebaseConfig';

export default function TabLayout() {
    
    // Auth Guard
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (!user) {
                // Not logged in? Get out of the tabs!
                router.replace('/');
            }
        });
        return unsubscribe;
    }, []);

    return (
        <Tabs
            screenOptions={{
                tabBarActiveTintColor: '#ffd33d',
                headerStyle: { backgroundColor: '#25292e' },
                headerShadowVisible: false,
                headerTintColor: '#fff',
                tabBarStyle: { backgroundColor: '#25292e' },
            }}
        >
            <Tabs.Screen
                name="teams"
                options={{
                    title: 'Teams',
                    tabBarIcon: ({ color, focused }) => (
                        <Ionicons name={focused ? 'shield' : 'shield-outline'} color={color} size={24} />
                    )
                }} />
            <Tabs.Screen
                name="profile"
                options={{
                    title: 'Profile',
                    tabBarIcon: ({ color, focused }) => (
                        <Ionicons name={focused ? 'person' : 'person-outline'} color={color} size={24} />
                    )
                }} />
        </Tabs>
    )
}