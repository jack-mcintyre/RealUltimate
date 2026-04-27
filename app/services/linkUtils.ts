export const ensureHttps = (input: string): string => {
    const trimmed = (input || '').trim();
    if (!trimmed) return '';
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
};

export const isHttpUrl = (input: string): boolean => {
    const normalized = ensureHttps(input);
    if (!normalized) return false;
    try {
        const url = new URL(normalized);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
};

export const getHostname = (input: string): string => {
    const normalized = ensureHttps(input);
    if (!normalized) return '';
    try {
        return new URL(normalized).hostname.toLowerCase();
    } catch {
        return '';
    }
};

const hostMatches = (hostname: string, allowedHost: string): boolean => {
    return hostname === allowedHost || hostname.endsWith(`.${allowedHost}`);
};

export const STREAM_HOST_ALLOWLIST = [
    'youtube.com',
    'youtu.be',
    'twitch.tv',
];

const SOCIAL_HOST_ALLOWLIST: Record<string, string[]> = {
    x: ['x.com', 'twitter.com'],
    youtube: ['youtube.com', 'youtu.be'],
    facebook: ['facebook.com', 'fb.com'],
    instagram: ['instagram.com'],
    tiktok: ['tiktok.com'],
};

export const validateExternalUrl = (
    input: string,
    allowedHosts?: string[]
): { ok: true; url: string; hostname: string } | { ok: false; error: string } => {
    const normalized = ensureHttps(input);
    if (!normalized) {
        return { ok: false, error: 'URL is required.' };
    }

    try {
        const url = new URL(normalized);
        const hostname = url.hostname.toLowerCase();
        const isHttp = url.protocol === 'http:' || url.protocol === 'https:';
        if (!isHttp) {
            return { ok: false, error: 'Only http and https URLs are allowed.' };
        }

        if (allowedHosts && allowedHosts.length > 0) {
            const allowed = allowedHosts.some((allowedHost) => hostMatches(hostname, allowedHost.toLowerCase()));
            if (!allowed) {
                return { ok: false, error: 'This external host is not in the allowlist.' };
            }
        }

        return { ok: true, url: url.toString(), hostname };
    } catch {
        return { ok: false, error: 'Invalid URL format.' };
    }
};

export const validateSocialExternalUrl = (
    platform: string,
    input: string
): { ok: true; url: string; hostname: string } | { ok: false; error: string } => {
    if (platform === 'website') {
        return validateExternalUrl(input);
    }

    const allowlist = SOCIAL_HOST_ALLOWLIST[platform];
    if (!allowlist || allowlist.length === 0) {
        return { ok: false, error: 'Unsupported social platform.' };
    }

    return validateExternalUrl(input, allowlist);
};

export const isVerifiedSocialLink = (platform: string, input: string): boolean => {
    if (platform === 'website') {
        return validateExternalUrl(input).ok;
    }

    const host = getHostname(input);
    const allowlist = SOCIAL_HOST_ALLOWLIST[platform] || [];
    if (!host || allowlist.length === 0) return false;

    return allowlist.some((allowedHost) => hostMatches(host, allowedHost));
};

export const isVerifiedMediaLink = (type: 'image' | 'youtube' | 'link', input: string): boolean => {
    const host = getHostname(input);
    if (!host) return false;

    if (type === 'youtube') return hostMatches(host, 'youtube.com') || hostMatches(host, 'youtu.be');
    if (type === 'image') return /\.(jpg|jpeg|png|gif|webp)$/i.test(input) || hostMatches(host, 'imgur.com') || hostMatches(host, 'cloudinary.com');
    return !!host;
};
