import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import { EditorPage } from "./pages/EditorPage";
import { EvalPage } from "./pages/EvalPage";
import { SessionsPage } from "./pages/SessionsPage";
import { InputPage } from "./pages/InputPage";
import { ModelSelectionPage } from "./pages/ModelSelectionPage";

const App = () => {
	return (
		<Router>
			<div>
				{/* Navigation */}
				<nav className="text-slate-600 p-8">
					<div className="container mx-auto relative">
						<div className="flex justify-center">
							<Link to="/" className="hover:text-slate-800">
								<img
									src="/src/components/Logo.svg"
									alt="Logo"
									className="h-6 w-auto"
								/>
							</Link>
						</div>
						<div className="fixed right-6 top-6">
							<Link to="/evals" className="hover:text-slate-800 text-sm">
								Model Evaluation
							</Link>
						</div>
					</div>
				</nav>

				{/* Routes */}
				<Routes>
					<Route path="/" element={<SessionsPage />} />
					<Route path="/input/:id" element={<InputPage />} />
					<Route path="/session/:id/model" element={<ModelSelectionPage />} />
					<Route path="/evals" element={<EvalPage />} />
					<Route
						path="/analysis/:id"
						element={<EditorPage mode="analysis" />}
					/>
				</Routes>
			</div>
		</Router>
	);
};

export default App;
