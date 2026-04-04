import data from "./data.json";

export const games = data.games;

export type Game = (typeof games)[number];

export const gameMap: Record<string, Game> = Object.fromEntries(games.map((g) => [g.id, g]));
