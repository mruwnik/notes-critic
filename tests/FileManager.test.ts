import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { FileManager } from '../src/FileManager';
import { NoteSnapshot } from '../src/types';

// Mock Obsidian modules
jest.mock('obsidian', () => ({
  Notice: jest.fn(),
  MarkdownView: jest.fn()
}));

const mockNotice = jest.fn();
const mockMarkdownView = {
  file: {
    path: 'test-from-view.md',
    name: 'test-from-view.md'
  }
};

describe('FileManager', () => {
  let fileManager: FileManager;
  let mockApp: any;
  let noteSnapshots: Map<string, NoteSnapshot>;
  let onFileChangeMock: jest.Mock;
  let mockFile: any;

  beforeEach(() => {
    mockApp = {
      workspace: {
        getActiveFile: jest.fn(),
        getActiveViewOfType: jest.fn()
      },
      vault: {
        cachedRead: jest.fn()
      }
    };

    noteSnapshots = new Map();
    onFileChangeMock = jest.fn();

    mockFile = {
      path: 'test.md',
      name: 'test.md'
    };

    fileManager = new FileManager(mockApp, noteSnapshots, onFileChangeMock);
  });

  afterEach(() => {
    jest.clearAllMocks();
    noteSnapshots.clear();
  });

  describe('getCurrentFile', () => {
    it('should return active file when available', () => {
      mockApp.workspace.getActiveFile.mockReturnValue(mockFile);

      const result = fileManager.getCurrentFile();

      expect(result).toBe(mockFile);
      expect(mockApp.workspace.getActiveFile).toHaveBeenCalled();
    });

    it('should fallback to active markdown view file when active file is null', () => {
      mockApp.workspace.getActiveFile.mockReturnValue(null);
      mockApp.workspace.getActiveViewOfType.mockReturnValue(mockMarkdownView);

      const result = fileManager.getCurrentFile();

      expect(result).toBe(mockMarkdownView.file);
      expect(mockApp.workspace.getActiveViewOfType).toHaveBeenCalled();
    });

    it('should return null when no active file or view is available', () => {
      mockApp.workspace.getActiveFile.mockReturnValue(null);
      mockApp.workspace.getActiveViewOfType.mockReturnValue(null);

      const result = fileManager.getCurrentFile();

      expect(result).toBeNull();
    });

    it('should return null when markdown view has no file', () => {
      mockApp.workspace.getActiveFile.mockReturnValue(null);
      mockApp.workspace.getActiveViewOfType.mockReturnValue({ file: null });

      const result = fileManager.getCurrentFile();

      expect(result).toBeNull();
    });
  });

  describe('initializeFileSnapshot', () => {
    it('should create snapshot and trigger file change callback', async () => {
      const content = 'Initial content\n\nSecond paragraph';
      mockApp.vault.cachedRead.mockResolvedValue(content);

      await fileManager.initializeFileSnapshot(mockFile);

      expect(mockApp.vault.cachedRead).toHaveBeenCalledWith(mockFile);
      expect(noteSnapshots.has('test.md')).toBe(true);
      
      const snapshot = noteSnapshots.get('test.md');
      expect(snapshot).toEqual({
        baseline: content,
        current: content,
        changeCount: 0
      });
      
      expect(onFileChangeMock).toHaveBeenCalledWith(mockFile);
    });

    it('should handle read errors gracefully', async () => {
      const error = new Error('File read error');
      mockApp.vault.cachedRead.mockRejectedValue(error);
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await fileManager.initializeFileSnapshot(mockFile);

      expect(consoleSpy).toHaveBeenCalledWith('Error initializing file snapshot:', error);
      const { Notice } = require('obsidian');
      expect(Notice).toHaveBeenCalledWith('Error reading file content');
      expect(noteSnapshots.has('test.md')).toBe(false);
      
      consoleSpy.mockRestore();
    });
  });

  describe('updateFileSnapshot', () => {
    beforeEach(() => {
      // Initialize a snapshot first
      noteSnapshots.set('test.md', {
        baseline: 'Original content',
        current: 'Old content\n\nSecond paragraph',
        changeCount: 5
      });
    });

    it('should update snapshot and return paragraph difference', async () => {
      const newContent = 'New content\n\nSecond paragraph\n\nThird paragraph\n\nFourth paragraph';
      mockApp.vault.cachedRead.mockResolvedValue(newContent);

      const paragraphDiff = await fileManager.updateFileSnapshot(mockFile);

      expect(paragraphDiff).toBe(2); // 4 paragraphs - 2 paragraphs = 2 difference
      
      const snapshot = noteSnapshots.get('test.md');
      expect(snapshot?.current).toBe(newContent);
      expect(snapshot?.changeCount).toBe(7); // 5 + 2
    });

    it('should handle content with no paragraph change', async () => {
      const newContent = 'Different content\n\nStill two paragraphs';
      mockApp.vault.cachedRead.mockResolvedValue(newContent);

      const paragraphDiff = await fileManager.updateFileSnapshot(mockFile);

      expect(paragraphDiff).toBe(0); // 2 paragraphs - 2 paragraphs = 0 difference
      
      const snapshot = noteSnapshots.get('test.md');
      expect(snapshot?.current).toBe(newContent);
      expect(snapshot?.changeCount).toBe(5); // 5 + 0
    });

    it('should return 0 when snapshot does not exist', async () => {
      const nonExistentFile = { path: 'nonexistent.md', name: 'nonexistent.md' };
      
      const paragraphDiff = await fileManager.updateFileSnapshot(nonExistentFile);

      expect(paragraphDiff).toBe(0);
    });

    it('should handle read errors gracefully', async () => {
      const error = new Error('File read error');
      mockApp.vault.cachedRead.mockRejectedValue(error);
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const paragraphDiff = await fileManager.updateFileSnapshot(mockFile);

      expect(paragraphDiff).toBe(0);
      expect(consoleSpy).toHaveBeenCalledWith('Error processing file modification:', error);
      
      consoleSpy.mockRestore();
    });
  });

  describe('countParagraphs', () => {
    it('should count paragraphs correctly', () => {
      // Access the private method through bracket notation for testing
      const countParagraphs = (fileManager as any).countParagraphs.bind(fileManager);

      expect(countParagraphs('Single paragraph')).toBe(1);
      expect(countParagraphs('First paragraph\n\nSecond paragraph')).toBe(2);
      expect(countParagraphs('One\nTwo\nThree')).toBe(3);
      expect(countParagraphs('Line 1\n\n\nLine 2\n\n\n\nLine 3')).toBe(3);
      expect(countParagraphs('')).toBe(0);
      expect(countParagraphs('\n\n\n')).toBe(0);
      expect(countParagraphs('Content\n\n\n  \n\nMore content')).toBe(2);
    });
  });

  describe('hasChangesToFeedback', () => {
    it('should return false when file is null', () => {
      expect(fileManager.hasChangesToFeedback(null)).toBe(false);
    });

    it('should return false when snapshot does not exist', () => {
      expect(fileManager.hasChangesToFeedback(mockFile)).toBe(false);
    });

    it('should return false when baseline equals current content', () => {
      const content = 'Same content';
      noteSnapshots.set('test.md', {
        baseline: content,
        current: content,
        changeCount: 0
      });

      expect(fileManager.hasChangesToFeedback(mockFile)).toBe(false);
    });

    it('should return true when baseline differs from current content', () => {
      noteSnapshots.set('test.md', {
        baseline: 'Original content',
        current: 'Modified content',
        changeCount: 1
      });

      expect(fileManager.hasChangesToFeedback(mockFile)).toBe(true);
    });
  });

  describe('clearNoteData', () => {
    it('should reset baseline to current content and clear change count', () => {
      noteSnapshots.set('test.md', {
        baseline: 'Original content',
        current: 'Modified content',
        changeCount: 5
      });

      fileManager.clearNoteData(mockFile);

      const snapshot = noteSnapshots.get('test.md');
      expect(snapshot?.baseline).toBe('Modified content');
      expect(snapshot?.changeCount).toBe(0);
    });

    it('should handle missing snapshots gracefully', () => {
      expect(() => fileManager.clearNoteData(mockFile)).not.toThrow();
    });
  });

  describe('updateFeedbackBaseline', () => {
    it('should update baseline to current content and reset change count', () => {
      noteSnapshots.set('test.md', {
        baseline: 'Old baseline',
        current: 'Current content after feedback',
        changeCount: 10
      });

      fileManager.updateFeedbackBaseline(mockFile);

      const snapshot = noteSnapshots.get('test.md');
      expect(snapshot?.baseline).toBe('Current content after feedback');
      expect(snapshot?.changeCount).toBe(0);
    });

    it('should handle missing snapshots gracefully', () => {
      expect(() => fileManager.updateFeedbackBaseline(mockFile)).not.toThrow();
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete file lifecycle', async () => {
      // Initialize
      const initialContent = 'Initial content';
      mockApp.vault.cachedRead.mockResolvedValue(initialContent);
      await fileManager.initializeFileSnapshot(mockFile);

      expect(fileManager.hasChangesToFeedback(mockFile)).toBe(false);

      // Update
      const modifiedContent = 'Initial content\n\nNew paragraph';
      mockApp.vault.cachedRead.mockResolvedValue(modifiedContent);
      const diff = await fileManager.updateFileSnapshot(mockFile);

      expect(diff).toBe(1); // 2 paragraphs - 1 paragraph
      expect(fileManager.hasChangesToFeedback(mockFile)).toBe(true);

      // Clear after feedback
      fileManager.updateFeedbackBaseline(mockFile);
      expect(fileManager.hasChangesToFeedback(mockFile)).toBe(false);

      const snapshot = noteSnapshots.get('test.md');
      expect(snapshot?.baseline).toBe(modifiedContent);
      expect(snapshot?.changeCount).toBe(0);
    });

    it('should handle multiple file updates', async () => {
      // Initialize
      mockApp.vault.cachedRead.mockResolvedValue('Start');
      await fileManager.initializeFileSnapshot(mockFile);

      // First update
      mockApp.vault.cachedRead.mockResolvedValue('Start\n\nUpdate 1');
      await fileManager.updateFileSnapshot(mockFile);

      // Second update
      mockApp.vault.cachedRead.mockResolvedValue('Start\n\nUpdate 1\n\nUpdate 2');
      await fileManager.updateFileSnapshot(mockFile);

      const snapshot = noteSnapshots.get('test.md');
      expect(snapshot?.changeCount).toBe(2); // 1 + 1 paragraph additions
    });
  });
});