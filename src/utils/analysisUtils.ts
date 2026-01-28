import type { RemirrorJSON } from "remirror";
import { SessionManager } from "./sessionManager";
import type { ModelService } from "../services/models/types";
import { detailedPrompt } from "../evals/prompts";
import { extractTextFromContent } from "./textUtils";

interface AnalysisOptions {
	sessionId: number;
	content: RemirrorJSON;
	promptId?: string;
	isDirty: boolean;
	saveChanges: () => Promise<void>;
	modelService: ModelService;
	apiKey: string;
}

/**
 * Performs the analysis of text content using the specified model
 * and saves the results to the database
 */
export async function performAnalysis({
	sessionId,
	content,
	promptId = detailedPrompt.id,
	isDirty,
	saveChanges,
	modelService,
	apiKey,
}: AnalysisOptions): Promise<{ success: boolean; error?: string }> {
	try {
		// First save any pending changes
		if (isDirty) {
			await saveChanges();
		}

		// Get session to retrieve title or verify existence
		const session = await SessionManager.getSession(sessionId);
		if (!session) throw new Error("Session not found");

		// Extract text content from the editor
		const textContent = extractTextFromContent(content);

		// Prepare the prompt by replacing the text placeholder
		const prompt = detailedPrompt.template.replace("{{text}}", textContent);

		// Send to model service with API key
		// We trust the modelService has the correct model configured
		const analysis = await modelService.analyse(textContent, prompt, {
			apiKey,
			// model: session.selectedModel?.model, // Optional if service has it
		});

		// Save the analysis results
		await SessionManager.saveAnalysis(
			sessionId,
			modelService.name, // Use service name as model string
			promptId,
			content,
			analysis.highlights,
			analysis.relationships
		);

		return { success: true };
	} catch (error) {
		console.error("Analysis error:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : "Analysis failed",
		};
	}
}
