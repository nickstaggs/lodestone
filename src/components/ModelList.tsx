import React from "react";
import { ModelCard } from "./ModelCard";
import type { LLMModel } from "../db";

interface ModelListProps {
	company: "Anthropic" | "OpenAI";
	models: string[];
	isLoading: boolean;
	error?: string;
	selectedModel?: LLMModel;
	onSelect: (model: LLMModel) => void;
}

export const ModelList: React.FC<ModelListProps> = ({
	company,
	models,
	isLoading,
	error,
	selectedModel,
	onSelect,
}) => {
	return (
		<div className="flex flex-col h-full bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
			<div className="p-4 border-b border-gray-100 bg-gray-50">
				<h2 className="text-xl font-bold text-gray-800">{company}</h2>
			</div>

			<div className="p-4 flex-1 overflow-y-auto">
				{isLoading ? (
					<div className="flex items-center justify-center h-32">
						<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
					</div>
				) : error ? (
					<div className="text-red-500 p-4 text-center">
						<p>{error}</p>
					</div>
				) : (
					<div className="space-y-3">
						{models.length === 0 ? (
							<p className="text-gray-500 text-center py-4">
								No models found.
							</p>
						) : (
							models.map((modelName) => (
								<ModelCard
									key={modelName}
									model={{ company, model: modelName }}
									isSelected={
										selectedModel?.company === company &&
										selectedModel?.model === modelName
									}
									onSelect={onSelect}
								/>
							))
						)}
					</div>
				)}
			</div>
		</div>
	);
};
