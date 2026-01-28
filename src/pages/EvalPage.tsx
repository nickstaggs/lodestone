import { useState } from "react";
import type { EditorContent, LLMModel } from "../db";
import type { Relationship } from "../utils/relationshipTypes";
import { PROMPT_TEMPLATES } from "../evals/prompts";
import { TEST_CASES } from "../evals/testCases";
import { ENV } from "../config/env";
import { ModelList } from "../components/ModelList";
import { useModelContext } from "../context/ModelContext";

interface ModelResult {
	modelName: string;
	promptId: string;
	output: {
		highlights: EditorContent["highlights"];
		relationships: Relationship[];
	};
	error?: string;
}

interface LoadingState {
	status:
		| "idle"
		| "sending"
		| "waiting"
		| "processing"
		| "error";
	message?: string;
}

export const EvalPage = () => {
	const { availableModels, isLoading: modelsLoading, getModelService } =
		useModelContext();
	const [results, setResults] = useState<ModelResult[]>([]);
	const [loadingState, setLoadingState] = useState<LoadingState>({
		status: "idle",
	});
	const [selectedTest, setSelectedTest] = useState(TEST_CASES[0]);
	const [selectedPrompt, setSelectedPrompt] = useState(PROMPT_TEMPLATES[0]);
	const [customPrompt, setCustomPrompt] = useState("");
	const [isCustomPrompt, setIsCustomPrompt] = useState(false);

	// Model Selection State
	const [selectedModel, setSelectedModel] = useState<LLMModel | undefined>();
	const [showModelSelector, setShowModelSelector] = useState(false);

	const evaluateModel = async () => {
		if (!selectedModel) return;

		const modelName = `${selectedModel.company}/${selectedModel.model}`;
		console.log(`Starting evaluation for ${modelName}...`);
		setLoadingState({ status: "sending", message: "Sending request..." });

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

			const service = getModelService(selectedModel);

			const promptToUse = isCustomPrompt
				? customPrompt
				: selectedPrompt.template.replace("{{text}}", selectedTest.text);

			setLoadingState({
				status: "waiting",
				message: "Waiting for model response...",
			});

			const output = await service.analyse(selectedTest.text, promptToUse, {
				apiKey,
			});

			console.log(`Received response:`, output);
			setLoadingState({ status: "idle" });

			setResults((prev) => [
				...prev,
				{
					modelName,
					promptId: isCustomPrompt ? "custom" : selectedPrompt.id,
					output,
				},
			]);
		} catch (error) {
			console.error(`Error during evaluation:`, error);
			setLoadingState({
				status: "error",
				message: error instanceof Error ? error.message : "Unknown error",
			});

			setResults((prev) => [
				...prev,
				{
					modelName,
					promptId: isCustomPrompt ? "custom" : selectedPrompt.id,
					output: {
						highlights: [],
						relationships: [],
					},
					error: error instanceof Error ? error.message : "Unknown error",
				},
			]);
		}
	};

	return (
		<div className="p-4 max-w-7xl mx-auto">
			<h2 className="text-2xl font-bold mb-4">Model Evaluation</h2>

			{/* Test Case Selection and Preview */}
			<div className="mb-8">
				<div className="flex items-center gap-4 mb-4">
					<h3 className="text-lg font-semibold">Test Case</h3>
					<select
						value={selectedTest.id}
						onChange={(e) =>
							setSelectedTest(
								TEST_CASES.find((t) => t.id === Number(e.target.value)) ||
									TEST_CASES[0]
							)
						}
						className="border p-2 rounded flex-grow"
					>
						{TEST_CASES.map((test) => (
							<option key={test.id} value={test.id}>
								{test.name}
							</option>
						))}
					</select>
				</div>

				<div className="border rounded p-4 bg-white">
					<h4 className="font-medium mb-2">Text to Analyse:</h4>
					<div className="whitespace-pre-wrap bg-gray-50 p-4 rounded max-h-40 overflow-y-auto">
						{selectedTest.text}
					</div>
				</div>
			</div>

			{/* Prompt Selection */}
			<div className="mb-8">
				<h3 className="text-lg font-semibold mb-4">Prompt Template</h3>
				<div className="flex gap-2 mb-2">
					<select
						value={isCustomPrompt ? "custom" : selectedPrompt.id}
						onChange={(e) => {
							const value = e.target.value;
							setIsCustomPrompt(value === "custom");
							if (value !== "custom") {
								const prompt = PROMPT_TEMPLATES.find((p) => p.id === value);
								if (prompt) setSelectedPrompt(prompt);
							}
						}}
						className="border p-2 rounded w-full"
						disabled={loadingState.status === "waiting"}
					>
						{PROMPT_TEMPLATES.map((prompt) => (
							<option key={prompt.id} value={prompt.id}>
								{prompt.name}
							</option>
						))}
						<option value="custom">Custom Prompt</option>
					</select>
				</div>

				{isCustomPrompt && (
					<textarea
						value={customPrompt}
						onChange={(e) => setCustomPrompt(e.target.value)}
						className="w-full border p-2 rounded h-32 mb-2 font-mono text-sm"
						placeholder="Enter your custom prompt here... use {{text}} for the input text"
					/>
				)}

				{!isCustomPrompt && (
					<div className="bg-gray-50 p-4 rounded border text-sm whitespace-pre-wrap h-32 overflow-y-auto">
						{selectedPrompt.template}
					</div>
				)}useEffect
			</div>

			{/* Model Selection and Run */}
			<div className="mb-8 p-4 bg-blue-50 rounded-lg border border-blue-100">
				<div className="flex justify-between items-center mb-4">
					<h3 className="text-lg font-semibold">Model Configuration</h3>
					<button
						onClick={() => setShowModelSelector(!showModelSelector)}
						className="text-blue-600 hover:text-blue-800 text-sm font-medium"
					>
						{showModelSelector ? "Hide Models" : "Change Model"}
					</button>
				</div>

				{showModelSelector && (
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 h-96">
						<ModelList
							company="OpenAI"
							models={availableModels.OpenAI}
							isLoading={modelsLoading}
							selectedModel={selectedModel}
							onSelect={setSelectedModel}
						/>
						<ModelList
							company="Anthropic"
							models={availableModels.Anthropic}
							isLoading={modelsLoading}
							selectedModel={selectedModel}
							onSelect={setSelectedModel}
						/>
					</div>
				)}

				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<span className="font-medium">Selected Model:</span>
						{selectedModel ? (
							<span className="bg-white px-3 py-1 rounded border shadow-sm">
								{selectedModel.company} / {selectedModel.model}
							</span>
						) : (
							<span className="text-gray-500 italic">None selected</span>
						)}
					</div>

					<button
						onClick={evaluateModel}
						disabled={!selectedModel || loadingState.status !== "idle"}
						className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
					>
						{loadingState.status !== "idle" && (
							<div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
						)}
						{loadingState.status === "sending" ||
						loadingState.status === "waiting"
							? "Running..."
							: "Run Evaluation"}
					</button>
				</div>

				{loadingState.status === "error" && (
					<div className="mt-4 text-red-600 bg-red-50 p-2 rounded text-sm">
						Error: {loadingState.message}
					</div>
				)}
			</div>

			{/* Results */}
			<div className="space-y-8">
				{results.map((result, index) => (
					<div
						key={index}
						className="border rounded-lg overflow-hidden bg-white shadow-sm"
					>
						<div className="bg-gray-50 p-3 border-b flex justify-between items-center">
							<div className="font-semibold">{result.modelName}</div>
							<div className="text-sm text-gray-500">
								Prompt: {result.promptId}
							</div>
						</div>
						<div className="p-4">
							{result.error ? (
								<div className="text-red-600">
									<p className="font-bold">Error:</p>
									<pre className="whitespace-pre-wrap text-sm mt-1">
										{result.error}
									</pre>
								</div>
							) : (
								<div className="grid grid-cols-2 gap-4">
									<div>
										<h5 className="font-medium mb-2 text-sm text-gray-500">
											Highlights ({result.output.highlights.length})
										</h5>
										<div className="max-h-60 overflow-y-auto space-y-2">
											{result.output.highlights.map((h, i) => (
												<div
													key={i}
													className="p-2 bg-yellow-50 border border-yellow-100 rounded text-sm"
												>
													<span className="font-bold text-xs uppercase text-gray-500 block">
														{h.labelType}
													</span>
													{h.text}
												</div>
											))}
										</div>
									</div>
									<div>
										<h5 className="font-medium mb-2 text-sm text-gray-500">
											Relationships ({result.output.relationships.length})
										</h5>
										<div className="max-h-60 overflow-y-auto space-y-2">
											{result.output.relationships.map((r, i) => (
												<div
													key={i}
													className="p-2 bg-blue-50 border border-blue-100 rounded text-sm"
												>
													<span className="block">
														{r.sourceHighlightId} → {r.targetHighlightId}
													</span>
													{/* <span className="text-xs text-gray-500">
														{r.type}
													</span> */}
												</div>
											))}
										</div>
									</div>
								</div>
							)}
						</div>
					</div>
				))}
			</div>
		</div>
	);
};
