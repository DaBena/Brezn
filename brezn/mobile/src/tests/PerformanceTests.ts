import { breznNative, PostFFI, NetworkStatusFFI, PerformanceMetrics } from '../native/BreznNativeModule';

/**
 * Performance Tests for Brezn Mobile FFI
 * Tests various aspects of performance and memory usage
 */
export class PerformanceTests {
  private testResults: Map<string, any> = new Map();
  private startTime: number = 0;
  private memoryUsage: number = 0;

  constructor() {
    this.initializeTests();
  }

  /**
   * Initialize test environment
   */
  private async initializeTests(): Promise<void> {
    try {
      console.log('🧪 Initializing Performance Tests...');
      
      // Initialize Brezn FFI
      const initResult = await breznNative.init(8080, 9050);
      if (!initResult) {
        throw new Error('Failed to initialize Brezn FFI');
      }

      // Start the app
      const startResult = await breznNative.start();
      if (!startResult) {
        throw new Error('Failed to start Brezn app');
      }

      console.log('✅ Performance Tests initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Performance Tests:', error);
      throw error;
    }
  }

  /**
   * Start performance measurement
   */
  private startMeasurement(): void {
    this.startTime = performance.now();
    this.memoryUsage = (performance as any).memory?.usedJSHeapSize || 0;
  }

  /**
   * End performance measurement
   */
  private endMeasurement(): { duration: number; memoryDelta: number } {
    const endTime = performance.now();
    const endMemory = (performance as any).memory?.usedJSHeapSize || 0;
    
    return {
      duration: endTime - this.startTime,
      memoryDelta: endMemory - this.memoryUsage
    };
  }

  /**
   * Run all performance tests
   */
  async runAllTests(): Promise<Map<string, any>> {
    console.log('🚀 Starting Performance Test Suite...');
    
    try {
      // Core functionality tests
      await this.testInitializationPerformance();
      await this.testPostCreationPerformance();
      await this.testPostRetrievalPerformance();
      await this.testNetworkStatusPerformance();
      await this.testQrCodeGenerationPerformance();
      await this.testTorOperationsPerformance();
      
      // Memory and resource tests
      await this.testMemoryUsage();
      await this.testConcurrentOperations();
      await this.testStressTest();
      
      // Cleanup
      await this.testCleanupPerformance();
      
      console.log('✅ All Performance Tests completed successfully');
      return this.testResults;
      
    } catch (error) {
      console.error('❌ Performance Tests failed:', error);
      throw error;
    }
  }

  /**
   * Test initialization performance
   */
  async testInitializationPerformance(): Promise<void> {
    console.log('📊 Testing Initialization Performance...');
    
    this.startMeasurement();
    
    // Test multiple initialization cycles
    for (let i = 0; i < 5; i++) {
      await breznNative.cleanup();
      await breznNative.init(8080 + i, 9050 + i);
      await breznNative.start();
    }
    
    const { duration, memoryDelta } = this.endMeasurement();
    
    this.testResults.set('initialization', {
      duration: duration / 5, // Average per cycle
      memoryDelta,
      cycles: 5
    });
    
    console.log(`✅ Initialization: ${(duration / 5).toFixed(2)}ms per cycle`);
  }

  /**
   * Test post creation performance
   */
  async testPostCreationPerformance(): Promise<void> {
    console.log('📊 Testing Post Creation Performance...');
    
    const postCounts = [1, 10, 50, 100];
    const results: any[] = [];
    
    for (const count of postCounts) {
      this.startMeasurement();
      
      // Create multiple posts
      const promises = Array.from({ length: count }, (_, i) => 
        breznNative.createPost(
          `Test post ${i} - ${'x'.repeat(100)}`, // 100 character content
          `user_${i}`
        )
      );
      
      await Promise.all(promises);
      
      const { duration, memoryDelta } = this.endMeasurement();
      
      results.push({
        postCount: count,
        duration,
        memoryDelta,
        postsPerSecond: (count / duration) * 1000
      });
    }
    
    this.testResults.set('postCreation', results);
    
    console.log(`✅ Post Creation: ${results[results.length - 1].postsPerSecond.toFixed(2)} posts/sec`);
  }

  /**
   * Test post retrieval performance
   */
  async testPostRetrievalPerformance(): Promise<void> {
    console.log('📊 Testing Post Retrieval Performance...');
    
    this.startMeasurement();
    
    // Retrieve posts multiple times
    const iterations = 10;
    let totalPosts = 0;
    
    for (let i = 0; i < iterations; i++) {
      const posts = await breznNative.getPosts();
      totalPosts += posts.length;
    }
    
    const { duration, memoryDelta } = this.endMeasurement();
    
    this.testResults.set('postRetrieval', {
      duration: duration / iterations,
      memoryDelta,
      iterations,
      totalPosts,
      averagePostsPerRetrieval: totalPosts / iterations
    });
    
    console.log(`✅ Post Retrieval: ${(duration / iterations).toFixed(2)}ms per retrieval`);
  }

  /**
   * Test network status performance
   */
  async testNetworkStatusPerformance(): Promise<void> {
    console.log('📊 Testing Network Status Performance...');
    
    this.startMeasurement();
    
    // Get network status multiple times
    const iterations = 20;
    const results: NetworkStatusFFI[] = [];
    
    for (let i = 0; i < iterations; i++) {
      const status = await breznNative.getNetworkStatus();
      results.push(status);
    }
    
    const { duration, memoryDelta } = this.endMeasurement();
    
    this.testResults.set('networkStatus', {
      duration: duration / iterations,
      memoryDelta,
      iterations,
      averagePeers: results.reduce((sum, status) => sum + status.peersCount, 0) / iterations
    });
    
    console.log(`✅ Network Status: ${(duration / iterations).toFixed(2)}ms per retrieval`);
  }

  /**
   * Test QR code generation performance
   */
  async testQrCodeGenerationPerformance(): Promise<void> {
    console.log('📊 Testing QR Code Generation Performance...');
    
    this.startMeasurement();
    
    // Generate QR codes multiple times
    const iterations = 10;
    const qrCodes: string[] = [];
    
    for (let i = 0; i < iterations; i++) {
      const qrCode = await breznNative.generateQrCode();
      qrCodes.push(qrCode);
    }
    
    const { duration, memoryDelta } = this.endMeasurement();
    
    this.testResults.set('qrCodeGeneration', {
      duration: duration / iterations,
      memoryDelta,
      iterations,
      averageQrCodeLength: qrCodes.reduce((sum, qr) => sum + qr.length, 0) / iterations
    });
    
    console.log(`✅ QR Code Generation: ${(duration / iterations).toFixed(2)}ms per generation`);
  }

  /**
   * Test Tor operations performance
   */
  async testTorOperationsPerformance(): Promise<void> {
    console.log('📊 Testing Tor Operations Performance...');
    
    // Test Tor enable/disable cycle
    this.startMeasurement();
    
    await breznNative.enableTor();
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for Tor to stabilize
    await breznNative.disableTor();
    
    const { duration, memoryDelta } = this.endMeasurement();
    
    this.testResults.set('torOperations', {
      duration,
      memoryDelta,
      operations: ['enable', 'disable']
    });
    
    console.log(`✅ Tor Operations: ${duration.toFixed(2)}ms for enable/disable cycle`);
  }

  /**
   * Test memory usage patterns
   */
  async testMemoryUsage(): Promise<void> {
    console.log('📊 Testing Memory Usage...');
    
    const memorySnapshots: number[] = [];
    
    // Take memory snapshots during different operations
    for (let i = 0; i < 5; i++) {
      const posts = await breznNative.getPosts();
      memorySnapshots.push((performance as any).memory?.usedJSHeapSize || 0);
      
      // Create some posts
      await breznNative.createPost(`Memory test post ${i}`, `memory_user_${i}`);
      
      memorySnapshots.push((performance as any).memory?.usedJSHeapSize || 0);
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    this.testResults.set('memoryUsage', {
      snapshots: memorySnapshots,
      averageMemory: memorySnapshots.reduce((sum, mem) => sum + mem, 0) / memorySnapshots.length,
      memoryVariance: this.calculateVariance(memorySnapshots)
    });
    
    console.log(`✅ Memory Usage: ${(memorySnapshots.reduce((sum, mem) => sum + mem, 0) / memorySnapshots.length / 1024 / 1024).toFixed(2)}MB average`);
  }

  /**
   * Test concurrent operations
   */
  async testConcurrentOperations(): Promise<void> {
    console.log('📊 Testing Concurrent Operations...');
    
    this.startMeasurement();
    
    // Run multiple operations concurrently
    const concurrentOperations = 5;
    const operations = [
      () => breznNative.getPosts(),
      () => breznNative.getNetworkStatus(),
      () => breznNative.generateQrCode(),
      () => breznNative.getPerformanceMetrics(),
      () => breznNative.getDeviceInfo()
    ];
    
    const promises = Array.from({ length: concurrentOperations }, (_, i) => 
      operations[i % operations.length]()
    );
    
    await Promise.all(promises);
    
    const { duration, memoryDelta } = this.endMeasurement();
    
    this.testResults.set('concurrentOperations', {
      duration,
      memoryDelta,
      concurrentOperations,
      operationsPerSecond: (concurrentOperations / duration) * 1000
    });
    
    console.log(`✅ Concurrent Operations: ${(concurrentOperations / duration * 1000).toFixed(2)} ops/sec`);
  }

  /**
   * Test stress conditions
   */
  async testStressTest(): Promise<void> {
    console.log('📊 Testing Stress Conditions...');
    
    this.startMeasurement();
    
    // Create many posts rapidly
    const stressPostCount = 200;
    const batchSize = 20;
    const results: any[] = [];
    
    for (let i = 0; i < stressPostCount; i += batchSize) {
      const batchStart = performance.now();
      
      const batch = Array.from({ length: Math.min(batchSize, stressPostCount - i) }, (_, j) => 
        breznNative.createPost(
          `Stress test post ${i + j} - ${'x'.repeat(50)}`,
          `stress_user_${i + j}`
        )
      );
      
      await Promise.all(batch);
      
      const batchDuration = performance.now() - batchStart;
      results.push({
        batch: Math.floor(i / batchSize),
        duration: batchDuration,
        postsPerSecond: (batch.length / batchDuration) * 1000
      });
    }
    
    const { duration, memoryDelta } = this.endMeasurement();
    
    this.testResults.set('stressTest', {
      totalDuration: duration,
      memoryDelta,
      totalPosts: stressPostCount,
      batches: results,
      averagePostsPerSecond: (stressPostCount / duration) * 1000
    });
    
    console.log(`✅ Stress Test: ${(stressPostCount / duration * 1000).toFixed(2)} posts/sec under stress`);
  }

  /**
   * Test cleanup performance
   */
  async testCleanupPerformance(): Promise<void> {
    console.log('📊 Testing Cleanup Performance...');
    
    this.startMeasurement();
    
    await breznNative.cleanup();
    
    const { duration, memoryDelta } = this.endMeasurement();
    
    this.testResults.set('cleanup', {
      duration,
      memoryDelta
    });
    
    console.log(`✅ Cleanup: ${duration.toFixed(2)}ms`);
  }

  /**
   * Calculate variance of a number array
   */
  private calculateVariance(numbers: number[]): number {
    const mean = numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
    const squaredDiffs = numbers.map(num => Math.pow(num - mean, 2));
    return squaredDiffs.reduce((sum, diff) => sum + diff, 0) / numbers.length;
  }

  /**
   * Generate performance report
   */
  generateReport(): string {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalTests: this.testResults.size,
        averageResponseTime: this.calculateAverageResponseTime(),
        memoryEfficiency: this.calculateMemoryEfficiency(),
        throughput: this.calculateThroughput()
      },
      detailedResults: Object.fromEntries(this.testResults)
    };
    
    return JSON.stringify(report, null, 2);
  }

  /**
   * Calculate average response time across all tests
   */
  private calculateAverageResponseTime(): number {
    let totalTime = 0;
    let testCount = 0;
    
    for (const result of this.testResults.values()) {
      if (result.duration) {
        totalTime += result.duration;
        testCount++;
      }
    }
    
    return testCount > 0 ? totalTime / testCount : 0;
  }

  /**
   * Calculate memory efficiency
   */
  private calculateMemoryEfficiency(): number {
    let totalMemory = 0;
    let testCount = 0;
    
    for (const result of this.testResults.values()) {
      if (result.memoryDelta) {
        totalMemory += Math.abs(result.memoryDelta);
        testCount++;
      }
    }
    
    return testCount > 0 ? totalMemory / testCount : 0;
  }

  /**
   * Calculate overall throughput
   */
  private calculateThroughput(): number {
    let totalOperations = 0;
    let totalTime = 0;
    
    for (const result of this.testResults.values()) {
      if (result.postsPerSecond) {
        totalOperations += result.postsPerSecond;
        totalTime += result.duration || 0;
      }
    }
    
    return totalTime > 0 ? totalOperations / totalTime : 0;
  }
}

// Export test runner
export const runPerformanceTests = async (): Promise<string> => {
  const tests = new PerformanceTests();
  await tests.runAllTests();
  return tests.generateReport();
};