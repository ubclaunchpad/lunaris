import { Dashboard } from "@/components/dashboard";

export default function BrowsePage() {
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
                                <div key={game.id} className="group cursor-pointer">
                                    <div className="aspect-video bg-muted rounded-lg mb-3 overflow-hidden">
                                        <div className="w-full h-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-xl">
                                            {game.name}
                                        </div>
                                    </div>
                                    <h3 className="font-semibold group-hover:text-primary transition-colors">
                                        {game.name}
                                    </h3>
                                    <p className="text-sm text-muted-foreground">
                                        {game.genre} • {game.playTime}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Popular Games */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-6">Popular Games</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {popularGames.map((game) => (
                                <div key={game.id} className="group cursor-pointer">
                                    <div className="aspect-video bg-muted rounded-lg mb-3 overflow-hidden">
                                        <div className="w-full h-full bg-gradient-to-br from-green-500 to-blue-600 flex items-center justify-center text-white font-bold text-xl">
                                            {game.name}
                                        </div>
                                    </div>
                                    <h3 className="font-semibold group-hover:text-primary transition-colors">
                                        {game.name}
                                    </h3>
                                    <p className="text-sm text-muted-foreground">
                                        {game.genre} • {game.playTime}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </section>
                </main>
            </div>
        </>
    );
}

// Sample game data
const featuredGames = [
    { id: 1, name: "Cyber Adventure", genre: "Action", playTime: "15-30 min" },
    { id: 2, name: "Space Odyssey", genre: "Sci-Fi", playTime: "30-45 min" },
    { id: 3, name: "Mystic Quest", genre: "RPG", playTime: "45-60 min" },
    { id: 4, name: "Racing Thunder", genre: "Racing", playTime: "10-20 min" },
];

const popularGames = [
    { id: 5, name: "Battle Royale", genre: "FPS", playTime: "20-40 min" },
    { id: 6, name: "Puzzle Master", genre: "Puzzle", playTime: "5-15 min" },
    { id: 7, name: "Fantasy World", genre: "Adventure", playTime: "30-60 min" },
    { id: 8, name: "Sports Arena", genre: "Sports", playTime: "15-30 min" },
];
