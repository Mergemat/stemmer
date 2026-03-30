import { useAtomValue } from "jotai";
import { hasTrackAtom } from "./stemmer-atoms";
import { StemmerWorkbenchProvider } from "./stemmer-provider";
import StemmerUploadScreen from "./stemmer-upload-screen";
import StemmerWorkspace from "./stemmer-workspace";

function StemmerWorkbenchContent() {
	const hasTrack = useAtomValue(hasTrackAtom);

	return hasTrack ? <StemmerWorkspace /> : <StemmerUploadScreen />;
}

export default function StemmerWorkbench() {
	return (
		<StemmerWorkbenchProvider>
			<StemmerWorkbenchContent />
		</StemmerWorkbenchProvider>
	);
}
