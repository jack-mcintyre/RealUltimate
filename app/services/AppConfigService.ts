import { onValue, ref } from 'firebase/database';
import { db } from '../../firebaseConfig';
import { AppLaunchConfig } from './types';

const compareVersions = (left?: string, right?: string) => {
    const a = (left || '0.0.0').split('.').map((part) => Number(part) || 0);
    const b = (right || '0.0.0').split('.').map((part) => Number(part) || 0);
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
        const diff = (a[i] || 0) - (b[i] || 0);
        if (diff !== 0) return diff;
    }
    return 0;
};

export const AppConfigService = {
    subscribeToLaunchConfig: (callback: (config: AppLaunchConfig | null) => void) => {
        return onValue(ref(db, 'appConfig/launch'), (snapshot) => {
            callback(snapshot.exists() ? snapshot.val() as AppLaunchConfig : null);
        });
    },

    isUpgradeRequired: (currentVersion: string, config?: AppLaunchConfig | null) => {
        if (!config?.minSupportedVersion) return false;
        return compareVersions(currentVersion, config.minSupportedVersion) < 0;
    },
};
