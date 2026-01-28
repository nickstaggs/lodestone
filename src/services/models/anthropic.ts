import Anthropic from "@anthropic-ai/sdk";
import type {
	ModelService,
	ModelConfig,
	ModelResponse,
	ModelName,
} from "./types";
import { LABEL_CONFIGS } from "../../utils/constants";

export class AnthropicService implements ModelService {
	name: ModelName;
	private defaultModel: string;

	constructor(modelName: string) {
		this.name = modelName;
		this.defaultModel = modelName;
	}

	static async listModels(apiKey: string): Promise<string[]> {
		const anthropic = new Anthropic({
			apiKey: apiKey,
			dangerouslyAllowBrowser: true,
		});
		try {
			const list = await anthropic.models.list();
			// Filter for chat models, though Anthropic mostly exposes chat models in this endpoint
			return list.data
				.map((m) => m.id)
				.filter((id) => id.includes("claude"))
				.sort()
				.reverse(); // Newest usually have higher version numbers or dates
		} catch (e) {
			console.error("Failed to list Anthropic models", e);
			return [];
		}
	}

	async analyse(
		_: string,
		prompt: string,
		config: ModelConfig
	): Promise<ModelResponse> {
		if (!config.apiKey) {
			throw new Error("Anthropic API key is required");
		}

		console.log(`Anthropic Service (${this.name}): Starting request with structured outputs...`);

		const anthropic = new Anthropic({
			apiKey: config.apiKey,
			dangerouslyAllowBrowser: true,
		});

		try {
			const message = await anthropic.beta.messages.create({
				model: config.model || this.defaultModel,
				max_tokens: 4096,
				messages: [
					{
						role: "user",
						content: prompt,
					},
				],
				temperature: 0.3,
				betas: ["structured-outputs-2025-11-13"],
				output_format: {
					type: "json_schema",
					schema: {
						type: "object",
						properties: {
							highlights: {
								type: "array",
								items: {
									type: "object",
									properties: {
										id: { type: "string" },
										labelType: {
											type: "string",
											enum: LABEL_CONFIGS.map((l) => l.id),
										},
										text: { type: "string" },
									},
									required: ["id", "labelType", "text"],
									additionalProperties: false,
								},
							},
							relationships: {
								type: "array",
								items: {
									type: "object",
									properties: {
										sourceHighlightId: { type: "string" },
										targetHighlightId: { type: "string" },
									},
									required: ["sourceHighlightId", "targetHighlightId"],
									additionalProperties: false,
								},
							},
						},
						required: ["highlights", "relationships"],
						additionalProperties: false,
					},
				},
			});

			const contentBlock = message.content[0];
			if (contentBlock.type !== "text") {
				throw new Error("Unexpected response type from Anthropic");
			}

			// With structured outputs, the response is guaranteed to be valid JSON
			// matching the schema, but we still parse it from the text block
			const result = JSON.parse(contentBlock.text);
			return {
				highlights: result.highlights || [],
				relationships: result.relationships || [],
			};
		} catch (error) {
			console.error("Anthropic API error:", error);
			if (error instanceof Error) {
				throw new Error(`Anthropic API error: ${error.message}`);
			}
			throw new Error("Unknown Anthropic API error");
		}
	}

	async generateQuestions(
		_: string,
		prompt: string,
		config: ModelConfig
	): Promise<string[]> {
		if (!config.apiKey) {
			throw new Error("Anthropic API key is required");
		}

		const anthropic = new Anthropic({
			apiKey: config.apiKey,
			dangerouslyAllowBrowser: true,
		});

		try {
			const message = await anthropic.beta.messages.create({
				model: config.model || this.defaultModel,
				max_tokens: 1024,
				messages: [
					{
						role: "user",
						content: prompt,
					},
				],
				temperature: 0.3,
				betas: ["structured-outputs-2025-11-13"],
				output_format: {
					type: "json_schema",
					schema: {
						type: "object",
						properties: {
							questions: {
								type: "array",
								items: { type: "string" },
							},
						},
						required: ["questions"],
						additionalProperties: false,
					},
				},
			});

			const contentBlock = message.content[0];
			if (contentBlock.type !== "text") {
				throw new Error("Unexpected response type from Anthropic");
			}

			const result = JSON.parse(contentBlock.text);
			return result.questions || [];
		} catch (error) {
			console.error("Anthropic API error in generateQuestions:", error);
			if (error instanceof Error) {
				throw new Error(`Anthropic API error: ${error.message}`);
			}
			throw new Error("Unknown Anthropic API error");
		}
	}
}
