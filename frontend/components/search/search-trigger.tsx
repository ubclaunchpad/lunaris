"use client";

import { useState } from "react";
import { SearchOverlay } from "./search-overlay";

export function SearchTrigger() {
    const [open, setOpen] = useState(false);

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="w-full max-w-md px-4 py-2 rounded-full bg-muted text-left"
            >
                <span className="text-muted-foreground">Search for games...</span>
            </button>

            {open && <SearchOverlay onClose={() => setOpen(false)} />}
        </>
    );
}
