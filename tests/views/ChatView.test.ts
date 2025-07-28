import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ChatView } from '../../src/views/ChatView';
import { CHAT_VIEW_CONFIG } from '../../src/types';

// Mock dependencies
jest.mock('../../src/views/components/FeedbackDisplay');
jest.mock('../../src/views/components/ChatInput');
jest.mock('../../src/views/components/ControlPanel');
jest.mock('../../src/views/components/FileManager');
jest.mock('../../src/conversation/ConversationManager', () => ({
  ConversationManager: jest.fn().mockImplementation(() => ({
    newConversationRound: jest.fn().mockResolvedValue({
      id: 'test-turn',
      isComplete: true
    }),
    toHistory: jest.fn().mockReturnValue({
      id: 'test-conversation',
      title: 'Test Conversation',
      timestamp: new Date()
    }),
    getConversation: jest.fn().mockReturnValue([]),
    updateSettings: jest.fn(),
    cancelInference: jest.fn(),
    isInferenceRunning: jest.fn().mockReturnValue(false),
    rerunConversationTurn: jest.fn().mockResolvedValue(undefined)
  }))
}));
jest.mock('../../src/rules/RuleManager');
jest.mock('../../src/diffs', () => ({
  generateDiff: jest.fn().mockReturnValue('Mock diff output')
}));

// Mock HistoryManager
const mockHistoryManager = {
  listHistory: jest.fn().mockResolvedValue([])
};

// Note: feedbackProvider functionality is now part of LLMProvider

describe('ChatView', () => {
  let chatView: ChatView;
  let mockLeaf: any;
  let mockPlugin: any;
  let mockApp: any;

  beforeEach(() => {
    // Mock DOM elements
    const mockContainer = document.createElement('div');
    const mockContentContainer = document.createElement('div');
    mockContainer.appendChild(mockContentContainer);

    mockApp = {
      workspace: {
        getActiveFile: jest.fn(),
        on: jest.fn(),
        off: jest.fn()
      },
      vault: {
        on: jest.fn(),
        off: jest.fn(),
        read: jest.fn(),
        modify: jest.fn()
      },
      metadataCache: {
        on: jest.fn(),
        off: jest.fn()
      }
    };

    mockLeaf = {
      detach: jest.fn(),
      view: null
    };

    mockPlugin = {
      settings: {
        feedbackThreshold: 3,
        feedbackCooldownSeconds: 30,
        systemPrompt: 'Test prompt',
        model: 'anthropic/claude-3-sonnet-20240229',
        anthropicApiKey: 'test-key',
        maxTokens: 2000,
        maxHistoryTokens: 4000,
        mcpEnabled: false,
        mcpServers: []
      },
      saveSettings: jest.fn().mockResolvedValue(undefined),
      app: mockApp
    };

    chatView = new ChatView(mockLeaf, mockPlugin);
    
    // Mock containerEl
    Object.defineProperty(chatView, 'containerEl', {
      value: {
        children: [null, mockContentContainer],
        createEl: jest.fn((tag, attrs) => {
          const el = document.createElement(tag);
          if (attrs?.cls) {
            el.className = Array.isArray(attrs.cls) ? attrs.cls.join(' ') : attrs.cls;
          }
          return el;
        })
      },
      writable: true
    });

    // Mock registerEvent method
    chatView.registerEvent = jest.fn();

    // Assign mock dependencies that aren't constructor injected
    chatView['historyManager'] = mockHistoryManager;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('view configuration', () => {
    it('should return correct view type', () => {
      expect(chatView.getViewType()).toBe(CHAT_VIEW_CONFIG.type);
    });

    it('should return correct display text', () => {
      expect(chatView.getDisplayText()).toBe(CHAT_VIEW_CONFIG.name);
    });

    it('should return correct icon', () => {
      expect(chatView.getIcon()).toBe(CHAT_VIEW_CONFIG.icon);
    });
  });

  describe('onOpen', () => {
    it('should initialize UI components', async () => {
      await chatView.onOpen();
      
      // Verify that components are initialized
      expect(chatView['feedbackDisplay']).toBeDefined();
      expect(chatView['chatInput']).toBeDefined();
      expect(chatView['controlPanel']).toBeDefined();
      expect(chatView['fileManager']).toBeDefined();
    });

    it('should setup workspace event listeners', async () => {
      await chatView.onOpen();
      
      // Verify that registerEvent was called multiple times for different events
      expect(chatView.registerEvent).toHaveBeenCalledTimes(3);
    });
  });

  describe('onClose', () => {
    it('should cleanup components', async () => {
      await chatView.onOpen();
      
      // Spy on component destroy methods
      const feedbackDestroySpy = jest.spyOn(chatView['feedbackDisplay'], 'destroy');
      const chatInputDestroySpy = jest.spyOn(chatView['chatInput'], 'destroy');
      const controlPanelDestroySpy = jest.spyOn(chatView['controlPanel'], 'destroy');
      
      chatView.onClose();
      
      // Verify components are cleaned up
      expect(feedbackDestroySpy).toHaveBeenCalled();
      expect(chatInputDestroySpy).toHaveBeenCalled();
      expect(controlPanelDestroySpy).toHaveBeenCalled();
    });
  });

  describe('triggerFeedback', () => {
    beforeEach(async () => {
      await chatView.onOpen();
    });

    it('should show notice when no active file', async () => {
      // Use the existing Notice mock from obsidian
      const { Notice } = require('obsidian');
      Notice.mockClear(); // Clear any previous calls
      
      // Ensure currentFile is null and FileManager returns null
      chatView['currentFile'] = null;
      chatView['fileManager'].getCurrentFile = jest.fn().mockReturnValue(null);

      await chatView.triggerFeedback();

      expect(Notice).toHaveBeenCalledWith('No active note detected. Please open a markdown file first.');
    });

    it('should process file feedback when active file exists', async () => {
      const mockFile = {
        path: 'test.md',
        name: 'test.md',
        basename: 'test'
      };
      
      // Set up current file and snapshot (required by triggerFeedback)
      chatView['currentFile'] = mockFile;
      chatView['fileManager'].getCurrentFile.mockReturnValue(mockFile);
      chatView['noteSnapshots'].set(mockFile.path, {
        baseline: 'old content',
        current: 'new content',
        changeCount: 1
      });

      await chatView.triggerFeedback();

      expect(chatView['conversationManager'].newConversationRound).toHaveBeenCalled();
    });

  });

  describe('file change handling', () => {
    let mockFile: any;

    beforeEach(async () => {
      mockFile = {
        path: 'test.md',
        name: 'test.md',
        basename: 'test'
      };
      
      await chatView.onOpen();
      chatView['currentFile'] = mockFile;
    });

    it('should track file snapshots', () => {
      // Set up a mock snapshot directly (this would normally be managed by FileManager)
      const snapshot = {
        baseline: 'old content',
        current: 'new content',
        changeCount: 1
      };
      chatView['noteSnapshots'].set(mockFile.path, snapshot);
      
      const storedSnapshot = chatView['noteSnapshots'].get(mockFile.path);
      expect(storedSnapshot).toMatchObject({
        baseline: 'old content',
        current: 'new content',
        changeCount: 1
      });
    });

    it('should call updateUI when file changes', () => {
      const updateUISpy = jest.spyOn(chatView, 'updateUI' as any);
      
      chatView['onFileChange'](mockFile);
      
      expect(updateUISpy).toHaveBeenCalled();
    });

  });

});