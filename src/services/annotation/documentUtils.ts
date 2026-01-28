import type { RemirrorJSON } from "remirror";
import type { HighlightWithText } from "../models/types";
import { setHighlight } from "../../utils/highlightMap";

/**
 * Extract text from Remirror JSON format
 */
export function extractTextFromRemirrorJSON(content: any): string {
	if (!content || !content.content) {
		return "";
	}

	return content.content
		.map((paragraph: any) => {
			if (paragraph.content) {
				return paragraph.content
					.map((node: any) => node.text || "")
					.filter(Boolean)
					.join("");
			}
			return "";
		})
		.filter(Boolean)
		.join("\n");
}

/**
 * Creates a Remirror document with marks applied for annotations
 * @param originalContent The original Remirror JSON content
 * @param annotations The annotations to apply as marks
 * @returns A new Remirror JSON document with the annotations applied as marks
 */

// Add a helper function to find highlight by ID with full annotation info
function findAnnotationById(
	annotations: HighlightWithText[],
	id: string
): HighlightWithText | undefined {
	return annotations.find((annotation) => annotation.id === id);
}

export function createDocumentWithMarks(
	originalContent: RemirrorJSON,
	annotations: HighlightWithText[]
): RemirrorJSON {
	console.log(
		`🔍 [documentUtils] Creating document with ${annotations.length} highlights`
	);

	if (!annotations || annotations.length === 0) {
		console.log(
			`ℹ️ [documentUtils] No annotations provided, returning original content`
		);
		return { ...originalContent };
	}

	annotations.forEach((annotation) => {
		// Ensure every annotation's label type is in the highlight map
		if (annotation.id && annotation.labelType) {
			setHighlight(annotation.id, annotation.labelType);
		}
	});

	// Deep clone the original content to avoid mutation
	const newContent = JSON.parse(
		JSON.stringify(originalContent)
	) as RemirrorJSON;

	// Group annotations by paragraph to process them all at once
	// for each paragraph, rather than one by one
	const annotationsByParagraph = new Map<number, HighlightWithText[]>();

	// First pass: identify which paragraph each annotation belongs to
	if (newContent.content) {
		newContent.content.forEach((paragraph, paragraphIndex) => {
			if (paragraph.type !== "paragraph") return;

			// Extract full paragraph text
			const paragraphText =
				paragraph.content?.map((node) => node.text || "").join("") || "";

			// Check each annotation
			for (const annotation of annotations) {
				if (!annotation.text) continue;

				// If this annotation text is in this paragraph or we can find an existing highlight with the same ID
				const paragraphContainsText = paragraphText.includes(annotation.text);

				// Check for existing marks with this ID to handle text updates
				let hasExistingMark = false;
				if (paragraph.content) {
					for (const node of paragraph.content) {
						if (node.marks) {
							for (const mark of node.marks) {
								if (
									typeof mark === "object" &&
									mark.attrs &&
									mark.attrs.id === annotation.id
								) {
									hasExistingMark = true;
									break;
								}
							}
						}
						if (hasExistingMark) break;
					}
				}

				if (paragraphContainsText || hasExistingMark) {
					// Add to map
					if (!annotationsByParagraph.has(paragraphIndex)) {
						annotationsByParagraph.set(paragraphIndex, []);
					}
					annotationsByParagraph.get(paragraphIndex)?.push(annotation);
				}
			}
		});
	}

	// Log annotation distribution for debugging
	console.log(
		`📊 [documentUtils] Annotations distributed across ${annotationsByParagraph.size} paragraphs`
	);

	// Second pass: process annotations paragraph by paragraph
	annotationsByParagraph.forEach((paragraphAnnotations, paragraphIndex) => {
		const paragraph = newContent.content?.[paragraphIndex];
		if (!paragraph || paragraph.type !== "paragraph" || !paragraph.content)
			return;

		// Skip if no annotations for this paragraph
		if (paragraphAnnotations.length === 0) return;

		// Extract full paragraph text
		const paragraphText = paragraph.content
			.map((node) => node.text || "")
			.join("");

		// Collect all text segments and their highlights
		// This will help us rebuild the paragraph with all highlights intact
		interface TextSegment {
			text: string;
			highlights: Array<{
				id: string;
				labelType: string;
			}>;
			startPos: number;
		}

		// Start with the entire paragraph as one segment
		const segments: TextSegment[] = [
			{
				text: paragraphText,
				highlights: [],
				startPos: 0,
			},
		];

		// Extract existing highlights in this paragraph
		const existingHighlights: Array<{
			id: string;
			labelType: string;
			text: string;
			startIndex: number;
			endIndex: number;
			originalText?: string; // Track original text for replacement
		}> = [];

		if (paragraph.content) {
			let pos = 0;
			paragraph.content.forEach((node) => {
				if (node.marks && node.text) {
					const entityMarks = node.marks.filter(
						(m) =>
							typeof m === "object" && m.type === "entity-reference" && m.attrs
					);

					entityMarks.forEach((mark) => {
						if (typeof mark === "object" && mark.attrs) {
							const id = mark.attrs.id?.toString() || "";
							const labelType =
								mark.attrs.labelType?.toString() ||
								mark.attrs.type?.toString() ||
								"";

							if (id && labelType) {
								existingHighlights.push({
									id,
									labelType,
									text: node.text || "",
									originalText: node.text || "", // Store the original text
									startIndex: pos,
									endIndex: pos + (node.text?.length || 0),
								});
							}
						}
					});
				}
				pos += node.text?.length || 0;
			});
		}

		// Combine existing and new highlights
		const allHighlights = [...existingHighlights];

		// Add new highlights that aren't duplicates and update text for existing highlights
		paragraphAnnotations.forEach((annotation) => {
			// Find if there's an existing highlight with this ID
			const existingIndex = allHighlights.findIndex(
				(h) => h.id === annotation.id
			);

			if (existingIndex >= 0) {
				// Check if the text has changed
				if (allHighlights[existingIndex].text !== annotation.text) {
					console.log(
						`🔄 [documentUtils] Updating text for highlight ${annotation.id}:`,
						{
							old: allHighlights[existingIndex].text,
							new: annotation.text,
						}
					);

					// Update the existing highlight's text, but keep track of the original for replacement
					allHighlights[existingIndex] = {
						...allHighlights[existingIndex],
						text: annotation.text || "",
					};
				}
			} else {
				// Add new highlight
				const textIndex = paragraphText.indexOf(annotation.text || "");
				if (textIndex >= 0) {
					allHighlights.push({
						id: annotation.id,
						labelType: annotation.labelType,
						text: annotation.text || "",
						startIndex: textIndex,
						endIndex: textIndex + (annotation.text?.length || 0),
					});
				} else {
					console.warn(
						`⚠️ [documentUtils] Could not find text match for highlight ${annotation.id}: "${annotation.text}"`
					);
				}
			}
		});

		// Sort highlights by their position in text
		allHighlights.sort((a, b) => a.startIndex - b.startIndex);

		// Split segments at each highlight boundary
		for (const highlight of allHighlights) {
			// Find the segment this highlight belongs to
			let segmentIndex = -1;
			for (let i = 0; i < segments.length; i++) {
				const segment = segments[i];
				const highlightRelativeStart = highlight.startIndex - segment.startPos;
				const highlightRelativeEnd = highlight.endIndex - segment.startPos;

				// If this highlight is in this segment
				if (
					highlightRelativeStart >= 0 &&
					highlightRelativeStart < segment.text.length
				) {
					segmentIndex = i;

					// Split the segment if needed
					const newSegments: TextSegment[] = [];

					// Text before highlight
					if (highlightRelativeStart > 0) {
						newSegments.push({
							text: segment.text.substring(0, highlightRelativeStart),
							highlights: [...segment.highlights],
							startPos: segment.startPos,
						});
					}

					// Highlighted text - use the updated annotation text, not original text
					newSegments.push({
						text: highlight.text,
						highlights: [
							...segment.highlights,
							{
								id: highlight.id,
								labelType: highlight.labelType,
							},
						],
						startPos: segment.startPos + highlightRelativeStart,
					});

					// Text after highlight
					if (highlightRelativeEnd < segment.text.length) {
						newSegments.push({
							text: segment.text.substring(highlightRelativeEnd),
							highlights: [...segment.highlights],
							startPos: segment.startPos + highlightRelativeEnd,
						});
					}

					// Replace the segment with our new segments
					segments.splice(segmentIndex, 1, ...newSegments);
					break;
				}
			}

			if (segmentIndex === -1) {
				// If we couldn't find a segment but we know this is an existing highlight with updated text
				// Look for it by ID in the source annotations
				const annotation = findAnnotationById(annotations, highlight.id);
				if (annotation) {
					console.log(
						`🔍 [documentUtils] Finding alternative placement for highlight ${highlight.id}`
					);

					// Try to find all segments with highlights from the same ID
					for (let i = 0; i < segments.length; i++) {
						const segment = segments[i];
						const hasMatchingHighlight = segment.highlights.some(
							(h) => h.id === highlight.id
						);

						if (hasMatchingHighlight) {
							// Replace this segment with the updated text
							const updatedSegment: TextSegment = {
								...segment,
								text: annotation.text || "",
							};

							segments[i] = updatedSegment;
							console.log(
								`✅ [documentUtils] Successfully placed highlight ${highlight.id} by ID match`
							);
							break;
						}
					}
				} else {
					console.warn(
						`[Debug] Could not find segment for highlight ${highlight.id}`
					);
				}
			}
		}

		// Create new paragraph content from segments
		const newParagraphContent: Array<{
			type: string;
			text: string;
			marks?: Array<{
				type: string;
				attrs: {
					id: string;
					labelType?: string;
					type?: string;
				};
			}>;
		}> = segments.map((segment) => {
			const node: {
				type: string;
				text: string;
				marks?: Array<{
					type: string;
					attrs: {
						id: string;
						labelType?: string;
						type?: string;
					};
				}>;
			} = {
				type: "text",
				text: segment.text,
			};

			// Add marks if this segment has highlights
			if (segment.highlights.length > 0) {
				node.marks = segment.highlights.map((highlight) => ({
					type: "entity-reference",
					attrs: {
						id: highlight.id,
						labelType: highlight.labelType,
						type: highlight.labelType,
					},
				}));
			}

			return node;
		});

		// Replace the paragraph content
		paragraph.content = newParagraphContent;
	});

	return newContent;
}
