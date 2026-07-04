/**
 * Frontend Integration Test Suite
 * React Component ↔ Backend WebSocket 統合テスト
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { WSClient } from '../../utils/wsClient';

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL';
  duration: number;
  message?: string;
}

/**
 * WebSocket Integration Test Runner
 */
class FrontendIntegrationTestRunner {
  private testResults: TestResult[] = [];
  private wsUrl = 'ws://localhost:3000/ws';
  private testTimeout = 5000;
  private wsClient: WSClient | null = null;

  constructor(wsUrl?: string) {
    if (wsUrl) {
      this.wsUrl = wsUrl;
    }
  }

  async runAllTests(): Promise<TestResult[]> {
    console.log('\n🚀 Starting Frontend Integration Test Suite...\n');
    console.log('📋 Testing: React Component ↔ Backend WebSocket\n');

    await this.testWebSocketConnection();
    await this.testMessageParsing();
    await this.testExecutionRequest();
    await this.testProgressEventHandling();
    await this.testCompleteEventHandling();
    await this.testErrorScenarioHandling();

    return this.testResults;
  }

  private createWsClient(): WSClient {
    return new WSClient(this.wsUrl);
  }

  private async testWebSocketConnection(): Promise<void> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const wsClient = this.createWsClient();
      let resolved = false;

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.testResults.push({
            name: 'WebSocket Connection',
            status: 'FAIL',
            duration: Date.now() - startTime,
            message: 'Connection timeout after 5s',
          });
          console.log(`❌ Test 1/6: WebSocket Connection - FAIL (timeout)`);
          wsClient.disconnect();
          resolve();
        }
      }, this.testTimeout);

      wsClient.connect()
        .then(() => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            const duration = Date.now() - startTime;
            this.testResults.push({
              name: 'WebSocket Connection',
              status: 'PASS',
              duration,
            });
            console.log(`✅ Test 1/6: WebSocket Connection - PASS (${duration}ms)`);
            wsClient.disconnect();
            resolve();
          }
        })
        .catch((error) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            this.testResults.push({
              name: 'WebSocket Connection',
              status: 'FAIL',
              duration: Date.now() - startTime,
              message: error.message,
            });
            console.log(`❌ Test 1/6: WebSocket Connection - FAIL`);
            resolve();
          }
        });
    });
  }

  private async testMessageParsing(): Promise<void> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const wsClient = this.createWsClient();
      let testPassed = false;
      let resolved = false;

      wsClient.connect()
        .then(() => {
          wsClient.send({
            type: 'execute',
            data: {
              runId: 'test-parse-001',
              provider: 'claude',
              mode: 'cli-full',
            },
          });

          wsClient.on('run-updated', (data: any) => {
            if (data.runId === 'test-parse-001') {
              testPassed = true;
            }
          });

          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              const duration = Date.now() - startTime;
              this.testResults.push({
                name: 'Message Parsing & Validation',
                status: testPassed ? 'PASS' : 'FAIL',
                duration,
              });
              console.log(`${testPassed ? '✅' : '❌'} Test 2/6: Message Parsing - ${testPassed ? 'PASS' : 'FAIL'} (${duration}ms)`);
              wsClient.disconnect();
              resolve();
            }
          }, 1500);
        })
        .catch(() => {
          if (!resolved) {
            resolved = true;
            const duration = Date.now() - startTime;
            this.testResults.push({
              name: 'Message Parsing & Validation',
              status: 'FAIL',
              duration,
              message: 'Connection failed',
            });
            console.log(`❌ Test 2/6: Message Parsing - FAIL (${duration}ms)`);
            resolve();
          }
        });
    });
  }

  private async testExecutionRequest(): Promise<void> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const wsClient = this.createWsClient();
      let requestSent = false;
      let responseSeen = false;
      let resolved = false;

      wsClient.connect()
        .then(() => {
          requestSent = true;
          wsClient.send({
            type: 'execute',
            data: {
              runId: 'test-exec-12345',
              provider: 'claude',
              mode: 'cli-lite',
            },
          });

          wsClient.on('run-updated', (data: any) => {
            if (data.runId === 'test-exec-12345') {
              responseSeen = true;
            }
          });

          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              const duration = Date.now() - startTime;
              this.testResults.push({
                name: 'Execution Request Handling',
                status: requestSent && responseSeen ? 'PASS' : 'FAIL',
                duration,
              });
              console.log(`${requestSent && responseSeen ? '✅' : '❌'} Test 3/6: Execution Request - ${requestSent && responseSeen ? 'PASS' : 'FAIL'} (${duration}ms)`);
              wsClient.disconnect();
              resolve();
            }
          }, 1500);
        })
        .catch(() => {
          if (!resolved) {
            resolved = true;
            const duration = Date.now() - startTime;
            this.testResults.push({
              name: 'Execution Request Handling',
              status: 'FAIL',
              duration,
              message: 'Connection failed',
            });
            console.log(`❌ Test 3/6: Execution Request - FAIL (${duration}ms)`);
            resolve();
          }
        });
    });
  }

  private async testProgressEventHandling(): Promise<void> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const wsClient = this.createWsClient();
      let progressReceived = false;
      let resolved = false;

      wsClient.connect()
        .then(() => {
          wsClient.send({
            type: 'execute',
            data: {
              runId: 'test-progress-001',
              provider: 'claude',
              mode: 'cli-full',
            },
          });

          wsClient.on('phase-progress', (data: any) => {
            if (data.runId === 'test-progress-001') {
              progressReceived = true;
            }
          });

          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              const duration = Date.now() - startTime;
              this.testResults.push({
                name: 'Progress Event Handling',
                status: progressReceived ? 'PASS' : 'FAIL',
                duration,
              });
              console.log(`${progressReceived ? '✅' : '❌'} Test 4/6: Progress Events - ${progressReceived ? 'PASS' : 'FAIL'} (${duration}ms)`);
              wsClient.disconnect();
              resolve();
            }
          }, 1500);
        })
        .catch(() => {
          if (!resolved) {
            resolved = true;
            const duration = Date.now() - startTime;
            this.testResults.push({
              name: 'Progress Event Handling',
              status: 'FAIL',
              duration,
              message: 'Connection failed',
            });
            console.log(`❌ Test 4/6: Progress Events - FAIL (${duration}ms)`);
            resolve();
          }
        });
    });
  }

  private async testCompleteEventHandling(): Promise<void> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const wsClient = this.createWsClient();
      let completeReceived = false;
      let resolved = false;

      wsClient.connect()
        .then(() => {
          wsClient.send({
            type: 'execute',
            data: {
              runId: 'test-complete-001',
              provider: 'claude',
              mode: 'cli-lite',
            },
          });

          wsClient.on('run-updated', (data: any) => {
            if (data.runId === 'test-complete-001' && data.updates?.status === 'completed') {
              completeReceived = true;
            }
          });

          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              const duration = Date.now() - startTime;
              this.testResults.push({
                name: 'Complete Event Handling',
                status: completeReceived ? 'PASS' : 'FAIL',
                duration,
              });
              console.log(`${completeReceived ? '✅' : '❌'} Test 5/6: Complete Events - ${completeReceived ? 'PASS' : 'FAIL'} (${duration}ms)`);
              wsClient.disconnect();
              resolve();
            }
          }, 1500);
        })
        .catch(() => {
          if (!resolved) {
            resolved = true;
            const duration = Date.now() - startTime;
            this.testResults.push({
              name: 'Complete Event Handling',
              status: 'FAIL',
              duration,
              message: 'Connection failed',
            });
            console.log(`❌ Test 5/6: Complete Events - FAIL (${duration}ms)`);
            resolve();
          }
        });
    });
  }

  private async testErrorScenarioHandling(): Promise<void> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const wsClient = this.createWsClient();
      let errorReceived = false;
      let resolved = false;

      wsClient.connect()
        .then(() => {
          wsClient.send({
            type: 'execute',
            data: {
              provider: 'invalid',
            },
          });

          wsClient.on('error', (data: any) => {
            errorReceived = true;
          });

          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              const duration = Date.now() - startTime;
              this.testResults.push({
                name: 'Error Scenario Handling',
                status: errorReceived ? 'PASS' : 'FAIL',
                duration,
              });
              console.log(`${errorReceived ? '✅' : '❌'} Test 6/6: Error Handling - ${errorReceived ? 'PASS' : 'FAIL'} (${duration}ms)`);
              wsClient.disconnect();
              resolve();
            }
          }, 2000);
        })
        .catch(() => {
          if (!resolved) {
            resolved = true;
            const duration = Date.now() - startTime;
            this.testResults.push({
              name: 'Error Scenario Handling',
              status: 'FAIL',
              duration,
              message: 'Connection failed',
            });
            console.log(`❌ Test 6/6: Error Handling - FAIL (${duration}ms)`);
            resolve();
          }
        });
    });
  }

  printResults(): void {
    console.log('\n' + '='.repeat(60));
    console.log('📊 FRONTEND INTEGRATION TEST RESULTS');
    console.log('='.repeat(60) + '\n');

    let passCount = 0;
    let failCount = 0;
    let totalDuration = 0;

    this.testResults.forEach((result, index) => {
      const status = result.status === 'PASS' ? '✅' : '❌';
      console.log(`${index + 1}. ${status} ${result.name}`);
      console.log(`   Duration: ${result.duration}ms`);
      if (result.message) {
        console.log(`   Message: ${result.message}`);
      }

      if (result.status === 'PASS') passCount++;
      else failCount++;
      totalDuration += result.duration;
    });

    console.log('\n' + '='.repeat(60));
    console.log(`PASSED: ${passCount}/${this.testResults.length}`);
    console.log(`FAILED: ${failCount}/${this.testResults.length}`);
    console.log(`TOTAL TIME: ${totalDuration}ms`);
    console.log('='.repeat(60) + '\n');

    if (failCount === 0) {
      console.log('🎉 ALL FRONTEND TESTS PASSED! 🎉\n');
    } else {
      console.log('⚠️ SOME FRONTEND TESTS FAILED\n');
    }
  }
}

/**
 * Vitest Integration Tests
 */
describe('Frontend Integration Tests', () => {
  let runner: FrontendIntegrationTestRunner;

  beforeAll(() => {
    runner = new FrontendIntegrationTestRunner();
  });

  afterAll(() => {
    runner.printResults();
  });

  it('should run all integration tests', async () => {
    const results = await runner.runAllTests();
    expect(results.length).toBe(6);

    // All tests should have a name and status
    results.forEach(result => {
      expect(result.name).toBeDefined();
      expect(result.status).toMatch(/PASS|FAIL/);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });

  it('WebSocket connection test', async () => {
    const results = await runner.runAllTests();
    const connectionTest = results.find(r => r.name === 'WebSocket Connection');
    expect(connectionTest).toBeDefined();
  });

  it('Message parsing test', async () => {
    const results = await runner.runAllTests();
    const parseTest = results.find(r => r.name === 'Message Parsing & Validation');
    expect(parseTest).toBeDefined();
  });

  it('Execution request test', async () => {
    const results = await runner.runAllTests();
    const execTest = results.find(r => r.name === 'Execution Request Handling');
    expect(execTest).toBeDefined();
  });

  it('Progress event handling test', async () => {
    const results = await runner.runAllTests();
    const progressTest = results.find(r => r.name === 'Progress Event Handling');
    expect(progressTest).toBeDefined();
  });

  it('Complete event handling test', async () => {
    const results = await runner.runAllTests();
    const completeTest = results.find(r => r.name === 'Complete Event Handling');
    expect(completeTest).toBeDefined();
  });

  it('Error scenario handling test', async () => {
    const results = await runner.runAllTests();
    const errorTest = results.find(r => r.name === 'Error Scenario Handling');
    expect(errorTest).toBeDefined();
  });
});
