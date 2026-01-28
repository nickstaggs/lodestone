import OpenAI from "openai";
import type {
	ModelService,
	ModelConfig,
	ModelResponse,
	ModelName,
} from "./types";
import { LABEL_CONFIGS } from "../../utils/constants";

type RawHighlight = {
	id: string;
	labelType: string;
	text: string;
	[key: string]: unknown;
};

export class OpenAIService implements ModelService {
	name: ModelName;
	private defaultModel: string;

	constructor(name: ModelName) {
		this.name = name;
		this.defaultModel = name;
	}

	static async listModels(apiKey: string): Promise<string[]> {
		const openai = new OpenAI({
			apiKey: apiKey,
			dangerouslyAllowBrowser: true,
		});
		try {
			const list = await openai.models.list();
			return list.data
				.map((m) => m.id)
				.filter(
					(id) =>
						!id.includes("vision") && // vision specific models sometimes separate? actually gpt-4-vision is chat model.
						!id.includes("audio") &&
						!id.includes("realtime") &&
						!id.includes("codex") &&
						!id.includes("tts") &&
						!id.includes("embedding") &&
						!id.includes("whisper") &&
						!id.includes("sora") &&
						!id.includes("transcribe") &&
						!id.includes("image") &&
						!id.includes("moderation")
				)
				.sort()
				.reverse();
		} catch (e) {
			console.error("Failed to list OpenAI models", e);
			return [];
		}
	}

	async analyse(
		_text: string,
		prompt: string,
		config: ModelConfig
	): Promise<ModelResponse> {
		if (!config.apiKey) {
			throw new Error("OpenAI API key is required");
		}

		console.log(`OpenAI Service (${this.name}): Starting request...`);
		console.log(
			`OpenAI Service (${this.name}): Using model ${config.model || this.defaultModel}`
		);

		const openai = new OpenAI({
			apiKey: config.apiKey,
			dangerouslyAllowBrowser: true,
		});

		try {
			const response = await openai.responses.create({
				model: config.model || this.defaultModel,
				input: prompt,
				text: {
					format: {
						type: "json_schema",
						name: "analysis_response",
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
						strict: true,
					},
				}
			});

			// The responses API returns the content directly in output_text
			// Note: If the API returns a parsed object for json_schema, we might need to adjust,
			// but for now assuming it returns string or we check the type.
			// Based on docs, it seems to return data, but since we're using the standard create,
			// let's assume it matches the new shape which simplifies access.
			// However, without exact type definitions for `responses` + `json_schema`,
			// we'll access output_text (from snippet) or parse if needed.
			// If structured output is fully integrated, response might HAVE the object.
			// But sticking to safe JSON.parse of the text output for safety.
			const contentStr = response.output_text;

			if (!contentStr) {
				throw new Error("OpenAI response missing content");
			}

			let result;
			try {
				result = JSON.parse(contentStr);
			} catch (parseError) {
				console.error(
					`OpenAI Service (${this.name}): Failed to parse content as JSON:`,
					parseError
				);
				throw new Error("Response was not valid JSON.");
			}

			// Validate that each highlight has required properties
			const validHighlights = result.highlights.map(
				(highlight: RawHighlight) => {
					// With structured outputs these checks are redundant but safer to keep
					if (!highlight.id || !highlight.labelType || !highlight.text) {
						console.error(
							`OpenAI Service (${this.name}): Invalid highlight format:`,
							highlight
						);
						throw new Error(
							"Highlight missing required properties (id, labelType, text)."
						);
					}
					return {
						id: highlight.id,
						labelType: highlight.labelType,
						text: highlight.text,
						attrs: {
							labelType: highlight.labelType,
							type: highlight.labelType,
						},
					};
				}
			);

			console.log(
				`OpenAI Service (${this.name}): Successfully parsed response`
			);
			return {
				highlights: validHighlights,
				relationships: result.relationships || [],
			};
		} catch (err) {
			console.error(`OpenAI Service (${this.name}): API error:`, err);
			if (err instanceof Error) {
				throw new Error(`OpenAI API error: ${err.message}`);
			}
			throw new Error("Unknown OpenAI API error");
		}
	}

	/**
	 * Special method for getting dynamic questions which doesn't require highlights array
	 * This method is used specifically for dynamic questions generation
	 */
	async generateQuestions(
		_text: string,
		prompt: string,
		config: ModelConfig
	): Promise<string[]> {
		if (!config.apiKey) {
			throw new Error("OpenAI API key is required");
		}

		console.log(
			`OpenAI: Starting question generation using model ${config.model || this.defaultModel}`
		);

		const openai = new OpenAI({
			apiKey: config.apiKey,
			dangerouslyAllowBrowser: true,
		});

		try {
			const response = await openai.responses.create({
				model: config.model || this.defaultModel,
				input: prompt,
				text: {
					format: {
						type: "json_schema",
						
						name: "questions_response",
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
						strict: true,
					}
				},
			});

			const contentStr = response.output_text;
			if (!contentStr) {
				throw new Error("OpenAI response missing content");
			}

			console.log(`OpenAI: Received question generation response`);

			let result;
			try {
				result = JSON.parse(contentStr);
			} catch (_) {
				throw new Error("Response was not valid JSON");
			}

			// Look for questions array in the response
			if (result.questions && Array.isArray(result.questions)) {
				console.log(
					`OpenAI: Found ${result.questions.length} questions in response`
				);
				return result.questions;
			}

			throw new Error("No questions found in the response");
		} catch (err) {
			console.error(
				`OpenAI: Failed to process question generation response`,
				err
			);
			if (err instanceof Error) {
				throw err;
			}
			throw new Error("Failed to process model response for questions");
		}
	}
}
