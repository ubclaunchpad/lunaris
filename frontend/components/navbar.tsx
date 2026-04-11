"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Filter, Search, X } from "lucide-react";
import { FilterPanel } from "@/components/search/filter-panel";
import { apiClient } from "@/lib/api-client";
import ProfileMenu from "@/components/profile-menu";

function toggleValue(values: string[], value: string) {
    return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}

export function Navbar() {
    const pathname = usePathname();
    const router = useRouter();
    const searchParams = useSearchParams();
    const searchRef = useRef<HTMLDivElement>(null);

    const [query, setQuery] = useState(searchParams.get("q") ?? "");
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [availableTags, setAvailableTags] = useState<string[]>([]);
    const [availableModes, setAvailableModes] = useState<string[]>([]);

    // Derive filter state from URL
    const activeTags = searchParams.get("tags")?.split(",").filter(Boolean) ?? [];
    const activeModes = searchParams.get("modes")?.split(",").filter(Boolean) ?? [];
    const playableOnly = searchParams.get("playable") === "true";
    const activeFilterCount = activeTags.length + activeModes.length + (playableOnly ? 1 : 0);

    const isActive = (path: string) => pathname === path;

    useEffect(() => {
        apiClient.getGames().then((res) => {
            const games = res.data;
            setAvailableTags(Array.from(new Set(games.flatMap((g) => g.tags ?? []))).sort());
            setAvailableModes(Array.from(new Set(games.flatMap((g) => g.modes ?? []))).sort());
        }).catch(() => {});
    }, []);

    // Sync query input if URL changes externally
    useEffect(() => {
        setQuery(searchParams.get("q") ?? "");
    }, [searchParams]);

    // Close filters on outside click
    useEffect(() => {
        function handleOutsideClick(e: MouseEvent) {
            if (!searchRef.current?.contains(e.target as Node)) setFiltersOpen(false);
        }
        document.addEventListener("mousedown", handleOutsideClick);
        return () => document.removeEventListener("mousedown", handleOutsideClick);
    }, []);

    // Close filters on navigation
    useEffect(() => { setFiltersOpen(false); }, [pathname]);

    function buildUrl(overrides: Record<string, string | null>) {
        const params = new URLSearchParams(searchParams.toString());
        for (const [key, value] of Object.entries(overrides)) {
            if (value === null || value === "") params.delete(key);
            else params.set(key, value);
        }
        return `/?${params.toString()}`;
    }

    function handleQueryChange(value: string) {
        setQuery(value);
        router.replace(buildUrl({ q: value.trim() || null }));
    }

    function handleToggleTag(tag: string) {
        const next = toggleValue(activeTags, tag);
        router.replace(buildUrl({ tags: next.join(",") || null }));
    }

    function handleToggleMode(mode: string) {
        const next = toggleValue(activeModes, mode);
        router.replace(buildUrl({ modes: next.join(",") || null }));
    }

    function handleTogglePlayable() {
        router.replace(buildUrl({ playable: playableOnly ? null : "true" }));
    }

    function resetSearch() {
        setQuery("");
        setFiltersOpen(false);
        router.replace("/");
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
                                    isActive("/") ? "text-[#fbfff5]" : "text-[#fbfff5] hover:text-[#e1ff9a]"
                                }`}
                            >
                                Home
                            </Link>
                            <Link
                                href="/topup"
                                className={`text-lg font-normal font-space-grotesk transition-colors ${
                                    isActive("/topup") ? "text-[#e1ff9a]" : "text-[#fbfff5] hover:text-[#e1ff9a]"
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
                                    onChange={(e) => handleQueryChange(e.target.value)}
                                    placeholder="Search games..."
                                    className="ml-3 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#fbfff5]/55"
                                    aria-label="Search games"
                                />

                                <div className="mx-2 h-5 w-px bg-white/15" />

                                <button
                                    type="button"
                                    onClick={() => setFiltersOpen((o) => !o)}
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
                                        filters={{ tags: activeTags, modes: activeModes, playableOnly }}
                                        availableTags={availableTags}
                                        availableModes={availableModes}
                                        onToggleTag={handleToggleTag}
                                        onToggleMode={handleToggleMode}
                                        onTogglePlayableOnly={handleTogglePlayable}
                                        onClear={resetSearch}
                                    />
                                </div>
                            )}
                        </div>

                        <ProfileMenu />
                    </div>
                </div>
            </nav>
        </>
    );
}
