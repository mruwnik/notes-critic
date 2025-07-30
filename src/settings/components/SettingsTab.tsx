import React, { useState, useCallback } from 'react';
import { App, Plugin } from 'obsidian'; 
import { LLMProvider } from 'llm/llmProvider';
import { ModelSelector } from 'views/components/ModelSelector';
import { RulesSettings } from 'settings/components/RulesSettings';
import { MCPSettingsReact } from 'settings/components/MCPSettings';
import { ToolsSettingsReact } from 'settings/components/ToolsSettings';
import { useSettings } from 'hooks/useSettings';

interface TextSettingProps {
    name: string;
    desc: string;
    placeholder: string;
    value: string | number;
    onChange: (value: string) => Promise<void>;
    isPassword?: boolean;
    isWide?: boolean;
    parser?: (value: string) => any;
}

interface ApiKeySettingProps {
    name: string;
    desc: string;
    placeholder: string;
    value: string;
    provider: 'anthropic' | 'openai';
    onChange: (value: string) => Promise<void>;
    app: App;
}

interface TextAreaSettingProps {
    name: string;
    desc: string;
    placeholder: string;
    value: string;
    onChange: (value: string) => Promise<void>;
}

const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
    <h3 className="notes-critic-settings-section">{title}</h3>
);

const TextSetting: React.FC<TextSettingProps> = ({
    name,
    desc,
    placeholder,
    value,
    onChange,
    isPassword = false,
    isWide = false,
    parser
}) => {
    const displayValue = typeof value === 'string' ? value : value?.toString() || '';

    const handleChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = event.target.value;
        
        if (parser) {
            const parsedValue = parser(newValue);
            if (parsedValue === undefined) {
                return; // Invalid input, don't save
            }
        }
        
        await onChange(newValue);
    };

    return (
        <div className="setting-item">
            <div className="setting-item-info">
                <div className="setting-item-name">{name}</div>
                <div className="setting-item-description">{desc}</div>
            </div>
            <div className="setting-item-control">
                <input
                    type={isPassword ? 'password' : 'text'}
                    placeholder={placeholder}
                    value={displayValue}
                    onChange={handleChange}
                    className={isWide ? 'notes-critic-api-key-input' : ''}
                />
            </div>
        </div>
    );
};

const ApiKeySetting: React.FC<ApiKeySettingProps> = ({
    name,
    desc,
    placeholder,
    value,
    provider,
    onChange,
    app
}) => {
    const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'valid' | 'invalid' | 'error'>('idle');

    const handleTest = async () => {
        setTestStatus('testing');
        
        try {
            const isValid = await LLMProvider.testApiKey(value, provider, app);
            setTestStatus(isValid ? 'valid' : 'invalid');
            
            setTimeout(() => {
                setTestStatus('idle');
            }, 3000);
        } catch (error) {
            console.error('Failed to test API key:', error);
            setTestStatus('error');
            
            setTimeout(() => {
                setTestStatus('idle');
            }, 3000);
        }
    };

    const getButtonText = () => {
        switch (testStatus) {
            case 'testing': return 'Testing...';
            case 'valid': return '✓ Valid';
            case 'invalid': return '✗ Invalid';
            case 'error': return '✗ Error';
            default: return 'Test';
        }
    };

    const getButtonClass = () => {
        const baseClass = 'notes-critic-test-button';
        switch (testStatus) {
            case 'valid': return `${baseClass} notes-critic-test-button-valid`;
            case 'invalid':
            case 'error': return `${baseClass} notes-critic-test-button-invalid`;
            default: return baseClass;
        }
    };

    return (
        <div className="setting-item">
            <div className="setting-item-info">
                <div className="setting-item-name">{name}</div>
                <div className="setting-item-description">{desc}</div>
            </div>
            <div className="setting-item-control">
                <input
                    type="password"
                    placeholder={placeholder}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="notes-critic-api-key-input"
                />
                <button
                    className={getButtonClass()}
                    onClick={handleTest}
                    disabled={testStatus === 'testing'}
                    title="Test API key connection"
                >
                    {getButtonText()}
                </button>
            </div>
        </div>
    );
};

const TextAreaSetting: React.FC<TextAreaSettingProps> = ({
    name,
    desc,
    placeholder,
    value,
    onChange
}) => {
    return (
        <div className="setting-item notes-critic-textarea-setting">
            <div className="setting-item-info">
                <div className="setting-item-name">{name}</div>
                <div className="setting-item-description">{desc}</div>
            </div>
            <div className="notes-critic-textarea-container">
                <textarea
                    placeholder={placeholder}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    rows={8}
                    className="notes-critic-textarea"
                />
            </div>
        </div>
    );
};

export const SettingsTabReact: React.FC = () => {
    const { settings, updateSetting, app, plugin } = useSettings();

    const parseInteger = (value: string, min: number = 0) => {
        const parsed = parseInt(value);
        return (!isNaN(parsed) && parsed >= min) ? parsed : undefined;
    };

    return (
        <div className="notes-critic-settings">
            {/* AI Model Configuration */}
            <SectionHeader title="AI Model Configuration" />
            
            <TextAreaSetting
                name="System Prompt"
                desc="Instructions for the AI model on how to provide feedback"
                placeholder="You are a helpful writing assistant..."
                value={settings.systemPrompt}
                onChange={(value) => updateSetting('systemPrompt', value)}
            />

            <TextAreaSetting
                name="Feedback Prompt"
                desc="Instructions for the AI model on how to provide feedback"
                placeholder="You are a helpful writing assistant..."
                value={settings.feedbackPrompt}
                onChange={(value) => updateSetting('feedbackPrompt', value)}
            />

            <ModelSelector
                title="Model"
                desc="AI model for feedback"
                modelKind="model"
            />

            <ModelSelector
                title="Summarizer Model"
                desc="AI model for summarizing conversations"
                modelKind="summarizer"
            />

            {/* API Keys */}
            <SectionHeader title="API Keys" />

            <ApiKeySetting
                name="Anthropic API Key"
                desc="Your Anthropic API key for Claude models"
                placeholder="sk-ant-..."
                value={settings.anthropicApiKey}
                provider="anthropic"
                onChange={(value) => updateSetting('anthropicApiKey', value)}
                app={app}
            />

            <ApiKeySetting
                name="OpenAI API Key"
                desc="Your OpenAI API key for GPT models"
                placeholder="sk-..."
                value={settings.openaiApiKey}
                provider="openai"
                onChange={(value) => updateSetting('openaiApiKey', value)}
                app={app}
            />

            {/* General Settings */}
            <SectionHeader title="General Settings" />

            {/* Feedback Settings */}
            <SectionHeader title="Feedback Settings" />

            <TextSetting
                name="Feedback Threshold"
                desc="Number of paragraphs that must change before auto-triggering feedback"
                placeholder="3"
                value={settings.feedbackThreshold}
                onChange={async (value) => {
                    const parsed = parseInteger(value, 1);
                    if (parsed !== undefined) await updateSetting('feedbackThreshold', parsed);
                }}
                parser={(value) => parseInteger(value, 1)}
            />

            <TextSetting
                name="Feedback Cooldown"
                desc="Minimum seconds between auto-triggered feedback"
                placeholder="30"
                value={settings.feedbackCooldownSeconds}
                onChange={async (value) => {
                    const parsed = parseInteger(value, 0);
                    if (parsed !== undefined) await updateSetting('feedbackCooldownSeconds', parsed);
                }}
                parser={(value) => parseInteger(value, 0)}
            />

            <TextSetting
                name="Max Tokens"
                desc="Maximum number of tokens to include from conversation history"
                placeholder="4000"
                value={settings.maxTokens}
                onChange={async (value) => {
                    const parsed = parseInteger(value, 1);
                    if (parsed !== undefined) await updateSetting('maxTokens', parsed);
                }}
                parser={(value) => parseInteger(value, 1)}
            />

            <TextSetting
                name="Thinking Budget Tokens"
                desc="Maximum number of tokens for AI thinking"
                placeholder="4000"
                value={settings.thinkingBudgetTokens}
                onChange={async (value) => {
                    const parsed = parseInteger(value, 1);
                    if (parsed !== undefined) await updateSetting('thinkingBudgetTokens', parsed);
                }}
                parser={(value) => parseInteger(value, 1)}
            />

            <TextSetting
                name="Max History Tokens"
                desc="Maximum number of tokens to include from conversation history"
                placeholder="4000"
                value={settings.maxHistoryTokens}
                onChange={async (value) => {
                    const parsed = parseInteger(value, 1);
                    if (parsed !== undefined) await updateSetting('maxHistoryTokens', parsed);
                }}
                parser={(value) => parseInteger(value, 1)}
            />

            {/* Logging */}
            <SectionHeader title="Logging" />
            
            <TextSetting
                name="Log Path"
                desc="Path to the directory where logs will be saved"
                placeholder=".notes-critic/conversations"
                value={settings.logPath}
                onChange={(value) => updateSetting('logPath', value)}
            />

            {/* MCP Settings */}
            <SectionHeader title="Model Context Protocol (MCP)" />
            <MCPSettingsReact />

            {/* Tools Overview */}
            <SectionHeader title="Available Tools" />
            <ToolsSettingsReact />

            {/* Rules Management */}
            <SectionHeader title="Rules Management" />
            <RulesSettings />
        </div>
    );
};