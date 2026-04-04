"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { games, Game } from "@/lib/games";
import { FilterPanel } from "./filter-panel";

const emptyFilters = {
    tags: [],
    modes: [],
    playableOnly: false,
};

export function SearchOverlay({ onClose }: { onClose: () => void }) {
    const [query, setQuery] = useState("");
    const containerRef = useRef<HTMLDivElement>(null);

    const results: Game[] = games.filter((game) =>
        game.name.toLowerCase().includes(query.toLowerCase()),
    );

    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (!containerRef.current?.contains(e.target as Node)) {
                onClose();
            }
        }

        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-center pt-32">
            <div
                ref={containerRef}
                className="w-[900px] bg-[#0c1216] rounded-2xl border border-white/10 shadow-2xl p-6 text-white"
            >
                {/* Search */}
                <input
                    autoFocus
                    type="text"
                    placeholder="Search for games..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="w-full px-4 py-3 mb-6 rounded-lg bg-[#1a2328] outline-none"
                />

                {/* Filters */}
                <FilterPanel
                    filters={emptyFilters}
                    availableTags={[]}
                    availableModes={[]}
                    onToggleTag={() => {}}
                    onToggleMode={() => {}}
                    onTogglePlayableOnly={() => {}}
                    onClear={() => {}}
                />

                {/* Results */}
                {query && (
                    <div className="mt-6">
                        <p className="text-sm text-gray-400 mb-3">Results</p>

                        <div className="space-y-2">
                            {results.slice(0, 5).map((game) => (
                                <Link
                                    key={game.id}
                                    href={`/games/${game.id}`}
                                    onClick={onClose}
                                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/10"
                                >
                                    <img
                                        src={game.image}
                                        className="w-12 h-8 object-cover rounded"
                                    />
                                    <span>{game.name}</span>
                                </Link>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
