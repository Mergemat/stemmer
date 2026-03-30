import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TooltipProvider } from "#/components/ui/tooltip";
import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";
import TanStackQueryProvider from "../integrations/tanstack-query/root-provider";

interface MyRouterContext {
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
	component: RootDocument,
});

function RootDocument() {
	return (
		<TanStackQueryProvider>
			<TooltipProvider delayDuration={200}>
				<Outlet />
			</TooltipProvider>
			<TanStackDevtools
				config={{ position: "bottom-right" }}
				plugins={[
					{
						name: "Tanstack Router",
						render: <TanStackRouterDevtoolsPanel />,
					},
					TanStackQueryDevtools,
				]}
			/>
		</TanStackQueryProvider>
	);
}
