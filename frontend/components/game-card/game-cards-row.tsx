"use client";

import { ReactNode, useEffect, useState } from "react";
import { GameCard } from "./game-card";
import { apiClient, type Game } from "@/lib/api-client";

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
    games?: Game[];
    className?: string;
}

export function GameCardsRow({ games: gamesProp, className }: GameCardsRowProps) {
    const [fetched, setFetched] = useState<Game[]>([]);

    useEffect(() => {
        if (gamesProp) return;
        apiClient
            .getGames()
            .then((res) => setFetched(res.data))
            .catch(() => {});
    }, [gamesProp]);

    const gamesToRender = gamesProp ?? fetched;

    return (
        <Carousel className={className}>
            {gamesToRender.map((game) => (
                <GameCard
                    key={game.gameId}
                    id={game.gameId}
                    src={game.imageUrl}
                    alt={game.name}
                    title={game.name}
                    modes={game.modes ?? []}
                    tags={game.tags ?? []}
                />
            ))}
        </Carousel>
    );
}
