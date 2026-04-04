"use client";

import { useEffect, useState } from "react";
import { Gamepad2, Search, Filter, User, LogOut } from "lucide-react";
import { Dashboard } from "@/components/dashboard";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
                {/* Header */}
                <Dashboard />
                <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                    <div className="container flex h-14 items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Link href="/browse" className="flex items-center gap-2">
                                <Gamepad2 className="h-6 w-6" />
                                <span className="font-bold">Lunaris</span>
                            </Link>
                        </div>

                        {/* Search Bar */}
                        <div className="flex flex-1 items-center justify-center gap-4 px-6">
                            <div className="relative flex-1 max-w-md">
                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input placeholder="Search games..." className="pl-9" />
                            </div>
                            <Button variant="outline" size="sm">
                                <Filter className="h-4 w-4 mr-2" />
                                Filters
                            </Button>
                        </div>

                        {/* User Menu */}
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm">
                                <User className="h-4 w-4 mr-2" />
                                Profile
                            </Button>
                            <Link href="/login">
                                <Button variant="ghost" size="sm">
                                    <LogOut className="h-4 w-4 mr-2" />
                                    Logout
                                </Button>
                            </Link>
                        </div>
                    </div>
                </header>

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
