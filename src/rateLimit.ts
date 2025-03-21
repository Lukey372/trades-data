import { setTimeout } from 'timers/promises';

class RateLimiter {
  private queue: Array<() => Promise<any>> = [];
  private processing = false;
  private lastRequestTime = 0;
  private requestsInWindow = 0;
  private readonly minDelay: number;
  private readonly maxRequestsPerWindow: number;
  private readonly windowMs: number;

  constructor(requestsPerSecond: number, windowMs = 1000) {
    this.minDelay = Math.floor(windowMs / requestsPerSecond);
    this.maxRequestsPerWindow = requestsPerSecond;
    this.windowMs = windowMs;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await this.executeWithRetry(fn);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      
      if (!this.processing) {
        this.processQueue();
      }
    });
  }

  private async executeWithRetry<T>(
    fn: () => Promise<T>,
    retries = 3,
    baseDelay = 1000
  ): Promise<T> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        await this.waitForRateLimit();
        const result = await fn();
        this.updateRateLimit();
        return result;
      } catch (error: any) {
        if (error?.status === 429 && attempt < retries) {
          const delay = baseDelay * Math.pow(2, attempt);
          console.log(`Rate limited, waiting ${delay}ms before retry ${attempt + 1}/${retries}`);
          await setTimeout(delay);
          continue;
        }
        throw error;
      }
    }
    throw new Error('Max retries exceeded');
  }

  private async waitForRateLimit() {
    const now = Date.now();
    if (now - this.lastRequestTime < this.windowMs) {
      if (this.requestsInWindow >= this.maxRequestsPerWindow) {
        const waitTime = this.windowMs - (now - this.lastRequestTime);
        await setTimeout(waitTime);
        this.requestsInWindow = 0;
      }
    } else {
      this.requestsInWindow = 0;
    }
  }

  private updateRateLimit() {
    const now = Date.now();
    if (now - this.lastRequestTime >= this.windowMs) {
      this.requestsInWindow = 1;
      this.lastRequestTime = now;
    } else {
      this.requestsInWindow++;
    }
  }

  private async processQueue() {
    this.processing = true;
    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        await task();
      }
    }
    this.processing = false;
  }
}

// Create rate limiters for different APIs
export const heliusRateLimiter = new RateLimiter(50); // 50 requests per second
export const dexscreenerRateLimiter = new RateLimiter(30); // 30 requests per second
export const solanaRpcRateLimiter = new RateLimiter(40); // 40 requests per second
