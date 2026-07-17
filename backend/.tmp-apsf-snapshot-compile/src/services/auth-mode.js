export function resolveAuthMode() {
    const raw = (process.env.AUTH_MODE ?? '').trim();
    if (raw === '' || raw === 'demo')
        return { mode: 'demo', invalid: false, raw };
    if (raw === 'basic')
        return { mode: 'basic', invalid: false, raw };
    return { mode: 'demo', invalid: true, raw };
}
export function getAuthMode() {
    return resolveAuthMode().mode;
}
