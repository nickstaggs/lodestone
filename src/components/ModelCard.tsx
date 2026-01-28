import React from "react";
import type { LLMModel } from "../db";

interface ModelCardProps {
	model: LLMModel;
	isSelected?: boolean;
	onSelect: (model: LLMModel) => void;
}

export const ModelCard: React.FC<ModelCardProps> = ({
	model,
	isSelected,
	onSelect,
}) => {
	return (
		<div
			className={`p-4 border rounded-lg cursor-pointer transition-all hover:bg-gray-50 ${
				isSelected
					? "border-blue-500 bg-blue-50 ring-2 ring-blue-200"
					: "border-gray-200"
			}`}
			onClick={() => onSelect(model)}
		>
			<h3 className="font-semibold text-lg">{model.model}</h3>
			<p className="text-sm text-gray-500">{model.company}</p>
		</div>
	);
};
