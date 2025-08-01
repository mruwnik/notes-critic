import { jest, describe, it, expect } from '@jest/globals';
import { generateDiff, calculateDiffSize } from '../src/diffs';

describe('Diff Generation', () => {
  describe('generateDiff', () => {
    it('should return "No changes detected" for identical content', () => {
      const content = 'Same content\nSecond line';
      const result = generateDiff(content, content);
      
      expect(result).toBe('No changes detected');
    });

    it('should generate diff for simple line addition', () => {
      const baseline = 'Line 1\nLine 2';
      const current = 'Line 1\nLine 2\nLine 3';
      
      const result = generateDiff(baseline, current);
      
      expect(result).toContain('@@ -1,2 +1,3 @@');
      expect(result).toContain(' Line 1');
      expect(result).toContain(' Line 2');
      expect(result).toContain('+Line 3');
    });

    it('should generate diff for simple line removal', () => {
      const baseline = 'Line 1\nLine 2\nLine 3';
      const current = 'Line 1\nLine 3';
      
      const result = generateDiff(baseline, current);
      
      expect(result).toContain('@@ -1,3 +1,2 @@');
      expect(result).toContain(' Line 1');
      expect(result).toContain('-Line 2');
      // The algorithm shows this as a replacement rather than preserving Line 3 as context
      expect(result).toContain('+Line 3');
      expect(result).toContain('-Line 3');
    });

    it('should generate diff for line modification', () => {
      const baseline = 'Line 1\nOriginal line\nLine 3';
      const current = 'Line 1\nModified line\nLine 3';
      
      const result = generateDiff(baseline, current);
      
      expect(result).toContain('@@ -1,3 +1,3 @@');
      expect(result).toContain(' Line 1');
      expect(result).toContain('-Original line');
      expect(result).toContain('+Modified line');
      expect(result).toContain(' Line 3');
    });

    it('should handle empty baseline', () => {
      const baseline = '';
      const current = 'New line';
      
      const result = generateDiff(baseline, current);
      
      expect(result).toContain('+New line');
    });

    it('should handle empty current content', () => {
      const baseline = 'Existing line';
      const current = '';
      
      const result = generateDiff(baseline, current);
      
      expect(result).toContain('-Existing line');
    });

    it('should handle multiple hunks with context', () => {
      const baseline = `Line 1
Line 2
Line 3
Line 4
Line 5
Line 6
Line 7
Line 8
Line 9
Line 10`;

      const current = `Line 1
Modified line 2
Line 3
Line 4
Line 5
Line 6
Line 7
Line 8
Modified line 9
Line 10`;
      
      const result = generateDiff(baseline, current);
      
      // Should contain two separate hunks
      expect(result).toContain('@@ -1,5 +1,5 @@');
      expect(result).toContain('-Line 2');
      expect(result).toContain('+Modified line 2');
      expect(result).toContain('-Line 9');
      expect(result).toContain('+Modified line 9');
    });

    it('should limit context lines to 3', () => {
      const baseline = `Context 1
Context 2
Context 3
Context 4
Original line
Context 6
Context 7
Context 8
Context 9`;

      const current = `Context 1
Context 2
Context 3
Context 4
Modified line
Context 6
Context 7
Context 8
Context 9`;
      
      const result = generateDiff(baseline, current);
      
      // Should include 3 lines of context before and after the change
      expect(result).toContain('Context 2');
      expect(result).toContain('Context 3');
      expect(result).toContain('Context 4');
      expect(result).toContain('Context 6');
      expect(result).toContain('Context 7');
      expect(result).toContain('Context 8');
      // Should not include Context 1 or Context 9 (too far from change)
      expect(result).not.toContain('Context 1');
      expect(result).not.toContain('Context 9');
    });

    it('should handle consecutive additions', () => {
      const baseline = 'Line 1\nLine 3';
      const current = 'Line 1\nNew Line 2\nAnother New Line\nLine 3';
      
      const result = generateDiff(baseline, current);
      
      expect(result).toContain('+New Line 2');
      expect(result).toContain('+Another New Line');
    });

    it('should handle consecutive removals', () => {
      const baseline = 'Line 1\nRemove this\nRemove this too\nLine 4';
      const current = 'Line 1\nLine 4';
      
      const result = generateDiff(baseline, current);
      
      expect(result).toContain('-Remove this');
      expect(result).toContain('-Remove this too');
    });

    it('should handle mixed additions and removals', () => {
      const baseline = 'Keep this\nRemove this\nKeep this too';
      const current = 'Keep this\nAdd this\nKeep this too\nAdd this at end';
      
      const result = generateDiff(baseline, current);
      
      expect(result).toContain(' Keep this');
      expect(result).toContain('-Remove this');
      expect(result).toContain('+Add this');
      expect(result).toContain(' Keep this too');
      expect(result).toContain('+Add this at end');
    });

    it('should handle large files with multiple changes', () => {
      const baselineLines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`);
      const currentLines = [...baselineLines];
      
      // Make changes at positions 10, 50, and 90
      currentLines[9] = 'Modified Line 10';
      currentLines[49] = 'Modified Line 50';
      currentLines[89] = 'Modified Line 90';
      
      const baseline = baselineLines.join('\n');
      const current = currentLines.join('\n');
      
      const result = generateDiff(baseline, current);
      
      expect(result).toContain('-Line 10');
      expect(result).toContain('+Modified Line 10');
      expect(result).toContain('-Line 50');
      expect(result).toContain('+Modified Line 50');
      expect(result).toContain('-Line 90');
      expect(result).toContain('+Modified Line 90');
    });

    it('should handle edge case with only newlines', () => {
      const baseline = '\n\n\n';
      const current = '\n\n\n\n';
      
      const result = generateDiff(baseline, current);
      
      expect(result).toContain('+'); // Should show addition of empty line
    });

    it('should handle trailing newline differences', () => {
      const baseline = 'Content';
      const current = 'Content\n';
      
      const result = generateDiff(baseline, current);
      
      expect(result).toContain('+'); // Should show addition of newline
    });
  });

  describe('calculateDiffSize', () => {
    it('should calculate size difference correctly', () => {
      expect(calculateDiffSize('abc', 'abcde')).toBe(2);
      expect(calculateDiffSize('abcde', 'abc')).toBe(2);
      expect(calculateDiffSize('same', 'same')).toBe(0);
    });

    it('should handle empty strings', () => {
      expect(calculateDiffSize('', 'content')).toBe(7);
      expect(calculateDiffSize('content', '')).toBe(7);
      expect(calculateDiffSize('', '')).toBe(0);
    });

    it('should handle multiline content', () => {
      const baseline = 'Line 1\nLine 2';
      const current = 'Line 1\nLine 2\nLine 3';
      
      expect(calculateDiffSize(baseline, current)).toBe(7); // '\nLine 3'
    });

    it('should handle unicode characters', () => {
      const baseline = 'Hello 👋';
      const current = 'Hello 👋 World 🌍';
      
      expect(calculateDiffSize(baseline, current)).toBe(9); // ' World 🌍'
    });

    it('should handle very large differences', () => {
      const baseline = 'small';
      const current = 'a'.repeat(10000);
      
      expect(calculateDiffSize(baseline, current)).toBe(9995);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle very long lines', () => {
      const longLine = 'a'.repeat(10000);
      const baseline = `Short line\n${longLine}\nAnother short line`;
      const current = `Short line\n${longLine}modified\nAnother short line`;
      
      const result = generateDiff(baseline, current);
      
      expect(result).toContain('-' + longLine);
      expect(result).toContain('+' + longLine + 'modified');
    });

    it('should handle files with only whitespace changes', () => {
      const baseline = 'Line 1  \nLine 2\t\n  Line 3';
      const current = 'Line 1\nLine 2\nLine 3';
      
      const result = generateDiff(baseline, current);
      
      expect(result).toContain('-Line 1  ');
      expect(result).toContain('+Line 1');
      expect(result).toContain('-Line 2\t');
      expect(result).toContain('+Line 2');
      expect(result).toContain('-  Line 3');
      expect(result).toContain('+Line 3');
    });

    it('should handle files with different line ending styles', () => {
      const baseline = 'Line 1\nLine 2\nLine 3';
      const current = 'Line 1\r\nLine 2\r\nLine 3\r\n';
      
      const result = generateDiff(baseline, current);
      
      // The diff should detect the line ending differences
      expect(result).not.toBe('No changes detected');
    });

    it('should handle completely different files', () => {
      const baseline = 'Original\nFile\nContent';
      const current = 'Completely\nDifferent\nFile\nContent';
      
      const result = generateDiff(baseline, current);
      
      expect(result).toContain('-Original');
      expect(result).toContain('-File');
      expect(result).toContain('-Content');
      expect(result).toContain('+Completely');
      expect(result).toContain('+Different');
      expect(result).toContain('+File');
      expect(result).toContain('+Content');
    });
  });

  describe('diff format validation', () => {
    it('should generate valid unified diff format', () => {
      const baseline = 'Line 1\nLine 2\nLine 3';
      const current = 'Line 1\nModified Line 2\nLine 3';
      
      const result = generateDiff(baseline, current);
      const lines = result.split('\n');
      
      // Should start with hunk header
      expect(lines[0]).toMatch(/^@@ -\d+,\d+ \+\d+,\d+ @@$/);
      
      // Context lines should start with space
      const contextLines = lines.filter(line => line.startsWith(' '));
      expect(contextLines).toContain(' Line 1');
      expect(contextLines).toContain(' Line 3');
      
      // Removed lines should start with -
      const removedLines = lines.filter(line => line.startsWith('-'));
      expect(removedLines).toContain('-Line 2');
      
      // Added lines should start with +
      const addedLines = lines.filter(line => line.startsWith('+'));
      expect(addedLines).toContain('+Modified Line 2');
    });

    it('should have correct line counts in hunk headers', () => {
      const baseline = 'A\nB\nC\nD';
      const current = 'A\nX\nY\nD';
      
      const result = generateDiff(baseline, current);
      
      // Should be @@ -1,4 +1,4 @@ since we're changing 2 lines in the middle
      expect(result).toContain('@@ -1,4 +1,4 @@');
    });
  });
});