import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { RemirrorJSON } from "remirror";
import { performAnalysis } from "../utils/analysisUtils";
import { useModelContext } from "../context/ModelContext";
import { ENV } from "../config/env";
import { LLMModel } from "../db";

interface UseAnalysisProps {
	sessionId: number | null;
	content: RemirrorJSON;
	isDirty: boolean;
	saveChanges: () => Promise<void>;
	selectedModel?: LLMModel;
}

export function useAnalysis({
	sessionId,
	content,
	isDirty,
	saveChanges,
	selectedModel,
}: UseAnalysisProps) {
	const navigate = useNavigate();
	const [isCreating, setIsCreating] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const { getModelService } = useModelContext();

	const handleAnalyse = useCallback(async () => {
		if (!sessionId) {
			setError("No session ID available for analysis");
			return;
		}

		if (!selectedModel) {
			setError("Please select a model before analysing");
			return;
		}

		setIsCreating(true);
		setError(null);

		try {
			// Resolve API key
			let apiKey: string | undefined;
			if (selectedModel.company === "Anthropic") {
				apiKey = ENV.ANTHROPIC_API_KEY;
			} else {
				apiKey = ENV.OPENAI_API_KEY;
			}

			if (!apiKey) {
				throw new Error(
					`API key not found for ${selectedModel.company}. Please check your .env file.`
				);
			}

			const modelService = getModelService(selectedModel);

			// Perform the analysis
			const result = await performAnalysis({
				sessionId,
				content,
				isDirty,
				saveChanges,
				modelService,
				apiKey,
			});

			if (!result.success) {
				setError(result.error || "Unknown error during analysis");
				return;
			}

			// Navigate directly to editor page in analysis mode
			navigate(`/analysis/${sessionId}`);
		} catch (error) {
			console.error("Failed to create and analyse session:", error);
			setError(error instanceof Error ? error.message : "Unknown error");
		} finally {
			setIsCreating(false);
		}
	}, [
		sessionId,
		content,
		isDirty,
		saveChanges,
		selectedModel,
		getModelService,
		navigate,
	]);

	return {
		isCreating,
		error,
		setError,
		handleAnalyse,
	};
}
