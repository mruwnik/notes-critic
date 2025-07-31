import React, { useState, useEffect, useCallback } from 'react';
import { App } from 'obsidian';
import { RuleManager } from 'rules/RuleManager';
import { NotesCriticRule } from 'types';
import { useSettings, SettingsProvider } from 'hooks/useSettings';

interface RuleCardProps {
    rule: NotesCriticRule;
}

const RuleCard: React.FC<RuleCardProps> = ({ rule }) => {
    const cardClass = `nc-card nc-card--padded ${!rule.enabled ? 'nc-opacity-60 nc-border-faint' : ''}`;

    return (
        <div className={cardClass}>
            <div className="nc-flex nc-justify-between nc-items-center nc-pb-2 nc-border-b nc-mb-2">
                <h4 className="nc-m-0 nc-text-lg nc-text-normal">{rule.name}</h4>
                <span className="nc-text-xs nc-text-muted nc-font-mono">{rule.filePath}</span>
            </div>
            
            <div className="nc-space-y-1">
                {rule.globs && rule.globs.length > 0 && (
                    <p className="nc-m-0 nc-text-sm nc-text-muted"><strong className="nc-text-normal">Patterns:</strong> {rule.globs.join(', ')}</p>
                )}
                
                {rule.feedbackThreshold && (
                    <p className="nc-m-0 nc-text-sm nc-text-muted"><strong className="nc-text-normal">Threshold:</strong> {rule.feedbackThreshold} paragraphs</p>
                )}
                
                {rule.feedbackCooldownSeconds && (
                    <p className="nc-m-0 nc-text-sm nc-text-muted"><strong className="nc-text-normal">Cooldown:</strong> {rule.feedbackCooldownSeconds}s</p>
                )}
                
                {rule.model && (
                    <p className="nc-m-0 nc-text-sm nc-text-muted"><strong className="nc-text-normal">Model:</strong> {rule.model}</p>
                )}
                
                <p className="nc-m-0 nc-text-sm nc-text-muted"><strong className="nc-text-normal">Auto-trigger:</strong> {rule.autoTrigger ? 'Yes' : 'No'}</p>
                
                {!rule.enabled && (
                    <p className="nc-m-0 nc-text-sm nc-text-muted"><strong className="nc-text-normal">Status:</strong> <span className="nc-text-error">Disabled</span></p>
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
            return <p className="nc-text-error nc-bg-danger/10 nc-p-3 nc-rounded nc-text-sm">{error}</p>;
        }

        if (rules.length === 0) {
            return (
                <p className="nc-text-center nc-text-muted nc-italic nc-p-8">
                    No rules found. Create a rule file in .notes-critic/rules/ to get started.
                </p>
            );
        }

        return (
            <div className="nc-max-h-80 nc-overflow-y-auto">
                {rules.map((rule, index) => (
                    <RuleCard key={`${rule.filePath}-${index}`} rule={rule} />
                ))}
            </div>
        );
    };

    return (
        <div className="nc-card-container">
            <p className="nc-mb-4 nc-text-muted">
                Rules are stored in <code>.notes-critic/rules/</code> directories throughout your vault.
                Create markdown files with YAML frontmatter to configure file-specific behavior.
            </p>
            
            <div className="nc-flex nc-gap-2 nc-mb-4">
                <button
                    className="nc-btn nc-btn--primary nc-btn--base"
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
