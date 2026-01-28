import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { SessionManager } from "../utils/sessionManager";
import { formatDistanceToNowStrict } from "date-fns";
import { useState } from "react";

export const SessionsPage = () => {
	const navigate = useNavigate();
	const sessions = useLiveQuery(() => SessionManager.getSessions(), [], []);
	const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
	const [renaming, setRenaming] = useState<number | null>(null);
	const [newTitle, setNewTitle] = useState<string>("");

	const handleDelete = async (sessionId: number) => {
		try {
			await SessionManager.deleteSession(sessionId);
		} catch (error) {
			console.error("Failed to delete session:", error);
		} finally {
			setConfirmDelete(null);
		}
	};

	const handleSessionClick = (sessionId: number, status: string) => {
		navigate(
			status === "draft" ? `/input/${sessionId}` : `/analysis/${sessionId}`
		);
	};

	const handleRename = (sessionId: number, currentTitle: string) => {
		setRenaming(sessionId);
		setNewTitle(currentTitle);
	};

	const saveNewTitle = async (sessionId: number) => {
		try {
			if (newTitle.trim()) {
				await SessionManager.updateSessionTitle(sessionId, newTitle.trim());
			}
		} catch (error) {
			console.error("Failed to rename session:", error);
		} finally {
			setRenaming(null);
			setNewTitle("");
		}
	};

	const createNewSession = async () => {
		try {
			// Create a new session with an empty title and empty content
			const newSession = await SessionManager.createSession("", {
				type: "doc",
				content: [{ type: "paragraph" }],
			});

			// Navigate directly to the new session with its ID
			if (newSession.id) {
				navigate(`/session/${newSession.id}/model`);
			} else {
				console.error("Failed to create a new session: No ID returned");
			}
		} catch (error) {
			console.error("Error creating new session:", error);
		}
	};

	return (
		<div className="p-4 max-w-6xl mx-auto">
			<div className="flex justify-between items-end mb-6">
				<h2>Sessions</h2>
				<button
					onClick={createNewSession}
					className="px-3 py-1.5 bg-white text-zinc-700 text-sm rounded-full hover:shadow-lg shadow-sm border border-zinc-100 hover:border-zinc-200 transition-all font-medium flex items-center gap-1"
				>
					<svg
						width="16"
						height="16"
						viewBox="0 0 16 16"
						fill="none"
						stroke="rgb(168 162 158)"
						strokeWidth="2"
					>
						<path d="M8 3v10M3 8h10" strokeLinecap="round" />
					</svg>
					New session
				</button>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				{sessions?.map((session) => (
					<div
						key={session.id}
						className="border rounded-lg py-5 px-6 bg-offWhite hover:bg-white transition-all duration-300 shadow-sm hover:shadow-lg relative"
					>
						<div
							className="flex justify-between items-start cursor-pointer"
							onClick={() => handleSessionClick(session.id!, session.status)}
						>
							<div>
								{renaming === session.id ? (
									<div onClick={(e) => e.stopPropagation()} className="mb-2">
										<input
											type="text"
											value={newTitle}
											onChange={(e) => setNewTitle(e.target.value)}
											className="border border-zinc-300 rounded-md px-2 py-1 text-xl font-semibold w-full"
											autoFocus
											onKeyDown={(e) => {
												if (e.key === "Enter") saveNewTitle(session.id!);
												if (e.key === "Escape") {
													setRenaming(null);
													setNewTitle("");
												}
											}}
										/>
										<div className="flex gap-2 mt-1">
											<button
												onClick={() => saveNewTitle(session.id!)}
												className="px-2 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600"
											>
												Save
											</button>
											<button
												onClick={() => {
													setRenaming(null);
													setNewTitle("");
												}}
												className="px-2 py-1 text-xs bg-zinc-200 text-zinc-700 rounded hover:bg-zinc-300"
											>
												Cancel
											</button>
										</div>
									</div>
								) : (
									<h2 className="text-xl font-semibold mb-2">
										{session.title}
									</h2>
								)}
								<div className="flex flex-row items-center gap-2">
									<p className="text-sm text-zinc-500 flex flex-row items-center gap-0.5">
										<svg
											className="w-4 h-4 inline-block mr-1"
											viewBox="0 0 24 24"
											width="16"
											height="16"
											fill="none"
											stroke="currentColor"
											strokeWidth="2"
										>
											<path
												d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
												strokeLinecap="round"
												strokeLinejoin="round"
											/>
										</svg>
										{formatDistanceToNowStrict(new Date(session.lastModified), {
											addSuffix: true,
										})}
									</p>

									<span className="py-0.5 px-2 text-sm rounded-full font-medium bg-zinc-200 text-zinc-700">
										{session.status === "draft" ? "Draft" : "Analysed"}
									</span>
								</div>
							</div>
						</div>

						{/* Action buttons */}
						<div className="absolute top-3 right-3 flex">
							{/* Rename button */}
							<button
								onClick={(e) => {
									e.stopPropagation();
									handleRename(session.id!, session.title);
								}}
								className="p-2 text-zinc-400 hover:text-blue-500 transition-colors"
								aria-label="Rename session"
							>
								<svg
									width="16"
									height="16"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
								>
									<path
										d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
										strokeLinecap="round"
										strokeLinejoin="round"
									/>
								</svg>
							</button>

							{/* Delete button */}
							<button
								onClick={(e) => {
									e.stopPropagation();
									setConfirmDelete(session.id!);
								}}
								className="p-2 text-zinc-400 hover:text-red-500 transition-colors"
								aria-label="Delete session"
							>
								<svg
									width="16"
									height="16"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
								>
									<path
										d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"
										strokeLinecap="round"
										strokeLinejoin="round"
									/>
								</svg>
							</button>
						</div>

						{/* Confirmation dialog */}
						{confirmDelete === session.id && (
							<div className="absolute inset-0 bg-white bg-opacity-90 backdrop-blur-sm flex items-center justify-center z-10 rounded-lg">
								<div className="p-4 text-center">
									<p className="mb-4 font-medium">Delete this session?</p>
									<div className="flex gap-2 justify-center">
										<button
											onClick={(e) => {
												e.stopPropagation();
												handleDelete(session.id!);
											}}
											className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
										>
											Delete
										</button>
										<button
											onClick={(e) => {
												e.stopPropagation();
												setConfirmDelete(null);
											}}
											className="px-4 py-2 bg-zinc-200 text-zinc-700 rounded-md hover:bg-zinc-300 transition-colors"
										>
											Cancel
										</button>
									</div>
								</div>
							</div>
						)}
					</div>
				))}

				{sessions?.length === 0 && (
					<div className="text-center text-gray-500 py-8">
						No sessions yet. Click "New Session" to get started.
					</div>
				)}
			</div>
		</div>
	);
};
