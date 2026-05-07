import { Alert, Platform } from "react-native";

/** Firebase / misc errors don't always subclass Error — normalize for UI. */
export function formatErrorMessage(e: unknown): string {
    if (e instanceof Error) return e.message || String(e);
    if (typeof e === "string") return e;
    if (typeof e === "object" && e !== null && "message" in e) {
        const m = (e as { message?: unknown }).message;
        if (typeof m === "string") return m;
    }
    return String(e);
}

/** RN `Alert.alert` is unreliable on web (multi-button actions often never fire). */
export function alertUser(title: string, message?: string): void {
    const body = message ? `${title}\n\n${message}` : title;
    if (Platform.OS === "web" && typeof window !== "undefined") {
        window.alert(body);
        return;
    }
    if (message !== undefined) {
        Alert.alert(title, message);
    } else {
        Alert.alert(title);
    }
}

/** Confirm destructive action — uses `window.confirm` on web so callbacks always run. */
export function confirmDestructive(title: string, message: string, confirmLabel = "Remove"): Promise<boolean> {
    if (Platform.OS === "web" && typeof window !== "undefined") {
        return Promise.resolve(window.confirm(`${title}\n\n${message}`));
    }
    return new Promise((resolve) => {
        Alert.alert(title, message, [
            { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
            { text: confirmLabel, style: "destructive", onPress: () => resolve(true) },
        ]);
    });
}
