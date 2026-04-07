import Link from "next/link";
import gamesData from "@/lib/data.json";

type Game = (typeof gamesData.games)[number];

export default async function SearchPage({
    searchParams,
}: {
    searchParams: Promise<{ q?: string }>;
}) {
    const params = await searchParams;
    const q = (params.q ?? "").trim().toLowerCase();

    const results: Game[] = q
        ? gamesData.games.filter(
              (game) =>
                  game.name.toLowerCase().includes(q) ||
                  game.tags.some((tag) => tag.toLowerCase().includes(q)) ||
                  game.modes.some((mode) => mode.toLowerCase().includes(q)),
          )
        : [];

    return (
        <main className="min-h-screen bg-[#12191d] text-[#fbfff5] px-8 pt-32 pb-10">
            <h1 className="text-4xl font-bold font-space-grotesk mb-2">
                {q ? `Search results for "${params.q}"` : "Search"}
            </h1>

            <p className="text-[#fbfff5]/70 mb-10">
                {q
                    ? `${results.length} result${results.length === 1 ? "" : "s"} found`
                    : "Search for games, tags, or modes."}
            </p>

            {q && results.length === 0 && (
                <p className="text-[#fbfff5]/70">No matching games found.</p>
            )}

            {results.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {results.map((game) => (
                        <Link key={game.id} href={`/games/${game.id}`} className="group">
                            <div className="overflow-hidden rounded-xl bg-[#1a2328]">
                                <img
                                    src={game.image}
                                    alt={game.name}
                                    className="w-full aspect-video object-cover transition-transform duration-300 group-hover:scale-105"
                                />
                            </div>

                            <h2 className="mt-3 text-lg font-semibold font-space-grotesk">
                                {game.name}
                            </h2>

                            <p className="text-sm text-[#fbfff5]/60 mt-1">
                                {game.tags.join(" • ")}
                            </p>
                        </Link>
                    ))}
                </div>
            )}
        </main>
    );
}
