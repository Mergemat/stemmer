import { Provider } from "jotai";
import { createContext, type ReactNode, useContext } from "react";
import {
	type StemmerActions,
	useStemmerController,
} from "./use-stemmer-controller";

const StemmerActionsContext = createContext<StemmerActions | null>(null);

function StemmerControllerProvider({ children }: { children: ReactNode }) {
	const actions = useStemmerController();

	return (
		<StemmerActionsContext.Provider value={actions}>
			{children}
		</StemmerActionsContext.Provider>
	);
}

export function StemmerWorkbenchProvider({
	children,
}: {
	children: ReactNode;
}) {
	return (
		<Provider>
			<StemmerControllerProvider>{children}</StemmerControllerProvider>
		</Provider>
	);
}

export function useStemmerActions() {
	const value = useContext(StemmerActionsContext);
	if (!value) {
		throw new Error(
			"useStemmerActions must be used inside StemmerWorkbenchProvider"
		);
	}

	return value;
}
