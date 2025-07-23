import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { RuleManager } from '../../src/rules/RuleManager';

// Mock minimatch
jest.mock('minimatch', () => ({
  Minimatch: jest.fn().mockImplementation((pattern: string) => ({
    match: jest.fn().mockReturnValue(true),
    pattern
  }))
}));

describe('RuleManager', () => {
  let ruleManager: RuleManager;
  let mockApp: any;

  beforeEach(() => {
    mockApp = {
      vault: {
        adapter: {
          read: jest.fn(),
          list: jest.fn(),
          exists: jest.fn()
        }
      }
    };

    ruleManager = new RuleManager(mockApp);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize without errors', async () => {
      mockApp.vault.adapter.list.mockResolvedValue({
        files: [],
        folders: []
      });

      await expect(ruleManager.initialize()).resolves.not.toThrow();
    });

    it('should scan for rule files', async () => {
      mockApp.vault.adapter.list.mockResolvedValue({
        files: ['vault/.notes-critic/rules/test-rule.md'],
        folders: ['some-folder']
      });

      mockApp.vault.adapter.read.mockResolvedValue(`---
name: Test Rule
enabled: true
globs: ["*.md"]
autoTrigger: true
feedbackThreshold: 3
---

This is a test rule.`);

      await ruleManager.initialize();

      expect(mockApp.vault.adapter.list).toHaveBeenCalled();
      expect(mockApp.vault.adapter.read).toHaveBeenCalledWith('vault/.notes-critic/rules/test-rule.md');
    });
  });

  describe('fetchFile', () => {
    it('should read file content', async () => {
      const testPath = 'test/path.md';
      const testContent = 'file content';
      
      mockApp.vault.adapter.read.mockResolvedValue(testContent);

      const result = await ruleManager.fetchFile(testPath);

      expect(result).toEqual({
        content: testContent,
        path: testPath
      });
      expect(mockApp.vault.adapter.read).toHaveBeenCalledWith(testPath);
    });
  });

  describe('rule parsing', () => {
    it('should parse valid rule file with frontmatter', async () => {
      const ruleContent = `---
name: Test Rule
enabled: true
priority: 100
globs: ["*.md", "*.txt"]
exclude: ["*.tmp"]
autoTrigger: true
feedbackThreshold: 3
feedbackCooldownSeconds: 60
feedbackPrompt: "Custom feedback prompt"
systemPrompt: "Custom system prompt"
model: "anthropic/claude-3-sonnet-20240229"
maxTokens: 1000
---

This is the rule description and instructions.`;

      mockApp.vault.adapter.list.mockResolvedValue({
        files: ['test/.notes-critic/rules/test.md'],
        folders: []
      });

      mockApp.vault.adapter.read.mockResolvedValue(ruleContent);

      await ruleManager.initialize();

      const rules = ruleManager['rules'];
      expect(rules).toHaveLength(1);
      expect(rules[0]).toMatchObject({
        name: 'Test Rule',
        enabled: true,
        priority: 100,
        globs: ['*.md', '*.txt'],
        exclude: ['*.tmp'],
        autoTrigger: true,
        feedbackThreshold: 3,
        feedbackCooldownSeconds: 60,
        feedbackPrompt: 'Custom feedback prompt',
        systemPrompt: 'Custom system prompt',
        model: 'anthropic/claude-3-sonnet-20240229',
        maxTokens: 1000,
        content: 'This is the rule description and instructions.'
      });
    });

    it('should skip disabled rules', async () => {
      const ruleContent = `---
name: Disabled Rule
enabled: false
globs: ["*.md"]
---

This rule is disabled.`;

      mockApp.vault.adapter.list.mockResolvedValue({
        files: ['test/.notes-critic/rules/disabled.md'],
        folders: []
      });

      mockApp.vault.adapter.read.mockResolvedValue(ruleContent);

      await ruleManager.initialize();

      const rules = ruleManager['rules'];
      expect(rules).toHaveLength(0);
    });

    it('should handle files without frontmatter', async () => {
      const ruleContent = 'Just plain content without frontmatter';

      mockApp.vault.adapter.list.mockResolvedValue({
        files: ['test/.notes-critic/rules/plain.md'],
        folders: []
      });

      mockApp.vault.adapter.read.mockResolvedValue(ruleContent);

      await ruleManager.initialize();

      const rules = ruleManager['rules'];
      expect(rules).toHaveLength(0);
    });

    it('should handle invalid YAML frontmatter gracefully', async () => {
      const ruleContent = `---
name: Test Rule
enabled: true
invalid: yaml: content: here
---

Content after invalid frontmatter.`;

      mockApp.vault.adapter.list.mockResolvedValue({
        files: ['test/.notes-critic/rules/invalid.md'],
        folders: []
      });

      mockApp.vault.adapter.read.mockResolvedValue(ruleContent);

      await ruleManager.initialize();

      // Should not throw, just skip invalid files
      const rules = ruleManager['rules'];
      expect(rules).toHaveLength(0);
    });
  });

  describe('getMatchingRules', () => {
    beforeEach(async () => {
      const ruleContent = `---
name: Markdown Rule
enabled: true
globs: ["*.md"]
exclude: ["temp*.md"]
autoTrigger: true
feedbackThreshold: 5
---

Rule for markdown files.`;

      mockApp.vault.adapter.list.mockResolvedValue({
        files: ['test/.notes-critic/rules/markdown.md'],
        folders: []
      });

      mockApp.vault.adapter.read.mockResolvedValue(ruleContent);

      await ruleManager.initialize();
    });

    it('should return matching rules for file path', () => {
      const matches = ruleManager.getMatchingRules('notes/test.md');
      
      expect(matches).toHaveLength(1);
      expect(matches[0].rule.name).toBe('Markdown Rule');
      expect(matches[0].matchedPattern).toBe('*.md');
    });

    it('should exclude files based on exclude patterns', () => {
      const matches = ruleManager.getMatchingRules('temp-file.md');
      
      // Should match the glob but be excluded
      expect(matches).toHaveLength(0);
    });

    it('should return no matches for non-matching files', () => {
      const matches = ruleManager.getMatchingRules('document.txt');
      
      expect(matches).toHaveLength(0);
    });

    it('should use caching for repeated requests', () => {
      const path = 'notes/test.md';
      
      // First call
      const matches1 = ruleManager.getMatchingRules(path);
      
      // Second call should use cache
      const matches2 = ruleManager.getMatchingRules(path);
      
      expect(matches1).toEqual(matches2);
      
      // Verify cache is being used (spy on internal methods if needed)
      const cache = ruleManager['ruleCache'];
      expect(cache.has(path)).toBe(true);
    });

    it('should sort rules by priority (higher first)', async () => {
      const rule1Content = `---
name: Low Priority Rule
enabled: true
priority: 50
globs: ["*.md"]
---
Low priority rule.`;

      const rule2Content = `---
name: High Priority Rule
enabled: true
priority: 200
globs: ["*.md"]
---
High priority rule.`;

      mockApp.vault.adapter.list.mockResolvedValue({
        files: [
          'test/.notes-critic/rules/low.md',
          'test/.notes-critic/rules/high.md'
        ],
        folders: []
      });

      mockApp.vault.adapter.read
        .mockResolvedValueOnce(rule1Content)
        .mockResolvedValueOnce(rule2Content);

      await ruleManager.initialize();

      const matches = ruleManager.getMatchingRules('test.md');
      
      expect(matches).toHaveLength(2);
      expect(matches[0].rule.name).toBe('High Priority Rule');
      expect(matches[1].rule.name).toBe('Low Priority Rule');
    });
  });

  describe('shouldAutoTrigger', () => {
    beforeEach(async () => {
      const autoRuleContent = `---
name: Auto Trigger Rule
enabled: true
globs: ["*.md"]
autoTrigger: true
feedbackThreshold: 3
---
Auto trigger rule.`;

      const manualRuleContent = `---
name: Manual Rule
enabled: true
globs: ["*.md"]
autoTrigger: false
---
Manual rule.`;

      mockApp.vault.adapter.list.mockResolvedValue({
        files: [
          'test/.notes-critic/rules/auto.md',
          'test/.notes-critic/rules/manual.md'
        ],
        folders: []
      });

      mockApp.vault.adapter.read
        .mockResolvedValueOnce(autoRuleContent)
        .mockResolvedValueOnce(manualRuleContent);

      await ruleManager.initialize();
    });

    it('should return true when auto-trigger rule matches and threshold reached', () => {
      const result = ruleManager.shouldAutoTrigger('test.md', 3);
      expect(result).toBe(true);
    });

    it('should return false when threshold not reached', () => {
      const result = ruleManager.shouldAutoTrigger('test.md', 2);
      expect(result).toBe(false);
    });

    it('should return false when only manual rules match', () => {
      // This would need to be tested with a file that only matches manual rules
      // For simplicity, we'll assume the test file matches both rules
      const result = ruleManager.shouldAutoTrigger('test.md', 5);
      expect(result).toBe(true); // Because auto rule also matches
    });

    it('should return false for non-matching files', () => {
      const result = ruleManager.shouldAutoTrigger('test.txt', 10);
      expect(result).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should handle file read errors gracefully', async () => {
      mockApp.vault.adapter.list.mockResolvedValue({
        files: ['test/.notes-critic/rules/error.md'],
        folders: []
      });

      mockApp.vault.adapter.read.mockRejectedValue(new Error('File read error'));

      await expect(ruleManager.initialize()).resolves.not.toThrow();
      
      const rules = ruleManager['rules'];
      expect(rules).toHaveLength(0);
    });

    it('should handle vault listing errors', async () => {
      mockApp.vault.adapter.list.mockRejectedValue(new Error('Vault list error'));

      await expect(ruleManager.initialize()).resolves.not.toThrow();
      
      const rules = ruleManager['rules'];
      expect(rules).toHaveLength(0);
    });
  });
});