import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { TokenTracker } from '../../src/services/TokenTracker';
import { TokenUsage } from '../../src/types';

describe('TokenTracker', () => {
  let tokenTracker: TokenTracker;

  beforeEach(() => {
    tokenTracker = new TokenTracker();
  });

  describe('initialization', () => {
    it('should start with empty session tokens', () => {
      const session = tokenTracker.getSessionTokens();
      
      expect(session.totalInputTokens).toBe(0);
      expect(session.totalOutputTokens).toBe(0);
      expect(session.totalTokens).toBe(0);
      expect(session.conversationCount).toBe(0);
      expect(session.startTime).toBeCloseTo(Date.now(), -2); // Within 100ms
    });

    it('should return null for non-existent conversation', () => {
      const conversation = tokenTracker.getConversationTokens('non-existent');
      expect(conversation).toBeNull();
    });
  });

  describe('addUsage', () => {
    const sampleUsage: TokenUsage = {
      inputTokens: 100,
      outputTokens: 200,
      totalTokens: 300
    };

    it('should create new conversation tracking', () => {
      tokenTracker.addUsage('conv-1', sampleUsage);
      
      const conversation = tokenTracker.getConversationTokens('conv-1');
      expect(conversation).not.toBeNull();
      expect(conversation!.totalInputTokens).toBe(100);
      expect(conversation!.totalOutputTokens).toBe(200);
      expect(conversation!.totalTokens).toBe(300);
      expect(conversation!.conversationId).toBe('conv-1');
    });

    it('should update session tokens', () => {
      tokenTracker.addUsage('conv-1', sampleUsage);
      
      const session = tokenTracker.getSessionTokens();
      expect(session.totalInputTokens).toBe(100);
      expect(session.totalOutputTokens).toBe(200);
      expect(session.totalTokens).toBe(300);
      expect(session.conversationCount).toBe(1);
    });

    it('should accumulate usage for same conversation', () => {
      tokenTracker.addUsage('conv-1', sampleUsage);
      tokenTracker.addUsage('conv-1', { inputTokens: 50, outputTokens: 75, totalTokens: 125 });
      
      const conversation = tokenTracker.getConversationTokens('conv-1');
      expect(conversation!.totalInputTokens).toBe(150);
      expect(conversation!.totalOutputTokens).toBe(275);
      expect(conversation!.totalTokens).toBe(425);
      
      const session = tokenTracker.getSessionTokens();
      expect(session.totalInputTokens).toBe(150);
      expect(session.totalOutputTokens).toBe(275);
      expect(session.totalTokens).toBe(425);
      expect(session.conversationCount).toBe(1); // Still same conversation
    });

    it('should track multiple conversations', () => {
      tokenTracker.addUsage('conv-1', sampleUsage);
      tokenTracker.addUsage('conv-2', { inputTokens: 50, outputTokens: 25, totalTokens: 75 });
      
      const conv1 = tokenTracker.getConversationTokens('conv-1');
      const conv2 = tokenTracker.getConversationTokens('conv-2');
      const session = tokenTracker.getSessionTokens();
      
      expect(conv1!.totalTokens).toBe(300);
      expect(conv2!.totalTokens).toBe(75);
      expect(session.totalTokens).toBe(375);
      expect(session.conversationCount).toBe(2);
    });
  });

  describe('clearConversation', () => {
    it('should remove conversation from tracking', () => {
      const usage: TokenUsage = { inputTokens: 100, outputTokens: 200, totalTokens: 300 };
      tokenTracker.addUsage('conv-1', usage);
      
      expect(tokenTracker.getConversationTokens('conv-1')).not.toBeNull();
      
      tokenTracker.clearConversation('conv-1');
      
      expect(tokenTracker.getConversationTokens('conv-1')).toBeNull();
    });

    it('should not affect other conversations', () => {
      const usage: TokenUsage = { inputTokens: 100, outputTokens: 200, totalTokens: 300 };
      tokenTracker.addUsage('conv-1', usage);
      tokenTracker.addUsage('conv-2', usage);
      
      tokenTracker.clearConversation('conv-1');
      
      expect(tokenTracker.getConversationTokens('conv-1')).toBeNull();
      expect(tokenTracker.getConversationTokens('conv-2')).not.toBeNull();
    });
  });

  describe('resetSession', () => {
    it('should clear all tracking', () => {
      const usage: TokenUsage = { inputTokens: 100, outputTokens: 200, totalTokens: 300 };
      tokenTracker.addUsage('conv-1', usage);
      tokenTracker.addUsage('conv-2', usage);
      
      tokenTracker.resetSession();
      
      expect(tokenTracker.getConversationTokens('conv-1')).toBeNull();
      expect(tokenTracker.getConversationTokens('conv-2')).toBeNull();
      
      const session = tokenTracker.getSessionTokens();
      expect(session.totalTokens).toBe(0);
      expect(session.conversationCount).toBe(0);
    });
  });

  describe('estimateCost', () => {
    const usage: TokenUsage = {
      inputTokens: 1000,
      outputTokens: 2000,
      totalTokens: 3000
    };

    it('should estimate cost with default rates', () => {
      const cost = tokenTracker.estimateCost(usage);
      
      expect(cost.inputCost).toBeCloseTo(0.003); // 1000/1M * 3
      expect(cost.outputCost).toBeCloseTo(0.03);  // 2000/1M * 15
      expect(cost.totalCost).toBeCloseTo(0.033);
    });

    it('should use Claude 3.5 Sonnet rates', () => {
      const cost = tokenTracker.estimateCost(usage, 'claude-3-5-sonnet-20241022');
      
      expect(cost.inputCost).toBeCloseTo(0.003);
      expect(cost.outputCost).toBeCloseTo(0.03);
      expect(cost.totalCost).toBeCloseTo(0.033);
    });

    it('should use Claude 3.5 Haiku rates', () => {
      const cost = tokenTracker.estimateCost(usage, 'claude-3-5-haiku-20241022');
      
      expect(cost.inputCost).toBeCloseTo(0.00025); // 1000/1M * 0.25
      expect(cost.outputCost).toBeCloseTo(0.0025);  // 2000/1M * 1.25
      expect(cost.totalCost).toBeCloseTo(0.00275);
    });

    it('should use GPT-4o rates', () => {
      const cost = tokenTracker.estimateCost(usage, 'gpt-4o');
      
      expect(cost.inputCost).toBeCloseTo(0.005); // 1000/1M * 5
      expect(cost.outputCost).toBeCloseTo(0.03);  // 2000/1M * 15
      expect(cost.totalCost).toBeCloseTo(0.035);
    });

    it('should use GPT-3.5 Turbo rates', () => {
      const cost = tokenTracker.estimateCost(usage, 'gpt-3.5-turbo');
      
      expect(cost.inputCost).toBeCloseTo(0.0005); // 1000/1M * 0.5
      expect(cost.outputCost).toBeCloseTo(0.003);  // 2000/1M * 1.5
      expect(cost.totalCost).toBeCloseTo(0.0035);
    });
  });

  describe('formatTokenCount', () => {
    it('should format small numbers as-is', () => {
      expect(tokenTracker.formatTokenCount(123)).toBe('123');
      expect(tokenTracker.formatTokenCount(999)).toBe('999');
    });

    it('should format thousands with K suffix', () => {
      expect(tokenTracker.formatTokenCount(1000)).toBe('1.0K');
      expect(tokenTracker.formatTokenCount(1500)).toBe('1.5K');
      expect(tokenTracker.formatTokenCount(12345)).toBe('12.3K');
    });

    it('should format millions with M suffix', () => {
      expect(tokenTracker.formatTokenCount(1000000)).toBe('1.0M');
      expect(tokenTracker.formatTokenCount(2500000)).toBe('2.5M');
      expect(tokenTracker.formatTokenCount(12345678)).toBe('12.3M');
    });
  });

  describe('formatCost', () => {
    it('should show <$0.01 for very small costs', () => {
      expect(tokenTracker.formatCost(0.001)).toBe('<$0.01');
      expect(tokenTracker.formatCost(0.005)).toBe('<$0.01');
    });

    it('should format small costs with 3 decimal places', () => {
      expect(tokenTracker.formatCost(0.012)).toBe('$0.012');
      expect(tokenTracker.formatCost(0.156)).toBe('$0.156');
      expect(tokenTracker.formatCost(0.999)).toBe('$0.999');
    });

    it('should format larger costs with 2 decimal places', () => {
      expect(tokenTracker.formatCost(1.23)).toBe('$1.23');
      expect(tokenTracker.formatCost(12.345)).toBe('$12.35');
      expect(tokenTracker.formatCost(100)).toBe('$100.00');
    });
  });

  describe('cache and memory usage', () => {
    it('should handle cache creation and read tokens', () => {
      const usage: TokenUsage = {
        inputTokens: 100,
        outputTokens: 200,
        totalTokens: 300,
        cacheCreationInputTokens: 50,
        cacheReadInputTokens: 25
      };

      tokenTracker.addUsage('conv-1', usage);
      
      const conversation = tokenTracker.getConversationTokens('conv-1');
      expect(conversation!.totalInputTokens).toBe(100);
      expect(conversation!.totalOutputTokens).toBe(200);
      expect(conversation!.totalTokens).toBe(300);
    });
  });

  describe('edge cases', () => {
    it('should handle zero token usage', () => {
      const usage: TokenUsage = {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0
      };

      tokenTracker.addUsage('conv-1', usage);
      
      const conversation = tokenTracker.getConversationTokens('conv-1');
      expect(conversation!.totalTokens).toBe(0);
      
      const cost = tokenTracker.estimateCost(usage);
      expect(cost.totalCost).toBe(0);
    });

    it('should handle large token counts', () => {
      const usage: TokenUsage = {
        inputTokens: 10000000, // 10M
        outputTokens: 5000000,  // 5M
        totalTokens: 15000000   // 15M
      };

      tokenTracker.addUsage('conv-1', usage);
      
      const formatted = tokenTracker.formatTokenCount(usage.totalTokens);
      expect(formatted).toBe('15.0M');
      
      const cost = tokenTracker.estimateCost(usage);
      expect(cost.totalCost).toBeGreaterThan(100); // Should be significant cost
    });

    it('should handle invalid conversation IDs gracefully', () => {
      expect(() => tokenTracker.clearConversation('')).not.toThrow();
      expect(() => tokenTracker.clearConversation('non-existent')).not.toThrow();
    });
  });

  describe('event listeners', () => {
    it('should notify listeners when tokens are added', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      const unsubscribe1 = tokenTracker.addListener(listener1);
      const unsubscribe2 = tokenTracker.addListener(listener2);

      // Add some usage
      tokenTracker.addUsage('conv-1', {
        inputTokens: 100,
        outputTokens: 200,
        totalTokens: 300
      });

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);

      // Add more usage
      tokenTracker.addUsage('conv-1', {
        inputTokens: 50,
        outputTokens: 100,
        totalTokens: 150
      });

      expect(listener1).toHaveBeenCalledTimes(2);
      expect(listener2).toHaveBeenCalledTimes(2);

      // Unsubscribe one listener
      unsubscribe1();

      tokenTracker.addUsage('conv-2', {
        inputTokens: 25,
        outputTokens: 50,
        totalTokens: 75
      });

      expect(listener1).toHaveBeenCalledTimes(2); // Should not be called again
      expect(listener2).toHaveBeenCalledTimes(3); // Should be called

      // Clean up
      unsubscribe2();
    });

    it('should handle listener errors gracefully', () => {
      const errorListener = jest.fn(() => {
        throw new Error('Test error');
      });
      const normalListener = jest.fn();

      // Mock console.error to suppress error output during test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      tokenTracker.addListener(errorListener);
      tokenTracker.addListener(normalListener);

      tokenTracker.addUsage('conv-1', {
        inputTokens: 100,
        outputTokens: 200,
        totalTokens: 300
      });

      expect(errorListener).toHaveBeenCalledTimes(1);
      expect(normalListener).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalledWith('Error in token tracker listener:', expect.any(Error));

      consoleSpy.mockRestore();
    });
  });
});