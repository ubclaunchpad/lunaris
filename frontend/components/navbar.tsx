"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Filter, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import gamesData from "@/lib/data.json";
import { FilterPanel, type GameFilterState } from "@/components/search/filter-panel";

type Game = (typeof gamesData.games)[number];

const initialFilters: GameFilterState = {
    tags: [],
    modes: [],
    playableOnly: false,
};

const availableTags = Array.from(new Set(gamesData.games.flatMap((game) => game.tags))).sort();
const availableModes = Array.from(new Set(gamesData.games.flatMap((game) => game.modes))).sort();

function toggleValue(values: string[], value: string) {
    return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export function Navbar() {
    const pathname = usePathname();
    const [query, setQuery] = useState("");
    const [searchFocused, setSearchFocused] = useState(false);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [filters, setFilters] = useState<GameFilterState>(initialFilters);
    const [sortBy, setSortBy] = useState<"relevance" | "title-asc" | "title-desc" | "playable">(
        "relevance",
    );

    const searchRef = useRef<HTMLDivElement>(null);
    const resultsRef = useRef<HTMLDivElement>(null);

    const isActive = (path: string) => pathname === path;

    const activeFilterCount =
        filters.tags.length + filters.modes.length + (filters.playableOnly ? 1 : 0);

    const results = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();

        const filtered = gamesData.games.filter((game) => {
            const matchesQuery =
                normalizedQuery.length === 0 ||
                game.name.toLowerCase().includes(normalizedQuery) ||
                game.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery)) ||
                game.modes.some((mode) => mode.toLowerCase().includes(normalizedQuery));

            const matchesTags =
                filters.tags.length === 0 || filters.tags.some((tag) => game.tags.includes(tag));

            const matchesModes =
                filters.modes.length === 0 ||
                filters.modes.some((mode) => game.modes.includes(mode));

            const matchesAvailability = !filters.playableOnly || game.playable;

            return matchesQuery && matchesTags && matchesModes && matchesAvailability;
        });

        if (sortBy === "title-asc") {
            return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
        }

        if (sortBy === "title-desc") {
            return [...filtered].sort((a, b) => b.name.localeCompare(a.name));
        }

        if (sortBy === "playable") {
            return [...filtered].sort((a, b) => Number(b.playable) - Number(a.playable));
        }

        return filtered;
    }, [filters, query, sortBy]);

    const hasQuery = query.trim().length > 0;
    const isSearchOpen = hasQuery;

    useEffect(() => {
        function handleOutsideClick(event: MouseEvent) {
            const target = event.target as Node;

            if (
                !searchRef.current?.contains(target) &&
                !resultsRef.current?.contains(target)
            ) {
                setSearchFocused(false);
                setFiltersOpen(false);
            }
        }

        document.addEventListener("mousedown", handleOutsideClick);
        return () => document.removeEventListener("mousedown", handleOutsideClick);
    }, []);

    useEffect(() => {
        setSearchFocused(false);
        setFiltersOpen(false);
    }, [pathname]);

    function resetSearch() {
        setQuery("");
        setFilters(initialFilters);
        setSortBy("relevance");
        setSearchFocused(false);
        setFiltersOpen(false);
    }

    return (
        <>
            <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[rgba(255,255,255,0.1)] bg-[#12191d]/95 backdrop-blur-xl">
                <div className="flex items-center justify-between px-7 py-6 max-w-full">
                    <div className="flex items-center gap-11">
                        <div className="flex items-center gap-4">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e1ff9a]">
                                <span className="text-lg font-bold text-[#12191d]">L</span>
                            </div>
                            <span className="font-space-grotesk text-2xl font-bold text-[#fbfff5]">
                                Lunaris
                            </span>
                        </div>

                        <div className="flex items-center gap-11">
                            <Link
                                href="/"
                                className={`text-lg font-normal font-space-grotesk transition-colors ${
                                    isActive("/")
                                        ? "text-[#fbfff5]"
                                        : "text-[#fbfff5] hover:text-[#e1ff9a]"
                                }`}
                            >
                                Home
                            </Link>
                            <Link
                                href="/browse"
                                className={`text-lg font-normal font-space-grotesk transition-colors ${
                                    isActive("/browse")
                                        ? "text-[#fbfff5]"
                                        : "text-[#fbfff5] hover:text-[#e1ff9a]"
                                }`}
                            >
                                My Games
                            </Link>
                            <Link
                                href="/topup"
                                className={`text-lg font-normal font-space-grotesk transition-colors ${
                                    isActive("/topup")
                                        ? "text-[#e1ff9a]"
                                        : "text-[#fbfff5] hover:text-[#e1ff9a]"
                                }`}
                            >
                                Top-Up
                            </Link>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <div ref={searchRef} className="relative">
                            <div className="flex h-12 w-[390px] items-center rounded-full border border-[#fbfff5] bg-[#0e1418]/80 px-4 text-[#fbfff5] shadow-[0_18px_38px_rgba(0,0,0,0.22)]">
                                <Search className="h-5 w-5 shrink-0 text-[#fbfff5]/75" />

                                <input
                                    type="text"
                                    value={query}
                                    onFocus={() => setSearchFocused(true)}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Search games..."
                                    className="ml-3 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#fbfff5]/55"
                                    aria-label="Search games"
                                />

                                <div className="mx-2 h-5 w-px bg-white/15" />

                                <button
                                    type="button"
                                    onClick={() => {
                                        setSearchFocused(true);
                                        setFiltersOpen((open) => !open);
                                    }}
                                    className={`relative rounded-full p-1 transition ${
                                        filtersOpen || activeFilterCount > 0
                                            ? "text-[#e1ff9a]"
                                            : "text-[#fbfff5]/70 hover:text-white"
                                    }`}
                                    aria-label="Open filters"
                                >
                                    <Filter className="h-5 w-5" />
                                    {activeFilterCount > 0 && (
                                        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#e1ff9a] px-1 text-[10px] font-semibold text-[#12191d]">
                                            {activeFilterCount}
                                        </span>
                                    )}
                                </button>

                                {(query || activeFilterCount > 0) && (
                                    <button
                                        type="button"
                                        onClick={resetSearch}
                                        className="ml-2 text-[#fbfff5]/70 transition hover:text-white"
                                        aria-label="Clear search"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                )}
                            </div>

                            {filtersOpen && (
                                <div className="absolute right-0 top-[calc(100%+12px)] z-[60]">
                                    <FilterPanel
                                        filters={filters}
                                        availableTags={availableTags}
                                        availableModes={availableModes}
                                        onToggleTag={(tag) =>
                                            setFilters((current) => ({
                                                ...current,
                                                tags: toggleValue(current.tags, tag),
                                            }))
                                        }
                                        onToggleMode={(mode) =>
                                            setFilters((current) => ({
                                                ...current,
                                                modes: toggleValue(current.modes, mode),
                                            }))
                                        }
                                        onTogglePlayableOnly={() =>
                                            setFilters((current) => ({
                                                ...current,
                                                playableOnly: !current.playableOnly,
                                            }))
                                        }
                                        onClear={() => setFilters(initialFilters)}
                                    />
                                </div>
                            )}
                        </div>

                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-12 w-12 rounded-full border border-[#fbfff5] text-[#fbfff5] hover:text-[#e1ff9a]"
                        >
                            <svg
                                className="h-6 w-6"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                                />
                            </svg>
                        </Button>
                    </div>
                </div>
            </nav>

            {isSearchOpen && (
                <div
                    ref={resultsRef}
                    className="fixed inset-x-0 bottom-0 top-[92px] z-40 overflow-y-auto bg-[rgba(4,6,9,0.96)] backdrop-blur-sm"
                >
                    <div className="mx-auto max-w-[1560px] px-10 pb-14 pt-10">
                        <div className="mb-12">
                            <h2 className="font-space-grotesk text-5xl font-bold text-white">
                                Search Results
                            </h2>
                            <p className="mt-4 text-sm text-[#fbfff5]/60">
                                {results.length} match{results.length === 1 ? "" : "es"} found
                                {hasQuery ? ` for "${query.trim()}"` : ""}
                                {activeFilterCount > 0 ? " with active filters" : ""}
                            </p>
                        </div>

                        <div className="mb-10 flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                            <div className="flex items-center gap-5">
                                <label
                                    htmlFor="search-sort"
                                    className="font-space-grotesk text-2xl font-semibold text-white"
                                >
                                    Sort By
                                </label>
                                <div className="relative">
                                    <select
                                        id="search-sort"
                                        value={sortBy}
                                        onChange={(e) =>
                                            setSortBy(
                                                e.target.value as
                                                    | "relevance"
                                                    | "title-asc"
                                                    | "title-desc"
                                                    | "playable",
                                            )
                                        }
                                        className="min-w-[230px] appearance-none rounded-2xl border border-white/10 bg-[#273136] px-5 py-3 pr-12 text-lg text-white outline-none transition hover:border-white/20"
                                    >
                                        <option value="relevance">Relevance</option>
                                        <option value="title-asc">Title A-Z</option>
                                        <option value="title-desc">Title Z-A</option>
                                        <option value="playable">Playable First</option>
                                    </select>
                                    <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-white">
                                        <svg
                                            className="h-5 w-5"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M19 9l-7 7-7-7"
                                            />
                                        </svg>
                                    </span>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 overflow-x-auto pb-1">
                                {filters.playableOnly && <FilterChip label="Install-to-Play" />}
                                {filters.tags.map((tag) => (
                                    <FilterChip key={tag} label={tag} />
                                ))}
                                {filters.modes.map((mode) => (
                                    <FilterChip key={mode} label={mode} />
                                ))}
                            </div>
                        </div>

                        {results.length > 0 ? (
                            <div className="space-y-9">
                                {results.map((game) => (
                                    <Link
                                        key={game.id}
                                        href={`/games/${game.id}`}
                                        className="group grid grid-cols-1 gap-6 xl:grid-cols-[410px_minmax(0,1fr)] xl:items-start"
                                        onClick={() => {
                                            setSearchFocused(false);
                                            setFiltersOpen(false);
                                        }}
                                    >
                                        <div className="overflow-hidden rounded-2xl bg-[#182229] shadow-[0_20px_40px_rgba(0,0,0,0.24)]">
                                            <img
                                                src={game.image}
                                                alt={game.name}
                                                className="aspect-video h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                                            />
                                        </div>

                                        <div className="pt-3">
                                            <div className="mb-4 flex items-start justify-between gap-4">
                                                <h3 className="font-space-grotesk text-3xl font-semibold text-white transition group-hover:text-[#e1ff9a]">
                                                    {game.name}
                                                </h3>
                                                <span
                                                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
                                                        game.playable
                                                            ? "bg-[#e1ff9a] text-[#12191d]"
                                                            : "border border-white/10 bg-white/8 text-[#fbfff5]/70"
                                                    }`}
                                                >
                                                    {game.playable ? "Playable" : "Coming Soon"}
                                                </span>
                                            </div>

                                            <p className="max-w-5xl text-[17px] leading-9 text-[#fbfff5]/82">
                                                Game description - {game.description}
                                            </p>

                                            <div className="mt-5 flex flex-wrap gap-2">
                                                {game.tags.map((tag) => (
                                                    <FilterChip key={tag} label={tag} subtle />
                                                ))}
                                                {game.modes.map((mode) => (
                                                    <FilterChip key={mode} label={mode} subtle />
                                                ))}
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        ) : (
                            <div className="rounded-3xl border border-dashed border-white/10 bg-[#11191f]/65 px-8 py-16 text-center">
                                <h3 className="font-space-grotesk text-2xl font-semibold text-white">
                                    No games match yet
                                </h3>
                                <p className="mx-auto mt-3 max-w-xl text-sm text-[#fbfff5]/60">
                                    Try a broader search, clear a few filters, or browse the full
                                    library from the navbar search.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}

function FilterChip({ label, subtle = false }: { label: string; subtle?: boolean }) {
    return (
        <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
                subtle
                    ? "border border-white/14 bg-white/6 text-[#fbfff5]/76"
                    : "border border-[#e1ff9a]/40 bg-[#e1ff9a]/10 text-[#e1ff9a]"
            }`}
        >
            {label}
        </span>
    );
}
