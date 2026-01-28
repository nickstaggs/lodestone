import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { OpenAIService } from '../services/models/openai';
import { AnthropicService } from '../services/models/anthropic';
import { ENV } from '../config/env';
import type { ModelService } from '../services/models/types';
import type { LLMModel } from '../db';

interface AvailableModels {
    OpenAI: string[];
    Anthropic: string[];
}

interface ModelContextType {
    availableModels: AvailableModels;
    isLoading: boolean;
    error: string | null;
    refreshModels: () => Promise<void>;
    getModelService: (model: LLMModel) => ModelService;
}

const ModelContext = createContext<ModelContextType | undefined>(undefined);

export const ModelProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [availableModels, setAvailableModels] = useState<AvailableModels>({
        OpenAI: [],
        Anthropic: []
    });
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refreshModels = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        
        const newModels: AvailableModels = {
            OpenAI: [],
            Anthropic: []
        };

        try {
            const promises: Promise<void>[] = [];

            if (ENV.OPENAI_API_KEY) {
                promises.push(
                    OpenAIService.listModels(ENV.OPENAI_API_KEY)
                        .then(models => {
                            newModels.OpenAI = models;
                        })
                        .catch(err => {
                            console.error("Failed to fetch OpenAI models", err);
                            // Don't fail the whole thing if one provider fails
                        })
                );
            }

            if (ENV.ANTHROPIC_API_KEY) {
                promises.push(
                    AnthropicService.listModels(ENV.ANTHROPIC_API_KEY)
                        .then(models => {
                            newModels.Anthropic = models;
                        })
                        .catch(err => {
                            console.error("Failed to fetch Anthropic models", err);
                        })
                );
            }

            await Promise.all(promises);
            setAvailableModels(newModels);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load models");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        refreshModels();
    }, [refreshModels]);

    const getModelService = useCallback((model: LLMModel): ModelService => {
        if (model.company === 'OpenAI') {
            return new OpenAIService(model.model);
        } else if (model.company === 'Anthropic') {
            return new AnthropicService(model.model);
        }
        throw new Error(`Unsupported model company: ${model.company}`);
    }, []);

    return (
        <ModelContext.Provider value={{
            availableModels,
            isLoading,
            error,
            refreshModels,
            getModelService
        }}>
            {children}
        </ModelContext.Provider>
    );
};

export const useModelContext = () => {
    const context = useContext(ModelContext);
    if (context === undefined) {
        throw new Error('useModelContext must be used within a ModelProvider');
    }
    return context;
};
