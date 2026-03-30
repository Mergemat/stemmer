import { Link } from "@tanstack/react-router";
import ThemeToggle from "./theme-toggle";

export default function Header() {
	return (
		<header className="sticky top-0 z-50 border-[var(--line)] border-b bg-[var(--header-bg)] px-4 backdrop-blur-lg">
			<nav className="page-wrap flex flex-wrap items-center gap-x-3 gap-y-2 py-3 sm:py-4">
				<h2 className="m-0 flex-shrink-0 font-semibold text-base tracking-tight">
					<Link
						className="inline-flex items-center gap-2 rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-1.5 text-[var(--sea-ink)] text-sm no-underline shadow-[0_8px_24px_rgba(30,90,72,0.08)] sm:px-4 sm:py-2"
						to="/"
					>
						<span className="h-2 w-2 rounded-full bg-[linear-gradient(90deg,#56c6be,#7ed3bf)]" />
						Stemmer
					</Link>
				</h2>

				<div className="ml-auto flex items-center gap-1.5 sm:ml-0 sm:gap-2">
					<ThemeToggle />
				</div>

				<div className="order-3 flex w-full flex-wrap items-center gap-x-4 gap-y-1 pb-1 font-semibold text-sm sm:order-2 sm:w-auto sm:flex-nowrap sm:pb-0">
					<Link
						activeProps={{ className: "nav-link is-active" }}
						className="nav-link"
						to="/"
					>
						Separate
					</Link>
					<Link
						activeProps={{ className: "nav-link is-active" }}
						className="nav-link"
						to="/repair"
					>
						Clean Up
					</Link>
					<Link
						activeProps={{ className: "nav-link is-active" }}
						className="nav-link"
						to="/about"
					>
						About
					</Link>
				</div>
			</nav>
		</header>
	);
}
