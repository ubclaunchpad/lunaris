"use client";

import { ReactNode, useEffect, useState } from "react";
import { GameCard } from "./game-card";
import { apiClient, type Game } from "@/lib/api-client";
import gamesData from "@/lib/data.json";

const fallbackGames: Game[] = gamesData.games.map((g) => ({
    gameId: g.id,
    name: g.name,
    description: "",
    imageUrl: g.image,
    tags: g.tags,
    modes: g.modes,
    ebsSnapshotId: "",
    minInstanceType: "",
}));

interface CarouselProps {
    children: ReactNode;
    className?: string;
}

const Carousel = ({ children, className = "" }: CarouselProps) => (
    <div className={`relative -my-28 -mx-8 ${className}`}>
        <div
            className="overflow-x-auto overflow-y-visible py-28 px-8 no-scrollbar"
            role="region"
            aria-label="game cards"
        >
            <div className="flex gap-5 min-h-[220px] pr-8">{children}</div>
        </div>
    </div>
);

interface GameCardsRowProps {
    gameIds?: string[];
}

export function GameCardsRow({ gameIds }: GameCardsRowProps) {
    const [games, setGames] = useState<Game[]>(fallbackGames);

    useEffect(() => {
        apiClient
            .getGames()
            .then((res) => setGames(res.data))
            .catch(() => {}); // keep fallback on error
    }, []);

    const gamesToRender = gameIds?.length
        ? games.filter((g) => gameIds.includes(g.gameId))
        : games;

    return (
        <Carousel>
            {gamesToRender.map((game) => (
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
        </Carousel>
    );
}
