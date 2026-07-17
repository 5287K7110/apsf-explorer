export const DEFAULT_MODES = {
    'cli-full': {
        mode: 'cli-full',
        saveArtifacts: true,
        timeout: 600000,
        maxTurns: 10,
    },
    'cli-lite': {
        mode: 'cli-lite',
        saveArtifacts: false,
        timeout: 300000,
        maxTurns: 5,
    },
    'api': {
        mode: 'api',
        saveArtifacts: true,
        timeout: 300000,
        maxTurns: 10,
    },
    'apsf-run': {
        mode: 'apsf-run',
        saveArtifacts: true,
        timeout: 1800000,
        maxTurns: 10,
    },
};
