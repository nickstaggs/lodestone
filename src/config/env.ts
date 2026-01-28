// Validate that required environment variables are set
const validateEnvVar = (key: string, value: string | undefined): string => {
	if (!value || value.trim() === "") {
		throw new Error(
			`Missing environment variable: ${key}. Please check your .env file and ensure it is set.`
		);
	}
	return value;
};

// Get environment variables with type safety and validation
export const ENV = {
	OPENAI_API_KEY: validateEnvVar(
		"VITE_OPENAI_API_KEY",
		import.meta.env.VITE_OPENAI_API_KEY as string
	),
	ANTHROPIC_API_KEY: validateEnvVar(
		"VITE_ANTHROPIC_API_KEY",
		import.meta.env.VITE_ANTHROPIC_API_KEY as string
	),
};


