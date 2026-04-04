"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Filter, Search, X } from "lucide-react";
import gamesData from "@/lib/data.json";
import { FilterPanel, type GameFilterState } from "./filter-panel";

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

export default function SearchBar() {
    const [query, setQuery] = useState("");
    const [filters, setFilters] = useState<GameFilterState>(initialFilters);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    const activeFilterCount =
        filters.tags.length + filters.modes.length + (filters.playableOnly ? 1 : 0);

    const results: Game[] = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();

        return gamesData.games.filter((game) => {
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
    }, [filters, query]);

    useEffect(() => {
        function handleOutsideClick(event: MouseEvent) {
            if (!rootRef.current?.contains(event.target as Node)) {
                setFiltersOpen(false);
            }
        }

        document.addEventListener("mousedown", handleOutsideClick);
        return () => document.removeEventListener("mousedown", handleOutsideClick);
    }, []);

    return (
        <div ref={rootRef} className="relative w-full max-w-2xl">
            <div className="flex items-center rounded-2xl border border-white/10 bg-[#182229]/85 px-4 py-3 shadow-[0_18px_45px_rgba(0,0,0,0.28)] backdrop-blur-xl">
                <Search className="h-5 w-5 shrink-0 text-[#fbfff5]/60" />

                <input
                    type="text"
                    placeholder="Search for games"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="ml-3 min-w-0 flex-1 bg-transparent text-base text-white placeholder:text-[#fbfff5]/55 outline-none"
                    aria-label="Search for games"
                />

                {query && (
                    <button
                        type="button"
                        onClick={() => setQuery("")}
                        className="mr-2 text-[#fbfff5]/55 transition hover:text-white"
                        aria-label="Clear search"
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}

                <div className="mx-2 h-6 w-px bg-white/10" />

                <button
                    type="button"
                    onClick={() => setFiltersOpen((open) => !open)}
                    className={`relative rounded-full p-1.5 transition ${
                        filtersOpen || activeFilterCount > 0
                            ? "text-[#e1ff9a]"
                            : "text-[#fbfff5]/75 hover:text-white"
                    }`}
                    aria-label="Open filters"
                    aria-expanded={filtersOpen}
                >
                    <Filter className="h-5 w-5" />
                    {activeFilterCount > 0 && (
                        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#e1ff9a] px-1 text-[10px] font-semibold text-[#12191d]">
                            {activeFilterCount}
                        </span>
                    )}
                </button>
            </div>

            {filtersOpen && (
                <div className="absolute right-0 top-[calc(100%+12px)] z-20">
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

            {(query.trim().length > 0 || activeFilterCount > 0) && (
                <div className="absolute left-0 right-0 top-[calc(100%+12px)] z-10 overflow-hidden rounded-2xl border border-white/10 bg-[#111a1f]/95 shadow-[0_24px_60px_rgba(0,0,0,0.36)] backdrop-blur-xl">
                    <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                        <p className="text-sm text-[#fbfff5]/65">
                            {results.length} result{results.length === 1 ? "" : "s"}
                        </p>
                        <p className="text-xs uppercase tracking-[0.18em] text-[#fbfff5]/40">
                            Updates automatically
                        </p>
                    </div>

                    {results.length > 0 ? (
                        <div className="max-h-[360px] overflow-y-auto p-2">
                            {results.slice(0, 8).map((game) => (
                                <Link
                                    key={game.id}
                                    href={`/games/${game.id}`}
                                    className="flex items-center gap-3 rounded-xl px-3 py-3 transition hover:bg-white/6"
                                >
                                    <img
                                        src={game.image}
                                        alt={game.name}
                                        className="h-12 w-20 rounded-lg object-cover"
                                    />

                                    <div className="min-w-0 flex-1">
                                        <p className="truncate font-space-grotesk text-sm font-semibold text-white">
                                            {game.name}
                                        </p>
                                        <p className="truncate text-xs text-[#fbfff5]/60">
                                            {[...game.tags, ...game.modes].join(" • ")}
                                        </p>
                                    </div>

                                    <span
                                        className={`rounded-full px-2 py-1 text-[11px] font-medium ${
                                            game.playable
                                                ? "bg-[#e1ff9a] text-[#12191d]"
                                                : "bg-white/8 text-[#fbfff5]/70"
                                        }`}
                                    >
                                        {game.playable ? "Playable" : "Coming Soon"}
                                    </span>
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <div className="px-4 py-6 text-sm text-[#fbfff5]/65">
                            No games match your current search and filters.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
