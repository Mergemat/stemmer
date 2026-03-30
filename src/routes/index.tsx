import { createFileRoute } from "@tanstack/react-router";
import StemmerWorkbench from "#/components/stemmer/StemmerWorkbench";

export const Route = createFileRoute("/")({ component: App });

function App() {
	return <StemmerWorkbench />;
}
