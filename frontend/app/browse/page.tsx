"use client";

import { useEffect, useState } from "react";
import { Dashboard } from "@/components/dashboard";
import { GameCard } from "@/components/game-card/game-card";
import { apiClient, type Game } from "@/lib/api-client";
import gamesData from "@/lib/data.json";

const fallbackGames: Game[] = gamesData.games.map((g) => ({
    gameId: g.id,
    name: g.name,
    description: g.description || "",
    imageUrl: g.image,
    tags: g.tags,
    modes: g.modes,
    ebsSnapshotId: "",
    minInstanceType: "",
    playable: g.playable,
}));

export default function BrowsePage() {
    const [games, setGames] = useState<Game[]>(fallbackGames);
    const mid = Math.ceil(games.length / 2);
    const featuredGames = games.slice(0, mid);
    const popularGames = games.slice(mid);

    useEffect(() => {
        apiClient
            .getGames()
            .then((res) => setGames(res.data))
            .catch(() => {}); // keep fallback on error
    }, []);

    return (
        <>
            <div className="relative z-0 min-h-screen">
                <Dashboard />

                {/* Main Content */}
                <main className="container py-8">
                    <div className="mb-8">
                        <h1 className="text-3xl font-bold mb-2">Browse Games</h1>
                        <p className="text-muted-foreground">
                            Discover and play the latest cloud games
                        </p>
                    </div>

                    {/* Featured Games */}
                    <section className="mb-12">
                        <h2 className="text-2xl font-semibold mb-6">Featured Games</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {featuredGames.map((game) => (
                                <GameCard
                                    key={game.gameId}
                                    id={game.gameId}
                                    src={game.imageUrl}
                                    alt={game.name}
                                    title={game.name}
                                    modes={game.modes ?? []}
                                    tags={game.tags}
                                />
                            ))}
                        </div>
                    </section>

                    {/* Popular Games */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-6">Popular Games</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {popularGames.map((game) => (
                                <GameCard
                                    key={game.gameId}
                                    id={game.gameId}
                                    src={game.imageUrl}
                                    alt={game.name}
                                    title={game.name}
                                    modes={game.modes ?? []}
                                    tags={game.tags}
                                />
                            ))}
                        </div>
                    </section>
                </main>
            </div>
        </>
    );
}
