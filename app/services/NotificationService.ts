import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { database, auth } from '../../firebaseConfig';
import { ref, set, remove, get } from 'firebase/database';

export class NotificationService {
    /**
     * Set up how notifications are handled when the app is in the foreground.
     */
    static setupNotificationHandler() {
        Notifications.setNotificationHandler({
            handleNotification: async () => ({
                shouldShowAlert: true,
                shouldPlaySound: true,
                shouldSetBadge: false,
            }),
        });
    }

    /**
     * Request permissions and get the Expo Push Token for the device.
     */
    static async registerForPushNotificationsAsync(): Promise<string | null> {
        let token;

        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('default', {
                name: 'default',
                importance: Notifications.AndroidImportance.MAX,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#34C759',
            });
        }

        if (Device.isDevice) {
            const { status: existingStatus } = await Notifications.getPermissionsAsync();
            let finalStatus = existingStatus;
            
            if (existingStatus !== 'granted') {
                const { status } = await Notifications.requestPermissionsAsync();
                finalStatus = status;
            }
            
            if (finalStatus !== 'granted') {
                console.warn('Failed to get push token for push notification!');
                return null;
            }

            try {
                const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
                if (!projectId) {
                    throw new Error('Project ID not found');
                }
                
                token = (await Notifications.getExpoPushTokenAsync({
                    projectId,
                })).data;
            } catch (e) {
                console.error("Error getting Expo push token:", e);
                return null;
            }
        } else {
            console.log('Must use physical device for Push Notifications');
            return null;
        }

        return token;
    }

    /**
     * Save the token to Firebase so the backend can send notifications to this user.
     */
    static async syncPushToken() {
        const currentUser = auth.currentUser;
        if (!currentUser) return;

        const token = await this.registerForPushNotificationsAsync();
        if (token) {
            try {
                // Save token using a sanitized key to support multiple devices per user
                const tokenKey = token.replace(/[.#$[\]]/g, '_');
                const tokenRef = ref(database, `users/${currentUser.uid}/pushTokens/${tokenKey}`);
                await set(tokenRef, {
                    token,
                    updatedAt: Date.now(),
                    platform: Platform.OS
                });
                console.log("Push token synced to Firebase:", token);
            } catch (e) {
                console.error("Failed to sync push token to Firebase", e);
            }
        }
    }

    /**
     * Remove the token on logout to prevent notifications from being sent to a logged-out device.
     */
    static async removePushToken() {
        const currentUser = auth.currentUser;
        if (!currentUser) return;

        try {
            const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
            if (!projectId) return;

            const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
            if (tokenData && tokenData.data) {
                const tokenKey = tokenData.data.replace(/[.#$[\]]/g, '_');
                const tokenRef = ref(database, `users/${currentUser.uid}/pushTokens/${tokenKey}`);
                await remove(tokenRef);
                console.log("Push token removed from Firebase on logout.");
            }
        } catch (e) {
            console.error("Failed to remove push token", e);
        }
    }

    /**
     * Get push tokens for all followers of a team, respecting their push notification settings.
     */
    static async getPushTokensForTeam(teamId: string, requiredSetting: 'all' | 'game' = 'all'): Promise<string[]> {
        try {
            const usersSnap = await get(ref(database, 'users'));
            if (!usersSnap.exists()) return [];

            const tokens: string[] = [];
            usersSnap.forEach((userSnap) => {
                const userData = userSnap.val();
                if (userData?.spectated_teams?.[teamId]) {
                    const userSetting = userData.pushSetting || 'all';
                    
                    if (userSetting === 'off') return;
                    if (requiredSetting === 'all' && userSetting !== 'all') return;

                    if (userData.pushTokens) {
                        Object.values(userData.pushTokens).forEach((pt: any) => {
                            if (pt.token) tokens.push(pt.token);
                        });
                    }
                }
            });
            return tokens;
        } catch (e) {
            console.error("Failed to fetch push tokens", e);
            return [];
        }
    }

    /**
     * Send an HTTP POST to Expo's Push Server
     */
    static async sendPushNotification(expoPushToken: string, title: string, body: string, data: any = {}) {
        const message = {
            to: expoPushToken,
            sound: 'default',
            title,
            body,
            data,
        };

        try {
            await fetch('https://exp.host/--/api/v2/push/send', {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Accept-encoding': 'gzip, deflate',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(message),
            });
        } catch (e) {
            console.error('Failed to send push notification', e);
        }
    }

    /**
     * Fanout: Dispatch score update to followers
     */
    static async dispatchScoreUpdateNotification(gameId: string, scoredTeamId: string, score1: number, score2: number, scorerName: string) {
        const tokens = await this.getPushTokensForTeam(scoredTeamId, 'all');
        if (tokens.length === 0) return;

        const title = `🚨 ${scorerName} Scored!`;
        const body = `The score is now ${score1} - ${score2}`;
        const data = { gameId, teamId: scoredTeamId };

        const promises = tokens.map(token => this.sendPushNotification(token, title, body, data));
        await Promise.all(promises);
    }

    /**
     * Fanout: Dispatch game start to followers of both teams
     */
    static async dispatchGameStartNotification(gameId: string, team1Id: string, team2Id: string, team1Name: string, team2Name: string) {
        const tokens1 = team1Id ? await this.getPushTokensForTeam(team1Id, 'game') : [];
        const tokens2 = team2Id ? await this.getPushTokensForTeam(team2Id, 'game') : [];
        
        const allTokens = [...new Set([...tokens1, ...tokens2])];
        if (allTokens.length === 0) return;

        const title = `🥏 Game Started!`;
        const body = `${team1Name} vs ${team2Name} is starting now! Tap to follow live.`;
        const data = { gameId };

        const promises = allTokens.map(token => this.sendPushNotification(token, title, body, data));
        await Promise.all(promises);
    }
}
