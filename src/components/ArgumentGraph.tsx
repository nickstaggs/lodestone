import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactFlow, {
	Node,
	Edge,
	Position,
	useNodesState,
	useEdgesState,
	ReactFlowInstance,
	Handle,
	NodeChange,
	NodePositionChange,
	Panel,
	ConnectionMode,
	addEdge,
	Connection,
	XYPosition,
	NodeMouseHandler,
	Background,
	Controls,
	MarkerType,
	ConnectionLineType,
} from "reactflow";
import "reactflow/dist/style.css";

import type { HighlightWithText } from "../services/models/types";
import type { Relationship } from "../utils/relationshipTypes";
import { LABEL_CONFIGS } from "../utils/constants";

// Define node data type
interface NodeData {
	label: string;
	labelType: string;
	color: string;
}

// Helper function to save positions to localStorage
const savePositionsToLocalStorage = (
	sessionId: string | undefined,
	nodes: Array<{ id: string; position?: XYPosition }>
) => {
	if (!sessionId) return;

	try {
		const positionsMap: Record<string, XYPosition> = {};

		// Collect all positions
		nodes.forEach((node) => {
			if (node.position) {
				positionsMap[node.id] = node.position;
			}
		});

		if (Object.keys(positionsMap).length > 0) {
			// Save to localStorage
			localStorage.setItem(
				`graph-positions-${sessionId}`,
				JSON.stringify(positionsMap)
			);
		}
	} catch (e) {
		console.error("Error saving positions to localStorage:", e);
	}
};

// Define the props interface for the component
interface ArgumentGraphProps {
	highlights: HighlightWithText[];
	relationships: Relationship[];
	onHighlightsChange: (highlights: HighlightWithText[]) => void;
	onRelationshipsChange: (relationships: Relationship[]) => void;
}

// Helper to get a default position for nodes without position data
const getDefaultPosition = (highlight: HighlightWithText, index: number) => {
	// Get the highlight type to group similar types together
	const labelType = highlight.labelType;

	// Find the index of this label type in LABEL_CONFIGS
	const typeIndex = LABEL_CONFIGS.findIndex(
		(config) => config.id === labelType
	);
	const typeMultiplier = typeIndex >= 0 ? typeIndex : 0;

	// Create a grid-like layout with more space between nodes
	const columnWidth = 350; // Increased from 300
	const rowHeight = 150; // Increased from 100
	const itemsPerColumn = 4; // Reduced from 5 to create more vertical space

	// Create a slight offset for each item to avoid perfect alignment
	const offsetX = (index % 3) * 20;
	const offsetY = (index % 2) * 15;

	const column = Math.floor(typeMultiplier / 2);
	const indexInType = index % itemsPerColumn;

	return {
		x: 100 + column * columnWidth + offsetX,
		y: 100 + indexInType * rowHeight + offsetY,
	};
};

// Custom node with multiple connection handles
const CustomNode = ({ data }: { data: NodeData }) => {
	return (
		<div
			className="px-2 pt-2 pb-1 rounded-md shadow border border-gray-200 bg-white flex flex-col overflow-hidden relative"
			style={{ maxWidth: "350px", minWidth: "150px" }}
		>
			<div className="flex items-center space-x-2 mb-1">
				<div
					className="rounded-full w-4 h-4 flex-shrink-0"
					style={{ backgroundColor: data.color }}
				></div>
				<div className="text-xs text-gray-600 font-medium">
					{data.labelType}
				</div>
			</div>
			<div className="pl-1 text-gray-800 text-sm font-normal">{data.label}</div>

			{/* All four handles available - only the correct ones will be used based on sourcePosition/targetPosition */}
			<Handle
				type="target"
				position={Position.Left}
				style={{
					background: "#555",
					width: "8px",
					height: "8px",
					borderRadius: "50%",
				}}
			/>
			<Handle
				type="source"
				position={Position.Right}
				style={{
					background: "#555",
					width: "8px",
					height: "8px",
					borderRadius: "50%",
				}}
			/>
			<Handle
				type="target"
				position={Position.Top}
				style={{
					background: "#555",
					width: "8px",
					height: "8px",
					borderRadius: "50%",
				}}
			/>
			<Handle
				type="source"
				position={Position.Bottom}
				style={{
					background: "#555",
					width: "8px",
					height: "8px",
					borderRadius: "50%",
				}}
			/>
		</div>
	);
};

// Node types mapping
const nodeTypes = {
	customNode: CustomNode,
};

// Improved function to detect node overlaps - with reduced padding
const nodesOverlap = (node1: Node, node2: Node, padding = 15) => {
	// Estimate node dimensions based on text length
	const getNodeWidth = (node: Node) => {
		// Get the text length if available
		const textLength = node.data?.label?.length || 10;

		// Base width: ~8px per character, min 100px, max 350px
		return Math.min(Math.max(textLength * 8, 100), 350);
	};

	const getNodeHeight = (node: Node) => {
		// Base height for single line nodes
		const baseHeight = 40;

		// Get the text length if available
		const textLength = node.data?.label?.length || 0;

		// Roughly estimate additional height for text wrapping every ~50 chars
		const extraLines = Math.floor(textLength / 50);
		return baseHeight + extraLines * 20;
	};

	const width1 = getNodeWidth(node1);
	const height1 = getNodeHeight(node1);
	const width2 = getNodeWidth(node2);
	const height2 = getNodeHeight(node2);

	// Calculate the bounds of each node
	const node1Left = node1.position.x;
	const node1Right = node1.position.x + width1;
	const node1Top = node1.position.y;
	const node1Bottom = node1.position.y + height1;

	const node2Left = node2.position.x;
	const node2Right = node2.position.x + width2;
	const node2Top = node2.position.y;
	const node2Bottom = node2.position.y + height2;

	// Check for overlapping with padding
	return !(
		node1Right + padding < node2Left ||
		node1Left > node2Right + padding ||
		node1Bottom + padding < node2Top ||
		node1Top > node2Bottom + padding
	);
};

// Improved force-directed layout algorithm with milder repulsion
const applyForceDirectedLayout = (nodes: Node[]): Node[] => {
	if (nodes.length <= 1) return nodes;

	const newNodes = [...nodes];

	// Fewer iterations for less aggressive adjustments
	const maxIterations = 30;

	for (let iteration = 0; iteration < maxIterations; iteration++) {
		let movementMade = false;

		// Process nodes in pairs
		for (let i = 0; i < newNodes.length; i++) {
			for (let j = i + 1; j < newNodes.length; j++) {
				const node1 = newNodes[i];
				const node2 = newNodes[j];

				if (nodesOverlap(node1, node2)) {
					movementMade = true;

					// Direction vector from node1 to node2
					const dx = node2.position.x - node1.position.x;
					const dy = node2.position.y - node1.position.y;

					// Normalize and scale
					const distance = Math.sqrt(dx * dx + dy * dy) || 1;
					const unitDx = dx / distance;
					const unitDy = dy / distance;

					// Milder repulsion force - reduced from 30 to 15
					const repulsionForce = 15;

					// Apply forces in opposite directions
					newNodes[i] = {
						...newNodes[i],
						position: {
							x: newNodes[i].position.x - unitDx * repulsionForce,
							y: newNodes[i].position.y - unitDy * repulsionForce,
						},
					};

					newNodes[j] = {
						...newNodes[j],
						position: {
							x: newNodes[j].position.x + unitDx * repulsionForce,
							y: newNodes[j].position.y + unitDy * repulsionForce,
						},
					};
				}
			}
		}

		// If no movements were made, the layout is stable
		if (!movementMade) break;
	}

	return newNodes;
};

// Helper function to get node type weight for left-to-right ordering
const getNodeTypeWeight = (labelType: string): number => {
	// Order node types by common logical flow (claims left, supporting evidence right, etc.)
	const typeWeights: Record<string, number> = {
		claim: 0, // Claims should be leftmost
		counter: 1, // Counter arguments next
		question: 2, // Questions
		evidence: 3, // Evidence to support claims
		assumption: 4, // Assumptions
		implication: 5, // Implications
		cause: 6, // Causes
	};

	return typeWeights[labelType] !== undefined ? typeWeights[labelType] : 99;
};

// Replace the createRelationshipBasedLayout function with this grid-focused version
function createRelationshipBasedLayout(
	nodes: Node<NodeData>[],
	relationships: Relationship[]
): Node<NodeData>[] {
	if (nodes.length === 0) return [];

	// Group nodes by their type
	const nodesByType: Record<string, Node<NodeData>[]> = {};

	nodes.forEach((node) => {
		const type = node.data.labelType;
		if (!nodesByType[type]) {
			nodesByType[type] = [];
		}
		nodesByType[type].push(node);
	});

	// Layout constants
	const COLUMN_WIDTH = 350; // Width of each column
	const ROW_HEIGHT = 100; // Height of each row
	const LEFT_MARGIN = 50; // Starting X position
	const TOP_MARGIN = 50; // Starting Y position
	const COLUMN_GAP = 80; // Space between columns

	// Sort node types in a logical order (claims first, evidence second, etc.)
	const sortedTypes = Object.keys(nodesByType).sort((a, b) => {
		return getNodeTypeWeight(a) - getNodeTypeWeight(b);
	});

	// Build a relationship map to track connections
	const relationshipMap: Record<string, string[]> = {};

	// Initialize the relationship map
	nodes.forEach((node) => {
		relationshipMap[node.id] = [];
	});

	// Populate the relationship map
	relationships.forEach((relation) => {
		const sourceId = relation.sourceHighlightId;
		const targetId = relation.targetHighlightId;

		if (relationshipMap[sourceId]) {
			relationshipMap[sourceId].push(targetId);
		}
		if (relationshipMap[targetId]) {
			relationshipMap[targetId].push(sourceId);
		}
	});

	// Sort nodes within each type by connection count (most connected first)
	for (const type of sortedTypes) {
		nodesByType[type].sort((a, b) => {
			const aConnections = relationshipMap[a.id]?.length || 0;
			const bConnections = relationshipMap[b.id]?.length || 0;
			return bConnections - aConnections;
		});
	}

	// Create a grid for node placement
	const grid: Record<string, Record<number, boolean>> = {};
	const newNodes = [...nodes];
	const nodePositions: Record<string, { column: number; row: number }> = {};

	// Initialize grid
	sortedTypes.forEach((_, columnIndex) => {
		grid[columnIndex] = {};
	});

	// First pass: place nodes in their type columns
	let currentColumn = 0;

	for (const type of sortedTypes) {
		const nodesOfType = nodesByType[type];
		if (nodesOfType.length === 0) continue;

		// Place each node in the current column
		let currentRow = 0;

		nodesOfType.forEach((node) => {
			// Find available row in this column
			while (grid[currentColumn][currentRow]) {
				currentRow++;
			}

			// Mark this grid position as occupied
			grid[currentColumn][currentRow] = true;

			// Store column and row for this node
			nodePositions[node.id] = { column: currentColumn, row: currentRow };

			// Move to next row
			currentRow++;
		});

		// Move to next column
		currentColumn++;
	}

	// Second pass: try to align related nodes in adjacent rows when possible
	const processedNodes = new Set<string>();
	const nodeRowAdjustments: Record<string, number> = {};

	relationships.forEach((relation) => {
		const sourceId = relation.sourceHighlightId;
		const targetId = relation.targetHighlightId;

		if (
			nodePositions[sourceId] &&
			nodePositions[targetId] &&
			Math.abs(
				nodePositions[sourceId].column - nodePositions[targetId].column
			) === 1
		) {
			// Try to align these nodes horizontally if they're in adjacent columns
			const sourcePos = nodePositions[sourceId];
			const targetPos = nodePositions[targetId];

			// If one node hasn't been adjusted yet, try to align it with the other
			if (!processedNodes.has(sourceId) && !processedNodes.has(targetId)) {
				// Choose the lower row value to ensure nodes aren't too far down
				const targetRow = Math.min(sourcePos.row, targetPos.row);

				// Check if target row is available in both columns
				if (!grid[sourcePos.column][targetRow] || sourcePos.row === targetRow) {
					if (
						!grid[targetPos.column][targetRow] ||
						targetPos.row === targetRow
					) {
						// Clear current positions
						grid[sourcePos.column][sourcePos.row] = false;
						grid[targetPos.column][targetPos.row] = false;

						// Set new positions
						grid[sourcePos.column][targetRow] = true;
						grid[targetPos.column][targetRow] = true;

						// Update node positions
						nodePositions[sourceId] = { ...sourcePos, row: targetRow };
						nodePositions[targetId] = { ...targetPos, row: targetRow };

						// Mark these nodes as processed
						processedNodes.add(sourceId);
						processedNodes.add(targetId);

						// Store adjustments for later application
						nodeRowAdjustments[sourceId] = targetRow;
						nodeRowAdjustments[targetId] = targetRow;
					}
				}
			}
		}
	});

	// Apply positions to all nodes
	newNodes.forEach((node, index) => {
		if (nodePositions[node.id]) {
			const { column, row } = nodePositions[node.id];

			// Apply any row adjustments
			const finalRow =
				nodeRowAdjustments[node.id] !== undefined
					? nodeRowAdjustments[node.id]
					: row;

			// Calculate actual X,Y coordinates from grid position
			const x = LEFT_MARGIN + column * (COLUMN_WIDTH + COLUMN_GAP);
			const y = TOP_MARGIN + finalRow * ROW_HEIGHT;

			newNodes[index] = {
				...newNodes[index],
				position: { x, y },
				// Set appropriate source/target positions based on column
				sourcePosition:
					column < sortedTypes.length - 1 ? Position.Right : Position.Bottom,
				targetPosition: column > 0 ? Position.Left : Position.Top,
			};
		}
	});

	// After positioning, set smart edge routing properties
	return assignSmartEdgeRoutingProperties(newNodes, relationships);
}

// Function to calculate edge routing properties after grid layout is applied
function assignSmartEdgeRoutingProperties(
	nodes: Node[],
	relationships: Relationship[]
): Node[] {
	const updatedNodes = [...nodes];

	// For each node, analyze its connections to determine optimal handle positions
	updatedNodes.forEach((node, index) => {
		// Find all relationships where this node is a source
		const outgoingRelationships = relationships.filter(
			(rel) => rel.sourceHighlightId === node.id
		);

		// Find all relationships where this node is a target
		const incomingRelationships = relationships.filter(
			(rel) => rel.targetHighlightId === node.id
		);

		// Default positions
		let sourcePosition = Position.Right;
		let targetPosition = Position.Left;

		// Analyze outgoing connections
		if (outgoingRelationships.length > 0) {
			const targetNodes = outgoingRelationships
				.map((rel) => nodes.find((n) => n.id === rel.targetHighlightId))
				.filter(Boolean);

			if (targetNodes.length > 0) {
				// Count nodes in different directions
				const rightTargets = targetNodes.filter(
					(t) => t && t.position.x > node.position.x
				).length;

				const leftTargets = targetNodes.filter(
					(t) => t && t.position.x < node.position.x
				).length;

				const bottomTargets = targetNodes.filter(
					(t) =>
						t &&
						t.position.y > node.position.y &&
						Math.abs(t.position.x - node.position.x) < 150
				).length;

				// Choose the direction with most connections
				if (rightTargets >= leftTargets && rightTargets >= bottomTargets) {
					sourcePosition = Position.Right;
				} else if (
					leftTargets >= rightTargets &&
					leftTargets >= bottomTargets
				) {
					sourcePosition = Position.Left;
				} else if (bottomTargets > 0) {
					sourcePosition = Position.Bottom;
				}
			}
		}

		// Analyze incoming connections
		if (incomingRelationships.length > 0) {
			const sourceNodes = incomingRelationships
				.map((rel) => nodes.find((n) => n.id === rel.sourceHighlightId))
				.filter(Boolean);

			if (sourceNodes.length > 0) {
				// Count nodes in different directions
				const rightSources = sourceNodes.filter(
					(s) => s && s.position.x > node.position.x
				).length;

				const leftSources = sourceNodes.filter(
					(s) => s && s.position.x < node.position.x
				).length;

				const topSources = sourceNodes.filter(
					(s) =>
						s &&
						s.position.y < node.position.y &&
						Math.abs(s.position.x - node.position.x) < 150
				).length;

				// Choose the direction with most connections
				if (leftSources >= rightSources && leftSources >= topSources) {
					targetPosition = Position.Left;
				} else if (rightSources >= leftSources && rightSources >= topSources) {
					targetPosition = Position.Right;
				} else if (topSources > 0) {
					targetPosition = Position.Top;
				}
			}
		}

		// Update the node with optimal handle positions
		updatedNodes[index] = {
			...updatedNodes[index],
			sourcePosition,
			targetPosition,
		};
	});

	return updatedNodes;
}

// Smarter edge calculation based on node positions
const getSmartEdge = (source: Node, target: Node) => {
	const sourceX = source.position.x;
	const sourceY = source.position.y;
	const targetX = target.position.x;
	const targetY = target.position.y;

	// Calculate which edge routing makes the most sense
	const horizontalDiff = Math.abs(sourceX - targetX);
	const verticalDiff = Math.abs(sourceY - targetY);

	let edgeType = "default"; // bezier by default

	// For nodes that are close to each other vertically, use step edges
	if (verticalDiff < 100 && horizontalDiff > 100) {
		edgeType = "step";
	}
	// For nodes that are very close, use straight edges
	else if (horizontalDiff < 200 && verticalDiff < 100) {
		edgeType = "straight";
	}
	// For nodes with significant vertical difference, use smoothstep
	else if (verticalDiff > 150) {
		edgeType = "smoothstep";
	}

	return {
		id: `e-${source.id}-${target.id}`,
		source: source.id,
		target: target.id,
		type: edgeType,
		animated: false,
		style: { stroke: "#888" },
		markerEnd: {
			type: MarkerType.ArrowClosed,
			width: 20,
			height: 20,
			color: "#888",
		},
	};
};

// Add the edgeTypes definition before the ArgumentGraph component
const edgeTypes = {}; // We don't need custom edge types, but ReactFlow expects this prop

export const ArgumentGraph = ({
	highlights,
	relationships,
	onHighlightsChange,
	onRelationshipsChange,
}: ArgumentGraphProps) => {
	// Initialize nodes and edges states
	const [nodes, setNodes, onNodesChange] = useNodesState([]);
	const [edges, setEdges, onEdgesChange] = useEdgesState([]);
	// Add state to track node being dragged
	const [isDragging, setIsDragging] = useState(false);

	// State for node filtering
	const [activeFilters, setActiveFilters] = useState<Record<string, boolean>>(
		// Initialize all filter types to active (true)
		LABEL_CONFIGS.reduce((acc, config) => ({ ...acc, [config.id]: true }), {})
	);

	// State for node creation form
	const [showNodeForm, setShowNodeForm] = useState(false);
	const [newNodeText, setNewNodeText] = useState("");
	const [newNodeType, setNewNodeType] = useState(LABEL_CONFIGS[0].id);
	const [newNodePosition, setNewNodePosition] = useState({ x: 100, y: 100 });

	// State for node text editing
	const [editingNode, setEditingNode] = useState<{
		id: string;
		text: string;
		labelType: string;
	} | null>(null);
	const [editedText, setEditedText] = useState("");

	// Reference to the ReactFlow instance for viewport operations
	const reactFlowWrapper = useRef<HTMLDivElement>(null);
	const [reactFlowInstance, setReactFlowInstance] =
		useState<ReactFlowInstance | null>(null);

	// Refit view when the nodes change
	useEffect(() => {
		if (reactFlowInstance && nodes.length > 0) {
			// Wait a bit for the layout to settle
			setTimeout(() => {
				reactFlowInstance.fitView({ padding: 0.2 });
			}, 300);
		}
	}, [reactFlowInstance, nodes.length]);

	// Convert highlights to nodes and relationships to edges
	useEffect(() => {
		if (!highlights) return;

		// Try to load saved positions from localStorage
		const sessionId = window.location.pathname.split("/").pop();
		if (sessionId) {
			try {
				const savedPositions = localStorage.getItem(
					`graph-positions-${sessionId}`
				);
				if (savedPositions) {
					const positionsMap = JSON.parse(savedPositions);

					// Apply saved positions to highlights that don't have positions
					highlights.forEach((highlight) => {
						if (!highlight.position && positionsMap[highlight.id]) {
							highlight.position = positionsMap[highlight.id];
						}
					});
				}
			} catch (e) {
				console.error("Error loading positions from localStorage:", e);
			}
		}

		// Map highlights to nodes, applying filters
		const initialNodes: Node<NodeData>[] = highlights
			.filter((highlight) => activeFilters[highlight.labelType])
			.map((highlight, index) => {
				const labelConfig = LABEL_CONFIGS.find(
					(config) => config.id === highlight.labelType
				);

				return {
					id: highlight.id,
					type: "customNode",
					data: {
						label: highlight.text,
						labelType: highlight.labelType,
						color: labelConfig?.color || "#cccccc",
					},
					// Always use stored position if available, otherwise calculate default
					position: highlight.position || getDefaultPosition(highlight, index),
				};
			});

		// Determine which nodes need new positions
		const nodesToPosition = initialNodes.filter((node) => {
			// Find the highlight for this node
			const highlight = highlights.find((h) => h.id === node.id);
			// Position nodes that don't have a saved position yet
			return !highlight?.position;
		});

		let layoutedNodes = [...initialNodes];

		// Only apply relationship layout to nodes without positions
		if (nodesToPosition.length > 0) {
			// Generate positions for unpositioned nodes using relationship layout
			const positionedNodes = createRelationshipBasedLayout(
				initialNodes,
				relationships || []
			);

			// Update positions in the layoutedNodes array
			positionedNodes.forEach((positionedNode) => {
				const nodeIndex = layoutedNodes.findIndex(
					(n) => n.id === positionedNode.id
				);
				if (nodeIndex !== -1) {
					layoutedNodes[nodeIndex] = {
						...layoutedNodes[nodeIndex],
						position: positionedNode.position,
					};
				}
			});

			// Apply force-directed layout to prevent any remaining overlaps
			layoutedNodes = applyForceDirectedLayout(layoutedNodes);

			// Update positions in highlights for nodes that were newly positioned
			const updatedHighlights = [...highlights];

			layoutedNodes.forEach((node) => {
				const index = updatedHighlights.findIndex((h) => h.id === node.id);
				if (index !== -1) {
					// Only update if this node was newly positioned
					const originalHighlight = highlights[index];
					if (!originalHighlight.position) {
						updatedHighlights[index] = {
							...updatedHighlights[index],
							position: node.position as XYPosition,
						};
					}
				}
			});

			// Save the updated positions
			onHighlightsChange(updatedHighlights);
		}

		// Set nodes with their positions
		setNodes(layoutedNodes);

		// Save positions to localStorage, whether they came from auto-layout or database
		savePositionsToLocalStorage(
			window.location.pathname.split("/").pop(),
			layoutedNodes
		);

		// Convert relationships to edges, filtering out relationships to hidden nodes
		if (relationships) {
			const newEdges: Edge[] = relationships
				.filter((relation) => {
					// Find the source and target highlights
					const sourceHighlight = highlights.find(
						(h) => h.id === relation.sourceHighlightId
					);
					const targetHighlight = highlights.find(
						(h) => h.id === relation.targetHighlightId
					);

					// Only include the relationship if both source and target are visible
					return (
						sourceHighlight &&
						targetHighlight &&
						activeFilters[sourceHighlight.labelType] &&
						activeFilters[targetHighlight.labelType]
					);
				})
				.map((relation) => {
					const sourceNode = layoutedNodes.find(
						(node) => node.id === relation.sourceHighlightId
					);
					const targetNode = layoutedNodes.find(
						(node) => node.id === relation.targetHighlightId
					);

					if (sourceNode && targetNode) {
						return getSmartEdge(sourceNode, targetNode);
					}

					// Fallback if nodes not found
					return {
						id: `e-${relation.sourceHighlightId}-${relation.targetHighlightId}`,
						source: relation.sourceHighlightId,
						target: relation.targetHighlightId,
						type: "default",
						animated: false,
						style: { stroke: "#888" },
						markerEnd: {
							type: MarkerType.ArrowClosed,
							width: 20,
							height: 20,
							color: "#888",
						},
					};
				});

			setEdges(newEdges);
		}
	}, [
		highlights,
		relationships,
		setNodes,
		setEdges,
		onHighlightsChange,
		activeFilters,
	]);

	// Update the node change handler to handle dragging
	const handleNodesChange = useCallback(
		(changes: NodeChange[]) => {
			// Apply all changes to update the UI immediately
			onNodesChange(changes);

			// Only process position changes when not actively dragging
			// Position persistence will be handled by onNodeDragStop
			if (isDragging) {
				return;
			}

			// Process position changes (for programmatic position changes)
			const positionChanges = changes.filter(
				(change): change is NodePositionChange =>
					change.type === "position" && change.position !== undefined
			);

			if (positionChanges.length > 0) {
				// Update highlight positions in the database
				const updatedHighlights = [...highlights];

				positionChanges.forEach((change) => {
					const index = updatedHighlights.findIndex((h) => h.id === change.id);
					if (index !== -1 && change.position) {
						updatedHighlights[index] = {
							...updatedHighlights[index],
							position: change.position,
						};
					}
				});

				onHighlightsChange(updatedHighlights);
			}
		},
		[highlights, onNodesChange, onHighlightsChange, isDragging]
	);

	// Handle node drag stop and update positions
	const handleNodeDragStop = useCallback(
		(_: React.MouseEvent, node: Node<NodeData>) => {
			setIsDragging(false);

			// Update highlight positions in the database
			const updatedHighlights = [...highlights];
			const index = updatedHighlights.findIndex((h) => h.id === node.id);

			if (index !== -1 && node.position) {
				updatedHighlights[index] = {
					...updatedHighlights[index],
					position: node.position,
				};

				// Save positions to localStorage using helper function
				savePositionsToLocalStorage(
					window.location.pathname.split("/").pop(),
					updatedHighlights
				);

				// Save the updated positions
				onHighlightsChange(updatedHighlights);
			}
		},
		[highlights, onHighlightsChange]
	);

	// Handle node drag start
	const handleNodeDragStart = useCallback(() => {
		setIsDragging(true);
	}, []);

	// Toggle a filter
	const toggleFilter = useCallback((labelType: string) => {
		setActiveFilters((prev) => ({
			...prev,
			[labelType]: !prev[labelType],
		}));
	}, []);

	// Toggle all filters
	const toggleAllFilters = useCallback((value: boolean) => {
		const newFilters: Record<string, boolean> = {};
		LABEL_CONFIGS.forEach((config) => {
			newFilters[config.id] = value;
		});
		setActiveFilters(newFilters);
	}, []);

	// Handle node double-click to edit text
	const onNodeDoubleClick: NodeMouseHandler = useCallback((_, node) => {
		setEditingNode({
			id: node.id,
			text: node.data.label,
			labelType: node.data.labelType,
		});
		setEditedText(node.data.label);
	}, []);

	// Handle edge creation
	const onConnect = useCallback(
		(connection: Connection) => {
			if (!connection.source || !connection.target) return;

			// Update the edges in the react-flow state
			setEdges((eds) => addEdge(connection, eds));

			// Create a new relationship
			const newRelationship: Relationship = {
				sourceHighlightId: connection.source,
				targetHighlightId: connection.target,
			};

			// Check if this relationship already exists
			const relationshipExists = relationships.some(
				(r) =>
					r.sourceHighlightId === newRelationship.sourceHighlightId &&
					r.targetHighlightId === newRelationship.targetHighlightId
			);

			if (!relationshipExists) {
				// Update relationships in the parent component
				onRelationshipsChange([...relationships, newRelationship]);
			}
		},
		[relationships, onRelationshipsChange, setEdges]
	);

	// Handle edge deletion
	const handleEdgeDelete = useCallback(
		(edgeId: string) => {
			// Extract highlight IDs from the edge ID (format: e-sourceId-targetId)
			const idParts = edgeId.split("-");
			if (idParts.length < 3) return;

			const sourceId = idParts[1];
			const targetId = idParts.slice(2).join("-"); // In case there were hyphens in the IDs

			// Remove the edge from react-flow state
			setEdges((edges) => edges.filter((e) => e.id !== edgeId));

			// Remove the relationship
			const updatedRelationships = relationships.filter(
				(r) =>
					!(
						r.sourceHighlightId === sourceId && r.targetHighlightId === targetId
					)
			);

			onRelationshipsChange(updatedRelationships);
		},
		[relationships, onRelationshipsChange, setEdges]
	);

	// Handle edge click (for deletion)
	const onEdgeClick = useCallback(
		(_: React.MouseEvent, edge: Edge) => {
			if (window.confirm("Do you want to delete this relationship?")) {
				handleEdgeDelete(edge.id);
			}
		},
		[handleEdgeDelete]
	);

	// Handle canvas click to add new node
	const onPaneClick = useCallback(
		(event: React.MouseEvent) => {
			// Only show form if we have a ReactFlow instance to get viewport coordinates
			if (reactFlowInstance && reactFlowWrapper.current) {
				// Get the position in the canvas coordinates
				const reactFlowBounds =
					reactFlowWrapper.current.getBoundingClientRect();
				const position = reactFlowInstance.project({
					x: event.clientX - reactFlowBounds.left,
					y: event.clientY - reactFlowBounds.top,
				});

				// Set the position for the new node
				setNewNodePosition(position);
				setShowNodeForm(true);
			}
		},
		[reactFlowInstance]
	);

	// Create new node and add it to the graph
	const handleAddNode = useCallback(() => {
		if (!newNodeText.trim()) {
			alert("Please enter text for the node");
			return;
		}

		// Create a unique ID for the new node
		const newNodeId = `node-${Date.now()}`;

		// Create the new highlight object
		const newHighlight: HighlightWithText = {
			id: newNodeId,
			labelType: newNodeType,
			text: newNodeText,
			position: newNodePosition,
			createdInGraphView: true,
		};

		// Update highlights in the parent component
		onHighlightsChange([...highlights, newHighlight]);

		// Reset form state
		setNewNodeText("");
		setShowNodeForm(false);
	}, [
		newNodeText,
		newNodeType,
		newNodePosition,
		highlights,
		onHighlightsChange,
	]);

	// Cancel node creation
	const handleCancelNodeCreation = () => {
		setNewNodeText("");
		setShowNodeForm(false);
	};

	// Save edited node text
	const handleSaveNodeEdit = useCallback(() => {
		if (!editingNode) return;

		// Only update if text actually changed
		if (editedText !== editingNode.text) {
			// Update the node in the flow
			const updatedNodes = nodes.map((node) => {
				if (node.id === editingNode.id) {
					return {
						...node,
						data: {
							...node.data,
							label: editedText,
						},
					};
				}
				return node;
			});

			// Update nodes in the flow
			setNodes(updatedNodes);

			// Update the highlight in the parent component
			const updatedHighlights = highlights.map((highlight) => {
				if (highlight.id === editingNode.id) {
					return {
						...highlight,
						text: editedText,
					};
				}
				return highlight;
			});

			// Update highlights in the parent component
			onHighlightsChange(updatedHighlights);
		}

		// Clear editing state
		setEditingNode(null);
		setEditedText("");
	}, [
		editingNode,
		editedText,
		nodes,
		highlights,
		setNodes,
		onHighlightsChange,
	]);

	// Cancel node text editing
	const handleCancelNodeEdit = useCallback(() => {
		setEditingNode(null);
		setEditedText("");
	}, []);

	// After all state and effects are set up, log dragging config for debugging
	useEffect(() => {
		// No need for logging dragging configuration
	}, [nodes]);

	return (
		<div
			style={{
				width: "100%",
				height: "90vh",
				maxHeight: "800px",
			}}
			ref={reactFlowWrapper}
		>
			<ReactFlow
				nodes={nodes}
				edges={edges}
				onNodesChange={handleNodesChange}
				onEdgesChange={onEdgesChange}
				onConnect={onConnect}
				onEdgeClick={onEdgeClick}
				onPaneClick={onPaneClick}
				onNodeDoubleClick={onNodeDoubleClick}
				nodeTypes={nodeTypes}
				fitView
				attributionPosition="bottom-right"
				connectionMode={ConnectionMode.Strict}
				onInit={setReactFlowInstance}
				nodesFocusable={true}
				nodesDraggable={true}
				snapToGrid={true}
				snapGrid={[10, 10]}
				edgeTypes={edgeTypes}
				connectionLineType={ConnectionLineType.SmoothStep}
				defaultEdgeOptions={{
					type: "default",
					style: { stroke: "#888", strokeWidth: 1.5 },
					markerEnd: {
						type: MarkerType.ArrowClosed,
						color: "#888",
					},
				}}
				onNodeDrag={() => handleNodeDragStart()}
				onNodeDragStop={handleNodeDragStop}
			>
				<Panel position="top-left" className="bg-white p-2 rounded shadow">
					<div className="text-sm">
						<div className="font-medium mb-2">Filter by Type:</div>
						<div className="flex flex-col gap-1">
							<div className="flex items-center gap-2 mb-1">
								<button
									className="text-xs py-0.5 px-2 bg-gray-100 hover:bg-gray-200 rounded"
									onClick={() => toggleAllFilters(true)}
								>
									Show All
								</button>
								<button
									className="text-xs py-0.5 px-2 bg-gray-100 hover:bg-gray-200 rounded"
									onClick={() => toggleAllFilters(false)}
								>
									Hide All
								</button>
							</div>

							{LABEL_CONFIGS.map((config) => (
								<div key={config.id} className="flex items-center gap-2">
									<input
										type="checkbox"
										id={`filter-${config.id}`}
										checked={activeFilters[config.id] || false}
										onChange={() => toggleFilter(config.id)}
										className="h-3 w-3"
									/>
									<label
										htmlFor={`filter-${config.id}`}
										className="flex items-center gap-1.5 text-xs cursor-pointer"
									>
										<div
											className="w-2 h-2 rounded-full"
											style={{ backgroundColor: config.color }}
										></div>
										{config.name}
									</label>
								</div>
							))}
						</div>
					</div>
				</Panel>
				<Background />
				<Controls />
			</ReactFlow>

			{/* Node creation form */}
			{showNodeForm && (
				<div className="fixed top-0 left-0 w-full h-full bg-black bg-opacity-50 flex items-center justify-center z-50">
					<div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
						<h3 className="text-lg font-medium mb-4">Add New Node</h3>

						<div className="mb-4">
							<label className="block text-sm font-medium text-gray-700 mb-1">
								Type
							</label>
							<select
								className="w-full px-3 py-2 border border-gray-300 rounded-md"
								value={newNodeType}
								onChange={(e) => setNewNodeType(e.target.value)}
							>
								{LABEL_CONFIGS.map((config) => (
									<option key={config.id} value={config.id}>
										{config.name} - {config.description}
									</option>
								))}
							</select>
						</div>

						<div className="mb-6">
							<label className="block text-sm font-medium text-gray-700 mb-1">
								Text
							</label>
							<textarea
								className="w-full px-3 py-2 border border-gray-300 rounded-md"
								rows={4}
								value={newNodeText}
								onChange={(e) => setNewNodeText(e.target.value)}
								placeholder="Enter the text for this node..."
							/>
						</div>

						<div className="flex justify-end space-x-2">
							<button
								className="px-4 py-2 border border-gray-300 rounded-md text-gray-700"
								onClick={handleCancelNodeCreation}
							>
								Cancel
							</button>
							<button
								className="px-4 py-2 bg-zinc-700 text-white rounded-md hover:bg-zinc-800"
								onClick={handleAddNode}
							>
								Add Node
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Node editing form */}
			{editingNode && (
				<div className="fixed top-0 left-0 w-full h-full bg-black bg-opacity-50 flex items-center justify-center z-50">
					<div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
						<h3 className="text-lg font-medium mb-4">
							Edit{" "}
							{editingNode.labelType.charAt(0).toUpperCase() +
								editingNode.labelType.slice(1)}
						</h3>

						<div className="mb-6">
							<label className="block text-sm font-medium text-gray-700 mb-1">
								Text
							</label>
							<textarea
								className="w-full px-3 py-2 border border-gray-300 rounded-md"
								rows={4}
								value={editedText}
								onChange={(e) => setEditedText(e.target.value)}
								placeholder="Enter the text for this node..."
								autoFocus
							/>
						</div>

						<div className="flex justify-end space-x-2">
							<button
								className="px-4 py-2 border border-gray-300 rounded-md text-gray-700"
								onClick={handleCancelNodeEdit}
							>
								Cancel
							</button>
							<button
								className="px-4 py-2 bg-zinc-700 text-white rounded-md hover:bg-zinc-800"
								onClick={handleSaveNodeEdit}
							>
								Save
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};

export default ArgumentGraph;
