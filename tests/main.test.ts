import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import NotesCritic from '../src/main';
import { DEFAULT_SETTINGS } from '../src/constants';
import { CHAT_VIEW_CONFIG } from '../src/types';

// Mock Obsidian classes and functions
const mockWorkspace = {
  registerView: jest.fn(),
  onLayoutReady: jest.fn((callback) => callback()),
  on: jest.fn(),
  rightLeaf: { detach: jest.fn() },
  detachLeavesOfType: jest.fn(),
  getActiveViewOfType: jest.fn(),
  getLeaf: jest.fn().mockReturnValue({
    setViewState: jest.fn().mockResolvedValue(undefined)
  })
};

const mockVault = {
  adapter: {
    exists: jest.fn().mockResolvedValue(false),
    write: jest.fn().mockResolvedValue(undefined),
    read: jest.fn().mockResolvedValue('{}'),
    mkdir: jest.fn().mockResolvedValue(undefined)
  }
};

const mockApp = {
  workspace: mockWorkspace,
  vault: mockVault
};

// Mock Obsidian classes
jest.mock('obsidian', () => ({
  Notice: jest.fn(),
  Events: class Events {
    on = jest.fn();
    off = jest.fn();
    trigger = jest.fn();
  },
  Plugin: class Plugin {
    app: any;
    manifest: any;
    addSettingTab = jest.fn();
    addRibbonIcon = jest.fn().mockReturnValue({ setAttribute: jest.fn() });
    addCommand = jest.fn();
    registerView = jest.fn();
    registerEvent = jest.fn();
    loadData = jest.fn().mockResolvedValue({});
    saveData = jest.fn().mockResolvedValue(undefined);
    registerObsidianProtocolHandler = jest.fn();
    addStatusBarItem = jest.fn().mockReturnValue(document.createElement('div'));
    
    constructor(app: any, manifest: any) {
      this.app = app;
      this.manifest = manifest;
    }
  }
}));

// Mock dependencies
jest.mock('../src/views/ChatView', () => ({
  ChatView: jest.fn().mockImplementation(() => ({
    getViewType: () => CHAT_VIEW_CONFIG.type
  }))
}));

jest.mock('../src/settings/SettingsTab', () => ({
  NotesCriticSettingsTab: jest.fn()
}));

jest.mock('../src/views/components/ModelSelector', () => ({
  ModelSelector: jest.fn()
}));

jest.mock('../src/hooks/useSettings', () => ({
  SettingsProvider: jest.fn(({ children }: any) => children)
}));

jest.mock('react-dom/client', () => ({
  createRoot: jest.fn().mockReturnValue({
    render: jest.fn(),
    unmount: jest.fn()
  })
}));

jest.mock('react', () => ({
  createElement: jest.fn()
}));

jest.mock('../src/llm/mcpClient', () => ({
  MCPManager: jest.fn().mockImplementation(() => ({
    initialize: jest.fn(),
    shutdown: jest.fn()
  }))
}));

describe('NotesCritic Plugin', () => {
  let plugin: NotesCritic;
  const mockManifest = {
    id: 'notes-critic',
    name: 'Notes Critic',
    version: '1.0.0'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    plugin = new NotesCritic(mockApp, mockManifest);
  });

  describe('plugin lifecycle', () => {
    it('should initialize without settings until onload is called', () => {
      expect(plugin.settings).toBeUndefined();
    });

    it('should load plugin successfully', async () => {
      await expect(plugin.onload()).resolves.not.toThrow();
      
      // Should register the chat view
      expect(plugin.registerView).toHaveBeenCalledWith(
        CHAT_VIEW_CONFIG.type,
        expect.any(Function)
      );
      
      // Should add settings tab
      expect(plugin.addSettingTab).toHaveBeenCalled();
      
      // Should add ribbon icon
      expect(plugin.addRibbonIcon).toHaveBeenCalledWith(
        CHAT_VIEW_CONFIG.icon,
        CHAT_VIEW_CONFIG.name,
        expect.any(Function)
      );
      
      // Should register event listener
      expect(plugin.registerEvent).toHaveBeenCalled();
      
      // Settings should be loaded
      expect(plugin.settings).toBeDefined();
    });

    it('should handle settings loading', async () => {
      const customSettings = {
        ...DEFAULT_SETTINGS,
        systemPrompt: 'Custom prompt'
      };
      
      plugin.loadData = jest.fn().mockResolvedValue(customSettings);
      
      await plugin.onload();
      
      expect(plugin.settings.systemPrompt).toBe('Custom prompt');
    });

    it('should save settings', async () => {
      await plugin.onload(); // Load settings first
      plugin.settings.systemPrompt = 'Modified prompt';
      
      await plugin.saveSettings();
      
      expect(plugin.saveData).toHaveBeenCalledWith(plugin.settings);
    });

    it('should unload cleanly', () => {
      expect(() => plugin.onunload()).not.toThrow();
    });
  });

  describe('view management', () => {
    beforeEach(async () => {
      await plugin.onload();
      
      // Mock workspace methods needed for activateView
      mockWorkspace.getLeavesOfType = jest.fn().mockReturnValue([]);
      mockWorkspace.getRightLeaf = jest.fn().mockReturnValue({
        setViewState: jest.fn().mockResolvedValue(undefined)
      });
      mockWorkspace.revealLeaf = jest.fn();
    });

    it('should activate chat view', async () => {
      await plugin.activateView();
      
      expect(mockWorkspace.getLeavesOfType).toHaveBeenCalledWith(CHAT_VIEW_CONFIG.type);
      expect(mockWorkspace.getRightLeaf).toHaveBeenCalledWith(false);
    });

    it('should handle view activation when already open', async () => {
      const mockLeaf = { view: 'mock-view' };
      mockWorkspace.getLeavesOfType.mockReturnValue([mockLeaf]);
      
      await plugin.activateView();
      
      // Should use existing leaf
      expect(mockWorkspace.revealLeaf).toHaveBeenCalledWith(mockLeaf);
    });

    it('should trigger feedback for current note when chat view is open', async () => {
      const mockChatView = {
        triggerFeedback: jest.fn().mockResolvedValue(undefined)
      };
      const mockLeaf = { view: mockChatView };
      mockWorkspace.getLeavesOfType.mockReturnValue([mockLeaf]);

      await plugin.triggerFeedbackForCurrentNote();

      expect(mockChatView.triggerFeedback).toHaveBeenCalled();
    });

    it('should show notice when chat view is not open', async () => {
      const { Notice } = require('obsidian');
      mockWorkspace.getLeavesOfType.mockReturnValue([]);

      await plugin.triggerFeedbackForCurrentNote();

      expect(Notice).toHaveBeenCalledWith('Please open the feedback view first');
    });
  });

  describe('error handling', () => {
    it('should propagate settings loading errors', async () => {
      plugin.loadData = jest.fn().mockRejectedValue(new Error('Load error'));
      
      await expect(plugin.onload()).rejects.toThrow('Load error');
    });

    it('should propagate settings saving errors', async () => {
      await plugin.onload(); // Load settings first
      plugin.saveData = jest.fn().mockRejectedValue(new Error('Save error'));
      
      await expect(plugin.saveSettings()).rejects.toThrow('Save error');
    });
  });

  describe('integration', () => {
    it('should have correct view configuration', () => {
      expect(CHAT_VIEW_CONFIG).toBeDefined();
      expect(CHAT_VIEW_CONFIG.type).toBe('notes-critic-chat');
      expect(CHAT_VIEW_CONFIG.name).toBe('Notes Critic Chat');
      expect(CHAT_VIEW_CONFIG.icon).toBeDefined();
    });

    it('should have valid default settings', () => {
      expect(DEFAULT_SETTINGS).toBeDefined();
      expect(DEFAULT_SETTINGS.systemPrompt).toBeDefined();
      expect(DEFAULT_SETTINGS.model).toBeDefined();
      expect(DEFAULT_SETTINGS.maxTokens).toBeGreaterThan(0);
    });
  });
});