"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { GameCardsRow } from "@/components/game-card/game-cards-row";
import { apiClient, type Game } from "@/lib/api-client";

export default function Home() {
    const searchParams = useSearchParams();
    const query = searchParams.get("q")?.trim().toLowerCase() ?? "";
    const activeTags = searchParams.get("tags")?.split(",").filter(Boolean) ?? [];
    const activeModes = searchParams.get("modes")?.split(",").filter(Boolean) ?? [];
    const playableOnly = searchParams.get("playable") === "true";

    const [allGames, setAllGames] = useState<Game[]>([]);

    useEffect(() => {
        apiClient
            .getGames()
            .then((res) => setAllGames(res.data))
            .catch(() => {});
    }, []);

    const isFiltered = query || activeTags.length || activeModes.length || playableOnly;

    const filtered = allGames.filter((g) => {
        if (
            query &&
            !g.name.toLowerCase().includes(query) &&
            !(g.tags ?? []).some((t) => t.toLowerCase().includes(query))
        )
            return false;
        if (activeTags.length && !activeTags.some((t) => (g.tags ?? []).includes(t))) return false;
        if (activeModes.length && !activeModes.some((m) => (g.modes ?? []).includes(m)))
            return false;
        if (playableOnly && !g.playable) return false;
        return true;
    });

    return (
        <div>
            <header className="space-y-4 mb-12">
                <h1 className="text-3xl sm:text-5xl font-bold font-space-grotesk">
                    {isFiltered
                        ? `Results for "${searchParams.get("q") ?? activeTags[0] ?? activeModes[0] ?? "filters"}"`
                        : "What would you like to play today?"}
                </h1>
            </header>

            <section aria-label="featured games">
                <GameCardsRow games={filtered} />
            </section>
        </div>
    );
}
