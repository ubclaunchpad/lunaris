"use client"

import { useEffect, useRef, useState } from "react"
import { signOut } from "next-auth/react"
import { LogOut } from "lucide-react"
import { useUser } from "@/context/usercontext"

export default function ProfileMenu() {
    const { email } = useUser()
    const [open, setOpen] = useState(false)
    const menuRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setOpen(false)
            }
        }
        if (open) {
            document.addEventListener("mousedown", handleClickOutside)
        }
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [open])

    return (
        <div ref={menuRef} className="relative">
            <button
                onClick={() => setOpen((prev) => !prev)}
                className="flex h-12 w-12 items-center justify-center rounded-full border border-[#fbfff5] text-[#fbfff5] transition-colors hover:border-[#e1ff9a] hover:text-[#e1ff9a] focus:outline-none"
                aria-label="Open user menu"
            >
                <svg
                    className="h-6 w-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                </svg>
            </button>

            {open && (
                <div className="absolute right-0 top-full mt-2 w-56 overflow-hidden rounded-xl border border-[#1e2a30] bg-[#0a0e12] shadow-xl ring-1 ring-white/5 z-50">
                    <div className="px-4 py-3">
                        <p className="text-sm font-medium text-[#fbfff5] truncate">{email || "—"}</p>
                    </div>

                    <div className="h-px bg-[#1e2a30]" />

                    <button
                        onClick={() => signOut({ callbackUrl: "/login" })}
                        className="flex w-full items-center gap-2.5 px-4 py-3 text-sm font-medium text-[#ff6b6b] hover:bg-[#ff6b6b]/10 transition-colors"
                    >
                        <LogOut className="h-4 w-4" />
                        Sign out
                    </button>
                </div>
            )}
        </div>
    )
}
