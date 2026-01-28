import { useCallback, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { RemirrorJSON } from "remirror";
import { ReactFrameworkOutput } from "@remirror/react";
import { EntityReferenceExtension } from "remirror/extensions";
import { useLiveQuery } from "dexie-react-hooks";
import Editor from "../components/Editor";
import ArgumentGraph from "../components/ArgumentGraph";
import { ClaimsView } from "../components/ClaimsView";
import { SessionManager } from "../utils/sessionManager";
import { detailedPrompt } from "../evals/prompts";
import { useModelContext } from "../context/ModelContext";
import { ENV } from "../config/env";
import type { HighlightWithText } from "../services/models/types";
import type { Relationship } from "../utils/relationshipTypes";

type EditorPageProps = {
	mode: "input" | "analysis";
};

export const EditorPage = ({ mode }: EditorPageProps) => {
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const { getModelService } = useModelContext();
	const [isAnalysing, setIsAnalysing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const editorRef =
		useRef<ReactFrameworkOutput<EntityReferenceExtension>>(null);
	// Track highlight removal operations
	const [pendingHighlightRemoval, setPendingHighlightRemoval] = useState(false);
	// Track multiple document change events with the same ID to detect race conditions
	const currentChangeIds = useRef(new Set<string>());
	// Add state for view mode
	const [viewMode, setViewMode] = useState<"text" | "graph" | "claims">("text");

	const session = useLiveQuery(async () => {
		if (!id) return null;
		const result = await SessionManager.getSession(parseInt(id));

		return result;
	}, [id]);

	const content = useLiveQuery(async () => {
		if (!id) return null;
		const result = await SessionManager.getEffectiveContent(parseInt(id));
		return result;
	}, [id, viewMode]);

	const handleEditorChange = useCallback(
		async (json: RemirrorJSON, options?: { skipExtraction?: boolean }) => {
			if (!id) return;

			// Create a unique ID for this change event to track it
			const changeId = Math.random().toString(36).substring(2, 8);

			// Check if we're already processing a change with this ID (prevent duplicates)
			if (currentChangeIds.current.has(changeId)) {
				return;
			}

			// Mark this change as being processed
			currentChangeIds.current.add(changeId);

			// Clear the change ID after processing (or after timeout)
			const clearChangeId = () => {
				currentChangeIds.current.delete(changeId);
			};
			setTimeout(clearChangeId, 500); // Safety cleanup after 500ms

			// Set pending highlight removal based on options
			if (options?.skipExtraction) {
				setPendingHighlightRemoval(true);

				// Auto-reset after a short timeout
				setTimeout(() => {
					setPendingHighlightRemoval(false);
				}, 500);
			}

			// Check if we got an empty update that might just be a cursor movement
			const isEmpty =
				!json.content ||
				json.content.length === 0 ||
				!json.content[0].content ||
				json.content[0].content.length === 0;

			if (isEmpty) {
				clearChangeId();
				return;
			}

			try {
				if (mode === "input") {
					await SessionManager.updateInputContent(parseInt(id), json);
				} else if (mode === "analysis" && session?.analysedContent) {
					// Get current highlights and relationships
					const currentHighlights = session.analysedContent.highlights || [];
					const currentRelationships =
						session.analysedContent.relationships || [];

					// If we're in a highlight removal state, preserve the content as-is
					if (options?.skipExtraction || pendingHighlightRemoval) {
						await SessionManager.updateAnalysedContent(
							parseInt(id),
							json,
							[], // Empty highlight array to preserve content
							currentRelationships
						);
					} else {
						// Extract highlights from the document
						const extractedHighlights =
							await SessionManager.extractHighlightsFromContentMarks(
								json,
								currentHighlights // Pass existing highlights to preserve positions
							);

						// Create a map of existing highlights by ID for quick lookup
						const existingHighlightsMap = new Map(
							currentHighlights.map((h) => [h.id, h])
						);

						// Check if any highlights were modified
						const hasHighlightModifications = extractedHighlights.some(
							(highlight) => {
								const existing = existingHighlightsMap.get(highlight.id);
								return existing && existing.text !== highlight.text;
							}
						);

						if (hasHighlightModifications) {
							// If highlights were modified, update both content and highlights
							await SessionManager.updateAnalysedContent(
								parseInt(id),
								json,
								extractedHighlights,
								currentRelationships
							);
						} else {
							// If no highlight modifications, just update the content
							await SessionManager.updateAnalysedContent(
								parseInt(id),
								json,
								currentHighlights,
								currentRelationships
							);
						}
					}
				}
			} catch (error) {
				console.error(`Error in handleEditorChange: ${error}`);
				setError(
					error instanceof Error ? error.message : "Failed to update content"
				);
			} finally {
				clearChangeId();
			}
		},
		[id, mode, session, pendingHighlightRemoval, currentChangeIds]
	);

	const handleAnalyse = async () => {
		if (!id || !session || !content) return;

		if (!session.selectedModel) {
			setError("Please select a model before analysing");
			return;
		}

		setIsAnalysing(true);
		setError(null);

		try {
			// Resolve API key
			let apiKey: string | undefined;
			if (session.selectedModel.company === "Anthropic") {
				apiKey = ENV.ANTHROPIC_API_KEY;
			} else {
				apiKey = ENV.OPENAI_API_KEY;
			}

			if (!apiKey) {
				throw new Error(
					`API key not found for ${session.selectedModel.company}. Please check your .env file.`
				);
			}

			// Get the service
			const service = getModelService(session.selectedModel);

			// Extract text content from the editor
			const textContent =
				content.content?.content
					?.map((paragraph) =>
						paragraph.content
							?.map((node) => node.text)
							.filter(Boolean)
							.join("")
					)
					.filter(Boolean)
					.join("\n") || "";

			// Prepare the prompt by replacing the text placeholder
			const prompt = detailedPrompt.template.replace("{{text}}", textContent);

			// Send to model service with API key
			const analysis = await service.analyse(textContent, prompt, { apiKey });

			// Save the analysis results
			await SessionManager.saveAnalysis(
				parseInt(id),
				session.selectedModel.model,
				detailedPrompt.id,
				content.content,
				analysis.highlights,
				analysis.relationships
			);

			// Navigate to analysis view
			navigate(`/analysis/${id}`);
		} catch (error) {
			setError(error instanceof Error ? error.message : "Unknown error");
		} finally {
			setIsAnalysing(false);
		}
	};

	// New handler for updates from the graph view
	const handleGraphHighlightsChange = useCallback(
		async (updatedHighlights: HighlightWithText[]) => {
			if (!id || !session?.analysedContent) return;

			try {
				// Get current content
				const currentContent = session.analysedContent.content;
				const currentRelationships =
					session.analysedContent.relationships || [];

				const { createDocumentWithMarks } = await import(
					"../services/annotation/documentUtils"
				);
				const updatedContent = createDocumentWithMarks(
					currentContent,
					updatedHighlights
				);

				// Update in the database
				await SessionManager.updateAnalysedContent(
					parseInt(id),
					updatedContent,
					updatedHighlights,
					currentRelationships
				);
			} catch (error) {
				console.error(
					"❌ [EditorPage] Error updating highlights from graph:",
					error
				);
				setError(
					error instanceof Error
						? error.message
						: "Failed to update highlights from graph view"
				);
			}
		},
		[id, session]
	);

	const handleGraphRelationshipsChange = useCallback(
		async (updatedRelationships: Relationship[]) => {
			if (!id || !session?.analysedContent) return;

			try {
				// Get current content and highlights
				const currentContent = session.analysedContent.content;
				const currentHighlights = session.analysedContent.highlights || [];

				// Update content with current highlights to ensure consistency
				const { createDocumentWithMarks } = await import(
					"../services/annotation/documentUtils"
				);
				const updatedContent = createDocumentWithMarks(
					currentContent,
					currentHighlights
				);

				// Update in the database
				await SessionManager.updateAnalysedContent(
					parseInt(id),
					updatedContent,
					currentHighlights,
					updatedRelationships
				);
			} catch (error) {
				console.error("Error updating relationships from graph:", error);
				setError(
					error instanceof Error
						? error.message
						: "Failed to update relationships from graph view"
				);
			}
		},
		[id, session]
	);

	// New handler for updates from the claims view
	const handleClaimsHighlightsChange = useCallback(
		async (updatedHighlights: HighlightWithText[]) => {
			if (!id || !session?.analysedContent) return;

			try {
				// Get current content and relationships
				const currentContent = session.analysedContent.content;
				const currentRelationships =
					session.analysedContent.relationships || [];

				const { createDocumentWithMarks } = await import(
					"../services/annotation/documentUtils"
				);
				const updatedContent = createDocumentWithMarks(
					currentContent,
					updatedHighlights
				);

				await SessionManager.updateAnalysedContent(
					parseInt(id),
					updatedContent,
					updatedHighlights,
					currentRelationships
				);
			} catch (error) {
				console.error(
					`❌ [EditorPage] Error updating highlights from claims:`,
					error
				);
				setError(
					error instanceof Error
						? error.message
						: "Failed to update highlights from claims view"
				);
			}
		},
		[id, session]
	);

	if (!session || !content) {
		return (
			<div className="flex items-center justify-center h-screen">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
				<span className="ml-2">Loading session...</span>
			</div>
		);
	}

	return (
		<div className="p-4 mx-auto mb-32">
			<div className="flex flex-col gap-4 mb-4">
				<div className="flex justify-between items-center">
					<h1 className="text-2xl font-serif text-center mx-auto">
						{session.title}
					</h1>
					<button
						onClick={() => navigate(`/session/${id}/model`)}
						className="text-sm text-gray-500 hover:text-black mr-4 px-3 py-1 rounded hover:bg-gray-100 transition-colors"
					>
						{session.selectedModel ? (
							<span className="flex flex-col items-end leading-tight">
								<span className="text-xs uppercase tracking-wider font-semibold opacity-70">
									Model
								</span>
								<span>{session.selectedModel.model}</span>
							</span>
						) : (
							"Select Model"
						)}
					</button>
					{mode === "input" && (
						<button
							onClick={handleAnalyse}
							disabled={isAnalysing}
							className="px-4 py-2 bg-zinc-700 text-white rounded hover:bg-zinc-800 disabled:opacity-50 flex items-center gap-2"
						>
							{isAnalysing && (
								<div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
							)}
							{isAnalysing ? "Analysing..." : "Analyse Text"}
						</button>
					)}
				</div>

				{error && (
					<div
						className="bg-red-50 border border-red-400 text-red-700 px-4 py-3 rounded relative"
						role="alert"
					>
						<strong className="font-bold">Error: </strong>
						<span className="block sm:inline">{error}</span>
						<button
							className="absolute top-0 bottom-0 right-0 px-4 py-3"
							onClick={() => setError(null)}
						>
							<span className="sr-only">Dismiss</span>
							<svg
								className="fill-current h-6 w-6 text-red-500"
								role="button"
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 20 20"
							>
								<title>Close</title>
								<path d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.029a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-3.031a1.2 1.2 0 1 1 1.697 1.697l-2.758 3.152 2.758 3.15a1.2 1.2 0 0 1 0 1.698z" />
							</svg>
						</button>
					</div>
				)}

				{/* Add view toggle when in analysis mode */}
				{mode === "analysis" && (
					<div className="flex justify-center">
						<div className="inline-flex rounded-md shadow-sm" role="group">
							<button
								type="button"
								className={`px-4 py-2 text-sm font-medium ${
									viewMode === "text"
										? "bg-zinc-700 text-white"
										: "bg-white text-zinc-700 hover:bg-zinc-100"
								} rounded-l-lg border border-zinc-200`}
								onClick={() => {
									setViewMode("text");
								}}
							>
								Full Text
							</button>
							<button
								type="button"
								className={`px-4 py-2 text-sm font-medium ${
									viewMode === "graph"
										? "bg-zinc-700 text-white"
										: "bg-white text-zinc-700 hover:bg-zinc-100"
								} border-t border-b border-zinc-200`}
								onClick={() => {
									setViewMode("graph");
								}}
							>
								Canvas
							</button>
							<button
								type="button"
								className={`px-4 py-2 text-sm font-medium ${
									viewMode === "claims"
										? "bg-zinc-700 text-white"
										: "bg-white text-zinc-700 hover:bg-zinc-100"
								} rounded-r-lg border border-zinc-200`}
								onClick={() => {
									setViewMode("claims");
								}}
							>
								Claims
							</button>
						</div>
					</div>
				)}
			</div>

			<div className="remirror-theme">
				<div className={viewMode === "graph" ? "w-full" : "max-w-4xl mx-auto"}>
					{/* Conditionally render Editor, ArgumentGraph, or ClaimsView based on viewMode */}
					{viewMode === "text" || mode === "input" ? (
						<Editor
							key={`editor-${viewMode}-${content?.highlights?.length || 0}`}
							ref={editorRef}
							initialContent={content.content}
							showHighlightButtons={mode === "analysis"}
							renderSidebar={mode === "analysis"}
							highlights={content.highlights || []}
							relationships={content.relationships || []}
							onChangeJSON={handleEditorChange}
						/>
					) : viewMode === "graph" ? (
						<ArgumentGraph
							highlights={content.highlights || []}
							relationships={content.relationships || []}
							onHighlightsChange={handleGraphHighlightsChange}
							onRelationshipsChange={handleGraphRelationshipsChange}
						/>
					) : (
						<ClaimsView
							highlights={content.highlights || []}
							relationships={content.relationships || []}
							onHighlightsChange={handleClaimsHighlightsChange}
							onRelationshipsChange={handleGraphRelationshipsChange}
							sessionId={parseInt(id || "0")}
						/>
					)}

					{/* Debug Logs Section */}
					<div className="mt-8 border border-gray-200 rounded-md">
						<details className="group">
							<summary className="flex justify-between items-center font-medium cursor-pointer p-4  rounded-md">
								<span className="text-gray-700 font-mono text-sm">
									Debug Logs
								</span>
								<span className="transition group-open:rotate-180">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										fill="none"
										viewBox="0 0 24 24"
										strokeWidth={1.5}
										stroke="currentColor"
										className="w-5 h-5"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											d="M19.5 8.25l-7.5 7.5-7.5-7.5"
										/>
									</svg>
								</span>
							</summary>
							<pre className="p-4 rounded-md max-w-full overflow-auto mb-4 text-sm">
								Highlights:
								<br />
								{JSON.stringify(content.highlights || [], null, 2)}
								<br />
								<br />
								Relationships:
								<br />
								{JSON.stringify(content.relationships || [], null, 2)}
							</pre>
						</details>
					</div>
				</div>
			</div>
		</div>
	);
};
