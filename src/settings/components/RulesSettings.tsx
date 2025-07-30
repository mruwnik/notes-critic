import React, { useState, useEffect, useCallback } from 'react';
import { App } from 'obsidian';
import { RuleManager } from 'rules/RuleManager';
import { NotesCriticRule } from 'types';
import { useSettings, SettingsProvider } from 'hooks/useSettings';

interface RuleCardProps {
    rule: NotesCriticRule;
}

const RuleCard: React.FC<RuleCardProps> = ({ rule }) => {
    const cardClass = `notes-critic-rule-card ${!rule.enabled ? 'notes-critic-rule-disabled' : ''}`;

    return (
        <div className={cardClass}>
            <div className="notes-critic-rule-header">
                <h4 className="notes-critic-rule-name">{rule.name}</h4>
                <span className="notes-critic-rule-path">{rule.filePath}</span>
            </div>
            
            <div className="notes-critic-rule-details">
                {rule.globs && rule.globs.length > 0 && (
                    <p><strong>Patterns:</strong> {rule.globs.join(', ')}</p>
                )}
                
                {rule.feedbackThreshold && (
                    <p><strong>Threshold:</strong> {rule.feedbackThreshold} paragraphs</p>
                )}
                
                {rule.feedbackCooldownSeconds && (
                    <p><strong>Cooldown:</strong> {rule.feedbackCooldownSeconds}s</p>
                )}
                
                {rule.model && (
                    <p><strong>Model:</strong> {rule.model}</p>
                )}
                
                <p><strong>Auto-trigger:</strong> {rule.autoTrigger ? 'Yes' : 'No'}</p>
                
                {!rule.enabled && (
                    <p><strong>Status:</strong> <span style={{color: '#ff6b6b'}}>Disabled</span></p>
                )}
            </div>
        </div>
    );
};

export const RulesSettings: React.FC = () => {
    const { app } = useSettings();
    const [rules, setRules] = useState<NotesCriticRule[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [ruleManager] = useState(() => new RuleManager(app));

    const loadRules = useCallback(async () => {
        try {
            setError(null);
            await ruleManager.initialize();
            const loadedRules = ruleManager.getRules();
            setRules(loadedRules);
        } catch (err: any) {
            setError(`Error loading rules: ${err.message}`);
            console.error('Error loading rules:', err);
        } finally {
            setIsLoading(false);
        }
    }, [ruleManager]);

    const handleRefresh = useCallback(async () => {
        setIsRefreshing(true);
        try {
            await ruleManager.refreshRules();
            await loadRules();
        } catch (err: any) {
            setError(`Error refreshing rules: ${err.message}`);
            console.error('Error refreshing rules:', err);
        } finally {
            setIsRefreshing(false);
        }
    }, [ruleManager, loadRules]);

    useEffect(() => {
        loadRules();
    }, [loadRules]);

    const renderContent = () => {
        if (isLoading) {
            return <p>Loading rules...</p>;
        }

        if (error) {
            return <p className="notes-critic-error">{error}</p>;
        }

        if (rules.length === 0) {
            return (
                <p className="notes-critic-no-rules">
                    No rules found. Create a rule file in .notes-critic/rules/ to get started.
                </p>
            );
        }

        return (
            <div className="notes-critic-rules-list">
                {rules.map((rule, index) => (
                    <RuleCard key={`${rule.filePath}-${index}`} rule={rule} />
                ))}
            </div>
        );
    };

    return (
        <div className="notes-critic-rules-overview">
            <p className="notes-critic-rules-description">
                Rules are stored in <code>.notes-critic/rules/</code> directories throughout your vault.
                Create markdown files with YAML frontmatter to configure file-specific behavior.
            </p>
            
            <div className="notes-critic-rules-buttons">
                <button
                    className="mod-cta"
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                >
                    {isRefreshing ? 'Refreshing...' : 'Refresh Rules'}
                </button>
            </div>
            
            {renderContent()}
        </div>
    );
};
