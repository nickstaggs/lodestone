import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ModelList } from "../components/ModelList";
import { SessionManager } from "../utils/sessionManager";
import type { LLMModel } from "../db";
import { useModelContext } from "../context/ModelContext";

export const ModelSelectionPage = () => {
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const sessionId = id ? parseInt(id) : undefined;
	const { availableModels, isLoading: modelsLoading, error } =
		useModelContext();

	const [selectedModel, setSelectedModel] = useState<LLMModel | undefined>();

	useEffect(() => {
		const loadSession = async () => {
			if (sessionId) {
				const session = await SessionManager.getSession(sessionId);
				if (session && session.selectedModel) {
					setSelectedModel(session.selectedModel);
				}
			}
		};

		loadSession();
	}, [sessionId]);

	const handleSelect = async (model: LLMModel) => {
		setSelectedModel(model);
		if (sessionId) {
			await SessionManager.updateSessionModel(sessionId, model);

			// Navigate depending on session status
			const session = await SessionManager.getSession(sessionId);
			if (session) {
				// If we came from just creating it (draft), go to Input
				// If we came from analysis (changing model?), go to Editor
				if (session.status === "draft") {
					navigate(`/input/${sessionId}`);
				} else {
					navigate(`/analysis/${sessionId}`);
				}
			} else {
				navigate("/");
			}
		}
	};

	return (
		<div className="container mx-auto p-8 max-w-6xl animate-fade-in transition-opacity duration-300">
			<header className="mb-8">
				<button
					onClick={() => navigate(-1)}
					className="text-gray-500 hover:text-gray-800 mb-4 flex items-center gap-2 transition-colors"
				>
					← Back
				</button>
				<h1 className="text-3xl font-bold text-gray-900">Select AI Model</h1>
				<p className="text-gray-600 mt-2">
					Choose the AI model you want to use for this session.
				</p>
			</header>

			{error && <div className="text-red-500 mb-4">Error: {error}</div>}

			<div className="grid grid-cols-1 md:grid-cols-2 gap-8 h-[600px]">
				<ModelList
					company="OpenAI"
					models={availableModels.OpenAI}
					isLoading={modelsLoading}
					selectedModel={selectedModel}
					onSelect={handleSelect}
				/>
				<ModelList
					company="Anthropic"
					models={availableModels.Anthropic}
					isLoading={modelsLoading}
					selectedModel={selectedModel}
					onSelect={handleSelect}
				/>
			</div>
		</div>
	);
};
