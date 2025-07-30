import React from 'react';
import { NotesCriticSettings } from 'types';
import { useModelSettings } from 'hooks/useSettings';

const CSS_CLASSES = {
    container: 'notes-critic-model-selector',
    label: 'notes-critic-model-label'
};

// Model choices that match the settings tab
const MODEL_CHOICES = {
    'anthropic/claude-opus-4-20250514': 'Claude Opus 4',
    'anthropic/claude-sonnet-4-20250514': 'Claude Sonnet 4',
    'anthropic/claude-3-7-sonnet-latest': 'Claude 3.7 Sonnet',
    'anthropic/claude-3-5-sonnet-latest': 'Claude 3.5 Sonnet',
    'anthropic/claude-3-5-haiku-latest': 'Claude 3.5 Haiku',
    'openai/gpt-3.5-turbo': 'GPT-3.5 Turbo',
    'openai/gpt-4.1': 'GPT-4.1',
    'openai/gpt-4.1-mini': 'GPT-4.1 Mini',
    'openai/gpt-4.1-nano': 'GPT-4.1 Nano',
    'openai/gpt-4.5-preview': 'GPT-4.5 Preview',
    'openai/gpt-4o': 'GPT-4o',
    'openai/gpt-4o-mini': 'GPT-4o Mini',
    'openai/o1': 'O1',
    'openai/o1-pro': 'O1 Pro',
    'openai/o3-pro': 'O3 Pro',
    'openai/o3': 'O3',
    'openai/o4-mini': 'O4 Mini',
    'openai/o3-mini': 'O3 Mini',
    'openai/o1-mini': 'O1 Mini'
};

interface ModelSelectorProps {
    title?: string;
    desc?: string;
    modelKind?: 'model' | 'summarizer';
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
    title = "Model",
    desc = "AI model for feedback",
    modelKind = 'model'
}) => {
    const { model, summarizerModel, updateModel, updateSummarizerModel } = useModelSettings();
    const currentModel = modelKind === 'model' ? model : summarizerModel;
    const updateFunction = modelKind === 'model' ? updateModel : updateSummarizerModel;

    const handleModelChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
        const newModel = event.target.value;
        await updateFunction(newModel);
    };

    return (
        <div className={CSS_CLASSES.container}>
            <div className="setting-item">
                <div className="setting-item-info">
                    <div className="setting-item-name">{title}</div>
                    <div className="setting-item-description">{desc}</div>
                </div>
                <div className="setting-item-control">
                    <select 
                        value={currentModel}
                        onChange={handleModelChange}
                        className="dropdown"
                    >
                        {Object.entries(MODEL_CHOICES).map(([value, label]) => (
                            <option key={value} value={value}>
                                {label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>
        </div>
    );
};
