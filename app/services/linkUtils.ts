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

export const isVerifiedSocialLink = (platform: string, input: string): boolean => {
    const host = getHostname(input);
    if (!host) return false;

    if (platform === 'x') return host.includes('x.com') || host.includes('twitter.com');
    if (platform === 'youtube') return host.includes('youtube.com') || host.includes('youtu.be');
    if (platform === 'facebook') return host.includes('facebook.com') || host.includes('fb.com');
    if (platform === 'instagram') return host.includes('instagram.com');
    if (platform === 'tiktok') return host.includes('tiktok.com');
    if (platform === 'website') return !!host;
    return false;
};

export const isVerifiedMediaLink = (type: 'image' | 'youtube' | 'link', input: string): boolean => {
    const host = getHostname(input);
    if (!host) return false;

    if (type === 'youtube') return host.includes('youtube.com') || host.includes('youtu.be');
    if (type === 'image') return /\.(jpg|jpeg|png|gif|webp)$/i.test(input) || host.includes('imgur.com') || host.includes('cloudinary.com');
    return !!host;
};
