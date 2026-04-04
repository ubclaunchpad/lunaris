"use client";

type GameFilterState = {
    tags: string[];
    modes: string[];
    playableOnly: boolean;
};

interface FilterPanelProps {
    filters: GameFilterState;
    availableTags: string[];
    availableModes: string[];
    onToggleTag: (tag: string) => void;
    onToggleMode: (mode: string) => void;
    onTogglePlayableOnly: () => void;
    onClear: () => void;
}

export function FilterPanel({
    filters,
    availableTags,
    availableModes,
    onToggleTag,
    onToggleMode,
    onTogglePlayableOnly,
    onClear,
}: FilterPanelProps) {
    return (
        <div className="w-[320px] rounded-2xl border border-white/10 bg-[#111a1f] p-5 text-white shadow-2xl backdrop-blur-xl">
            <div className="mb-5 flex items-center justify-between">
                <div>
                    <h2 className="font-space-grotesk text-lg font-semibold">Filters</h2>
                    <p className="text-xs text-[#fbfff5]/60">Narrow results as you type</p>
                </div>

                <button
                    type="button"
                    onClick={onClear}
                    className="text-xs text-[#e1ff9a] transition hover:text-white"
                >
                    Clear all
                </button>
            </div>

            <Section title="Availability">
                <ToggleTag
                    label="Ready to Play"
                    active={filters.playableOnly}
                    onClick={onTogglePlayableOnly}
                />
            </Section>

            <Section title="Genre">
                {availableTags.map((tag) => (
                    <ToggleTag
                        key={tag}
                        label={tag}
                        active={filters.tags.includes(tag)}
                        onClick={() => onToggleTag(tag)}
                    />
                ))}
            </Section>

            <Section title="Play Modes">
                {availableModes.map((mode) => (
                    <ToggleTag
                        key={mode}
                        label={mode}
                        active={filters.modes.includes(mode)}
                        onClick={() => onToggleMode(mode)}
                    />
                ))}
            </Section>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="mb-5 last:mb-0">
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-[#fbfff5]/45">
                {title}
            </p>
            <div className="flex flex-wrap gap-2">{children}</div>
        </div>
    );
}

function ToggleTag({
    label,
    active,
    onClick,
}: {
    label: string;
    active: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`rounded-full border px-3 py-1.5 text-sm transition ${
                active
                    ? "border-[#e1ff9a] bg-[#e1ff9a] text-[#12191d]"
                    : "border-white/20 bg-white/5 text-[#fbfff5] hover:border-white/40 hover:bg-white/10"
            }`}
        >
            {label}
        </button>
    );
}

export type { GameFilterState };
