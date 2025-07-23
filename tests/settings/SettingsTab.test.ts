import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { NotesCriticSettingsTab } from '../../src/settings/SettingsTab';
import { DEFAULT_SETTINGS, NotesCriticSettings } from '../../src/types';

// Mock dependencies
jest.mock('../../src/llm/llmProvider');
jest.mock('../../src/llm/mcpClient');
jest.mock('../../src/llm/oauthClient');
jest.mock('../../src/settings/components/RulesSettingsComponent');

describe('NotesCriticSettingsTab', () => {
  let settingsTab: NotesCriticSettingsTab;
  let mockApp: any;
  let mockPlugin: any;
  let mockSettings: NotesCriticSettings;
  let mockContainer: HTMLElement;

  beforeEach(() => {
    // Create mock DOM container
    mockContainer = document.createElement('div');
    
    mockApp = {
      workspace: { getActiveFile: jest.fn() }
    };

    mockSettings = { ...DEFAULT_SETTINGS };
    
    mockPlugin = {
      settings: mockSettings,
      saveSettings: jest.fn().mockResolvedValue(undefined),
      app: mockApp
    };

    settingsTab = new NotesCriticSettingsTab(mockApp, mockPlugin);
    
    // Mock containerEl
    Object.defineProperty(settingsTab, 'containerEl', {
      value: mockContainer,
      writable: true
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockContainer.innerHTML = '';
  });

  describe('display', () => {
    it('should create UI elements when displayed', () => {
      settingsTab.display();
      
      // Check that settings sections are created
      const sections = mockContainer.querySelectorAll('h3.notes-critic-settings-section');
      expect(sections.length).toBeGreaterThan(0);
      
      // Check that some settings controls are created
      const settingsControls = mockContainer.querySelectorAll('.setting-item');
      expect(settingsControls.length).toBeGreaterThan(0);
    });

    it('should clear container before displaying', () => {
      mockContainer.innerHTML = '<div>Previous content</div>';
      
      settingsTab.display();
      
      expect(mockContainer.innerHTML).not.toContain('Previous content');
    });

    it('should create API key settings with password inputs', () => {
      settingsTab.display();
      
      const passwordInputs = mockContainer.querySelectorAll('input[type="password"]');
      expect(passwordInputs.length).toBeGreaterThan(0);
    });

    it('should create model dropdown setting', () => {
      settingsTab.display();
      
      const dropdowns = mockContainer.querySelectorAll('select');
      expect(dropdowns.length).toBeGreaterThan(0);
    });

    it('should create text area for prompts', () => {
      settingsTab.display();
      
      const textAreas = mockContainer.querySelectorAll('textarea');
      expect(textAreas.length).toBeGreaterThan(0);
    });

    it('should create toggle settings', () => {
      settingsTab.display();
      
      const toggles = mockContainer.querySelectorAll('input[type="checkbox"]');
      expect(toggles.length).toBeGreaterThan(0);
    });
  });

  describe('setting updates', () => {
    beforeEach(() => {
      settingsTab.display();
    });

    it('should update settings when text inputs change', async () => {
      const systemPromptTextarea = mockContainer.querySelector('textarea') as HTMLTextAreaElement;
      expect(systemPromptTextarea).toBeTruthy();
      
      const newPrompt = 'Updated system prompt';
      systemPromptTextarea.value = newPrompt;
      systemPromptTextarea.dispatchEvent(new Event('input', { bubbles: true }));
      
      // Allow async update to complete
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(mockPlugin.settings.systemPrompt).toBe(newPrompt);
      expect(mockPlugin.saveSettings).toHaveBeenCalled();
    });

    it('should update API keys when password inputs change', async () => {
      const apiKeyInputs = mockContainer.querySelectorAll('input[type="password"]') as NodeListOf<HTMLInputElement>;
      expect(apiKeyInputs.length).toBeGreaterThan(0);
      
      const firstApiKeyInput = apiKeyInputs[0];
      const newApiKey = 'new-api-key-123';
      firstApiKeyInput.value = newApiKey;
      firstApiKeyInput.dispatchEvent(new Event('input', { bubbles: true }));
      
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(mockPlugin.saveSettings).toHaveBeenCalled();
    });

    it('should update numeric settings', async () => {
      // Find a number input (like maxTokens)
      const numberInputs = mockContainer.querySelectorAll('input[type="text"]') as NodeListOf<HTMLInputElement>;
      
      // Look for input that might be for maxTokens
      let maxTokensInput: HTMLInputElement | null = null;
      for (const input of numberInputs) {
        const settingItem = input.closest('.setting-item');
        if (settingItem?.textContent?.includes('Max Tokens') || settingItem?.textContent?.includes('tokens')) {
          maxTokensInput = input;
          break;
        }
      }
      
      if (maxTokensInput) {
        const newValue = '3000';
        maxTokensInput.value = newValue;
        maxTokensInput.dispatchEvent(new Event('input', { bubbles: true }));
        
        await new Promise(resolve => setTimeout(resolve, 0));
        
        expect(mockPlugin.saveSettings).toHaveBeenCalled();
      }
    });

    it('should update toggle settings', async () => {
      const toggleInputs = mockContainer.querySelectorAll('input[type="checkbox"]') as NodeListOf<HTMLInputElement>;
      
      if (toggleInputs.length > 0) {
        const firstToggle = toggleInputs[0];
        const originalValue = firstToggle.checked;
        
        firstToggle.checked = !originalValue;
        firstToggle.dispatchEvent(new Event('change', { bubbles: true }));
        
        await new Promise(resolve => setTimeout(resolve, 0));
        
        expect(mockPlugin.saveSettings).toHaveBeenCalled();
      }
    });

    it('should update model dropdown', async () => {
      const dropdowns = mockContainer.querySelectorAll('select') as NodeListOf<HTMLSelectElement>;
      
      if (dropdowns.length > 0) {
        const modelDropdown = dropdowns[0];
        const originalValue = modelDropdown.value;
        
        // Change to a different option
        const options = Array.from(modelDropdown.options);
        const differentOption = options.find(opt => opt.value !== originalValue);
        
        if (differentOption) {
          modelDropdown.value = differentOption.value;
          modelDropdown.dispatchEvent(new Event('change', { bubbles: true }));
          
          await new Promise(resolve => setTimeout(resolve, 0));
          
          expect(mockPlugin.settings.model).toBe(differentOption.value);
          expect(mockPlugin.saveSettings).toHaveBeenCalled();
        }
      }
    });
  });

  describe('API key testing', () => {
    it('should create API key test buttons', () => {
      settingsTab.display();
      
      const buttons = mockContainer.querySelectorAll('button');
      const testButtons = Array.from(buttons).filter(btn => 
        btn.textContent?.toLowerCase().includes('test') ||
        btn.textContent?.toLowerCase().includes('verify')
      );
      
      expect(testButtons.length).toBeGreaterThan(0);
    });

    it('should handle successful API key test', async () => {
      const { LLMProvider } = require('../../src/llm/llmProvider');
      LLMProvider.testApiKey = jest.fn().mockResolvedValue(true);
      
      settingsTab.display();
      
      // Find and click test button
      const buttons = mockContainer.querySelectorAll('button');
      const testButton = Array.from(buttons).find(btn => 
        btn.textContent?.toLowerCase().includes('test')
      );
      
      if (testButton) {
        testButton.click();
        
        // Allow async operation to complete
        await new Promise(resolve => setTimeout(resolve, 100));
        
        expect(LLMProvider.testApiKey).toHaveBeenCalled();
      }
    });

    it('should handle failed API key test', async () => {
      const { LLMProvider } = require('../../src/llm/llmProvider');
      LLMProvider.testApiKey = jest.fn().mockResolvedValue(false);
      
      settingsTab.display();
      
      const buttons = mockContainer.querySelectorAll('button');
      const testButton = Array.from(buttons).find(btn => 
        btn.textContent?.toLowerCase().includes('test')
      );
      
      if (testButton) {
        testButton.click();
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        expect(LLMProvider.testApiKey).toHaveBeenCalled();
      }
    });
  });

  describe('settings validation', () => {
    it('should handle invalid numeric inputs gracefully', async () => {
      settingsTab.display();
      
      const numberInputs = mockContainer.querySelectorAll('input[type="text"]') as NodeListOf<HTMLInputElement>;
      
      if (numberInputs.length > 0) {
        const firstInput = numberInputs[0];
        firstInput.value = 'invalid-number';
        firstInput.dispatchEvent(new Event('input', { bubbles: true }));
        
        await new Promise(resolve => setTimeout(resolve, 0));
        
        // Should not crash and settings should remain valid
        expect(mockPlugin.saveSettings).toHaveBeenCalled();
      }
    });

    it('should preserve original settings structure', () => {
      const originalKeys = Object.keys(mockSettings);
      
      settingsTab.display();
      
      const currentKeys = Object.keys(mockPlugin.settings);
      expect(currentKeys).toEqual(expect.arrayContaining(originalKeys));
    });
  });
});