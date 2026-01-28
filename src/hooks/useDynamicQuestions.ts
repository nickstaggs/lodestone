import { useState, useEffect, useRef, useCallback } from "react";
import type { RemirrorJSON } from "remirror";
import { DynamicQuestionsService } from "../services/dynamicQuestions";
import { DynamicQuestion, LLMModel } from "../db";
import { extractTextFromContent } from "../utils/textUtils";
import { ENV } from "../config/env";
import { useModelContext } from "../context/ModelContext";

// Configuration for dynamic questions feature
const DYNAMIC_QUESTIONS_CONFIG = {
	minCharsBeforeGeneration: 100, // Minimum characters before generating questions
	minTimeBetweenCalls: 30000, // Minimum time between API calls (30 seconds)
	debounceTime: 500, // Debounce time for typing (ms)
};

interface UseDynamicQuestionsProps {
	sessionId: number | null;
	content: RemirrorJSON;
	topic: string;
	selectedModel?: LLMModel;
}

export function useDynamicQuestions({
	sessionId,
	content,
	topic,
	selectedModel,
}: UseDynamicQuestionsProps) {
	const { getModelService } = useModelContext();
	// State for dynamic questions
	const [questions, setQuestions] = useState<DynamicQuestion[]>([]);
	const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
	const [isQuestionsExpanded, setIsQuestionsExpanded] = useState(false);
	// Add state to track when questions need to be reloaded
	const [needsReload, setNeedsReload] = useState(false);
	// State to trigger content comparison after loading last content
	const [lastContentLoaded, setLastContentLoaded] = useState(false);

	// Refs for tracking question generation
	const lastGenerationTime = useRef<number>(0);
	const contentLengthRef = useRef<number>(0);
	const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const hasDefaultQuestionsRef = useRef<boolean>(false);
	const shouldReloadQuestionsRef = useRef<boolean>(false);
	// Add ref to store the last content that triggered question generation
	const lastContentRef = useRef<string>("");

	// Add ref to track if we've loaded the lastProcessedContent
	const hasLoadedLastContentRef = useRef<boolean>(false);

	// Get/set last generation time from localStorage to persist between remounts
	useEffect(() => {
		if (sessionId) {
			// Try to retrieve last generation time from localStorage
			const savedTime = localStorage.getItem(`lastGenerationTime_${sessionId}`);
			if (savedTime) {
				lastGenerationTime.current = parseInt(savedTime, 10);
			}
		}
	}, [sessionId]);

	// Save lastGenerationTime to localStorage when it changes
	useEffect(() => {
		return () => {
			if (sessionId && lastGenerationTime.current > 0) {
				localStorage.setItem(
					`lastGenerationTime_${sessionId}`,
					lastGenerationTime.current.toString()
				);
			}
		};
	}, [sessionId]);

	// Initialize lastContentRef from database when sessionId is available
	useEffect(() => {
		if (sessionId) {
			// Load the last processed content from the database
			(async () => {
				try {
					const savedContent =
						await DynamicQuestionsService.getLastProcessedContent(sessionId);

					if (savedContent) {
						lastContentRef.current = savedContent;
						hasLoadedLastContentRef.current = true;
						// Trigger content comparison now that we have loaded the last content
						setLastContentLoaded((prev) => !prev);
					} else {
						// Even if no content was found, mark as loaded so we can proceed
						hasLoadedLastContentRef.current = true;
						setLastContentLoaded((prev) => !prev);
					}
				} catch (error) {
					console.error("Error loading last processed content:", error);
					// Mark as loaded even in case of error, so the app doesn't get stuck
					hasLoadedLastContentRef.current = true;
					setLastContentLoaded((prev) => !prev);
				}
			})();
		}
	}, [sessionId]);

	// Toggle expand/collapse for questions
	const handleToggleQuestionsExpand = useCallback(() => {
		setIsQuestionsExpanded((prev) => !prev);
	}, []);

	// Load existing questions for this session
	const loadQuestions = useCallback(async (sessionId: number) => {
		try {
			console.log(`Loading questions for session ${sessionId}`);

			// Debug: Log all questions for this session
			await DynamicQuestionsService.logAllSessionQuestions(sessionId);

			// First clean up any duplicate default questions
			await DynamicQuestionsService.cleanupDuplicateDefaultQuestions(sessionId);

			// Get only questions to display (not all questions)
			const displayQuestions =
				await DynamicQuestionsService.getQuestionsForDisplay(sessionId);

			console.log(
				`Loaded ${displayQuestions.length} questions from the database`
			);

			// Only update questions state if we got non-empty results
			// This prevents flickering when the database temporarily returns empty results
			if (displayQuestions.length > 0) {
				setQuestions(displayQuestions);
				// Update ref to track if we have default questions
				hasDefaultQuestionsRef.current = displayQuestions.some(
					(q) => q.isInitialQuestion
				);
			} else {
				// If no questions were found, try adding default questions as a recovery mechanism
				console.log("No questions found, attempting to add default questions");
				const defaultQuestions =
					await DynamicQuestionsService.addDefaultQuestions(sessionId);

				if (defaultQuestions.length > 0) {
					console.log(
						`Added ${defaultQuestions.length} default questions as fallback`
					);
					setQuestions(defaultQuestions);
					hasDefaultQuestionsRef.current = true;
				} else {
					console.warn("Still no questions after recovery attempt");
				}
			}

			// Reset the reload flags since we've just loaded questions
			shouldReloadQuestionsRef.current = false;
			setNeedsReload(false);
		} catch (error) {
			console.error("Error loading questions:", error);
		}
	}, []);

	// Effect to load questions when reload flag is set
	useEffect(() => {
		if ((needsReload || shouldReloadQuestionsRef.current) && sessionId) {
			loadQuestions(sessionId);
		}
	}, [loadQuestions, sessionId, needsReload]);

	// Add default questions when first loading
	useEffect(() => {
		if (
			sessionId &&
			!hasDefaultQuestionsRef.current &&
			questions.length === 0
		) {
			(async () => {
				try {
					// Check if we already have questions first
					const existingQuestions =
						await DynamicQuestionsService.getQuestionsForDisplay(sessionId);

					if (existingQuestions.length === 0) {
						// Add default questions if none exist
						const defaultQuestions =
							await DynamicQuestionsService.addDefaultQuestions(sessionId);
						setQuestions(defaultQuestions);
						hasDefaultQuestionsRef.current = true;
					} else {
						// Use existing questions
						setQuestions(existingQuestions);
						hasDefaultQuestionsRef.current = existingQuestions.some(
							(q) => q.isInitialQuestion
						);
					}
				} catch (error) {
					console.error(
						"Error adding default questions on initial load:",
						error
					);
				}
			})();
		}
	}, [sessionId, questions.length, loadQuestions]);

	// Generate dynamic questions when content changes
	useEffect(() => {
		// Clear any existing debounce timer
		if (debounceTimerRef.current) {
			clearTimeout(debounceTimerRef.current);
		}

		// Only proceed if we have a sessionId
		if (!sessionId) {
			return;
		}

		// Extract text content from the editor
		const textContent = extractTextFromContent(content);

		// If we haven't loaded the last content yet, postpone the check
		if (!hasLoadedLastContentRef.current) {
			return;
		}

		// Skip if content hasn't changed since last generation
		if (
			textContent === lastContentRef.current &&
			lastContentRef.current !== ""
		) {
			return;
		}

		const prevLength = contentLengthRef.current;
		contentLengthRef.current = textContent.length;

		// Don't generate questions if not enough content
		if (
			textContent.length < DYNAMIC_QUESTIONS_CONFIG.minCharsBeforeGeneration
		) {
			return;
		}

		// Check if enough time has passed since last generation
		const now = Date.now();
		const timeSinceLastGeneration = now - lastGenerationTime.current;
		const shouldGenerate =
			timeSinceLastGeneration >= DYNAMIC_QUESTIONS_CONFIG.minTimeBetweenCalls ||
			textContent.length >= prevLength + 100; // Or if 100+ new characters since last check

		if (!shouldGenerate) {
			return;
		}

		// Set a debounce timer to wait for user to stop typing
		debounceTimerRef.current = setTimeout(async () => {
			// Ensure the user has paused typing before generating questions
			try {

				if (!selectedModel) {
					console.warn("No model selected, skipping dynamic questions");
					return;
				}

				setIsLoadingQuestions(true);

				// Get API key from environment based on selected model
				let apiKey: string | undefined;
				if (selectedModel.company === "Anthropic") {
					apiKey = ENV.ANTHROPIC_API_KEY;
				} else {
					apiKey = ENV.OPENAI_API_KEY;
				}

				if (!apiKey) {
					console.error("API key not found for model:", selectedModel.company);
					throw new Error(
						`${selectedModel.company} API key not found in environment variables`
					);
				}

				// Get model service
				const modelService = getModelService(selectedModel);

				// Get previously asked questions to avoid repeating
				const allQuestions = await DynamicQuestionsService.getAllQuestions(
					sessionId
				);
				const previousQuestions = allQuestions.map((q) => q.question);

				// Generate new questions
				console.log(
					"Calling model to generate new questions for session",
					sessionId
				);
				const newQuestions = await DynamicQuestionsService.generateQuestions(
					{
						text: textContent,
						sessionId: sessionId,
						topic: topic,
						apiKey,
						previousQuestions,
					},
					modelService
				);
				console.log("Generated questions:", newQuestions.length);

				// Update the displayed questions
				if (newQuestions.length > 0) {
					// Signal that we need to reload questions on next render
					shouldReloadQuestionsRef.current = true;
					// Also set the state to trigger the effect that loads questions
					setNeedsReload(true);
				}

				// Update the last generation time and content
				lastGenerationTime.current = Date.now();
				lastContentRef.current = textContent;

				// Persist the last processed content to database
				await DynamicQuestionsService.saveLastProcessedContent(
					sessionId,
					textContent
				);
			} catch (error) {
				console.error("Error generating questions:", error);
			} finally {
				setIsLoadingQuestions(false);
			}
		}, DYNAMIC_QUESTIONS_CONFIG.debounceTime);

		// Cleanup function to clear the timer
		return () => {
			if (debounceTimerRef.current) {
				clearTimeout(debounceTimerRef.current);
			}
		};
	}, [content, topic, sessionId, lastContentLoaded]);

	return {
		questions,
		isLoadingQuestions,
		isQuestionsExpanded,
		handleToggleQuestionsExpand,
		loadQuestions,
	};
}
