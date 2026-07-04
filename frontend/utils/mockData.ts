import { Run, Phase, AcceptanceCriteria, Decision, PhaseStep } from '../types';

const domains = [
  'Frontend Redesign',
  'API Architecture',
  'Database Schema',
  'CLI Tool',
  'Testing Framework',
  'Documentation',
  'Performance Optimization',
];

const descriptions = [
  'Implement modern dashboard with real-time updates',
  'Design scalable microservices architecture',
  'Optimize database queries and indexing',
  'Build command-line interface with auto-completion',
  'Set up comprehensive test coverage',
  'Write technical documentation and guides',
  'Reduce load time and improve throughput',
];

export function generateMockAcceptanceCriteria(count: number): AcceptanceCriteria[] {
  const criteria: AcceptanceCriteria[] = [];
  const titles = [
    'Performance meets SLA targets',
    'Mobile responsiveness verified',
    'Accessibility compliance achieved',
    'Security audit passed',
    'Documentation complete',
    'Test coverage above 80%',
    'API contracts validated',
    'Error handling robust',
  ];

  for (let i = 0; i < Math.min(count, titles.length); i++) {
    const rand = Math.random();
    const status = rand < 0.4 ? 'done' : rand < 0.7 ? 'in-progress' : 'todo';

    criteria.push({
      id: `ac-${i}`,
      title: titles[i],
      description: `Acceptance criteria ${i + 1}`,
      status: status as any,
      priority: ['critical', 'high', 'medium', 'low'][Math.floor(Math.random() * 4)] as any,
      completedAt: status === 'done' ? Date.now() - Math.random() * 3600000 : undefined,
    });
  }

  return criteria;
}

export function generateMockDecisions(phaseCount: number): Decision[] {
  const verdicts: VerdictType[] = ['pass', 'improve', 'redesign', 'blocker'];
  const phases: Phase[] = ['planning', 'building', 'reviewing', 'judging'];
  const decisions: Decision[] = [];

  for (let i = 0; i < phaseCount; i++) {
    const verdict = verdicts[Math.floor(Math.random() * verdicts.length)] as any;
    decisions.push({
      id: `decision-${i}`,
      timestamp: Date.now() - (phaseCount - i) * 600000,
      phase: phases[Math.min(i, phases.length - 1)] as any,
      verdict,
      reasoning: `The system analyzed the implementation and determined it ${verdict === 'pass' ? 'meets all requirements' : 'needs improvements'}`,
      suggestedFixes: [
        'Optimize critical path',
        'Add error handling',
        'Improve documentation',
      ].slice(0, Math.floor(Math.random() * 3) + 1),
      accepted: Math.random() > 0.3,
      criticalRisks: verdict === 'blocker' ? ['Security vulnerability', 'Performance regression'] : [],
    });
  }

  return decisions;
}

export function generateMockPhases(count: number): PhaseStep[] {
  const phaseNames: Phase[] = ['planning', 'building', 'reviewing', 'judging', 'complete'];
  const phases: PhaseStep[] = [];
  let startTime = Date.now() - 10800000; // 3 hours ago

  for (let i = 0; i < Math.min(count, phaseNames.length); i++) {
    const duration = 600000 + Math.random() * 1200000; // 10-30 minutes
    const phaseStatus =
      i < Math.random() * 5 ? 'completed' :
      i < Math.random() * 5 + 1 ? 'in-progress' :
      'pending';

    phases.push({
      phase: phaseNames[i],
      status: phaseStatus as any,
      startedAt: startTime,
      completedAt: phaseStatus === 'completed' ? startTime + duration : undefined,
      logOutput: generateMockLogs(phaseStatus === 'pending' ? 0 : 10 + Math.random() * 20),
      errorMessage: phaseStatus === 'in-progress' && Math.random() > 0.7 ? 'Build failed: dependency conflict' : undefined,
    });

    startTime += duration + 60000;
  }

  return phases;
}

function generateMockLogs(lineCount: number): string {
  const operations = [
    'Validating input parameters...',
    'Initializing build environment...',
    'Compiling TypeScript definitions...',
    'Running ESLint checks...',
    'Bundling application...',
    'Optimizing assets...',
    'Creating production build...',
    'Generating sourcemaps...',
    'Testing coverage reports...',
    'Preparing deployment package...',
  ];

  let logs = '';
  for (let i = 0; i < lineCount; i++) {
    const op = operations[Math.floor(Math.random() * operations.length)];
    const time = new Date(Date.now() - (lineCount - i) * 5000).toISOString();
    logs += `[${time}] ${op}\n`;
  }

  return logs;
}

export function generateMockRun(index: number, overrides?: Partial<Run>): Run {
  const now = Date.now();
  const createdAt = now - (index * 3600000); // Stagger by hours
  const rand = Math.random();

  const status: RunStatus = rand < 0.2 ? 'success' : rand < 0.35 ? 'failed' : rand < 0.5 ? 'running' : 'queued';
  const currentPhase: Phase = status === 'success' ? 'complete' : ['planning', 'building', 'reviewing', 'judging'][Math.floor(Math.random() * 4)] as any;
  const progress = status === 'success' ? 100 : Math.floor(Math.random() * 90) + 10;
  const acProgress = Math.floor(Math.random() * 100);

  const domainIdx = Math.floor(Math.random() * domains.length);
  const domain = domains[domainIdx];
  const description = descriptions[domainIdx];

  return {
    id: `run-${index}`,
    status,
    currentPhase,
    progress,
    acceptanceCriteria: generateMockAcceptanceCriteria(4 + Math.floor(Math.random() * 4)),
    acProgress,
    decisions: generateMockDecisions(2 + Math.floor(Math.random() * 3)),
    phases: generateMockPhases(4),
    createdAt,
    startedAt: status !== 'queued' ? createdAt + 30000 : undefined,
    completedAt: status === 'success' ? now - Math.random() * 1800000 : undefined,
    elapsedTime: status === 'running' ? now - (createdAt + 30000) : 0,
    domain,
    description,
    retryCount: Math.floor(Math.random() * 3),
    lastError: status === 'failed' ? {
      message: 'Build failed: Test coverage below threshold',
      phase: 'reviewing' as Phase,
      stack: 'Error at Runner.execute\n    at async handleBuild',
    } : undefined,
    ...overrides,
  };
}

export function generateMockRuns(count: number = 10): Run[] {
  const runs: Run[] = [];
  for (let i = 0; i < count; i++) {
    runs.push(generateMockRun(i));
  }
  return runs;
}

type VerdictType = 'pass' | 'improve' | 'redesign' | 'blocker';
type RunStatus = 'queued' | 'running' | 'success' | 'failed' | 'cancelled';
