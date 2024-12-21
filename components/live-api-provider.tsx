import { LiveAPIProvider as Provider } from '@/vendor/contexts/LiveAPIContext';

const LiveAPIProvider = ({ children }: { children: React.ReactNode }) => {
	const host = 'generativelanguage.googleapis.com';
	const uri = `wss://${host}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent`;

	const API_KEY = (process.env.NEXT_PUBLIC_GEMINI_API_KEY as string) || '';
	if (typeof API_KEY !== 'string') {
		throw new Error('set NEXT_PUBLIC_GEMINI_API_KEY in .env');
	}

	return (
		<Provider url={uri} apiKey={API_KEY}>
			{children}
		</Provider>
	);
};

export default LiveAPIProvider;
