import React from 'react';
import { useModelSettings } from 'hooks/useSettings';
import { AVAILABLE_MODELS, Model } from '../../constants';

const CSS_CLASSES = {
    container: 'notes-critic-model-selector',
    label: 'notes-critic-model-label'
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
                        {Object.entries(AVAILABLE_MODELS).map(([value, model]: [string, Model]) => (
                            <option key={value} value={value}>
                                {model.name}
                            </option>
                        ))}
                    </select>
                </div>
            </div>
        </div>
    );
};
