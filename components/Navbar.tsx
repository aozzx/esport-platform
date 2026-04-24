"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import UserDropdown from "./UserDropdown";
import SupportButton from "./SupportButton";

type Props = { username?: string | null };

const links = [
  { label: "Tournaments", href: "/tournaments" },
  { label: "Teams", href: "/teams" },
  { label: "Seasons", href: "/seasons" },
  { label: "Scrims", href: "/scrims" },
  { label: "Leaderboard", href: "/leaderboard" },
];

export default function Navbar({ username }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    if (!username) return;
    async function loadRole() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      setRole(data?.role ?? null);
    }
    loadRole();
  }, [supabase, username]);

  return (
    <>
    {username && <SupportButton />}
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/[0.06] bg-gray-950 shadow-[0_1px_0_rgba(139,92,246,0.08)]">
      <div className="max-w-7xl mx-auto px-6 h-[72px] flex items-center justify-between">

        {/* Logo */}
        <a href="/" className="flex items-center gap-1.5 group hover:opacity-90 transition-opacity duration-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/elitemena-icon-512.png"
            alt=""
            width={36}
            height={36}
            className="w-8 h-8 sm:w-9 sm:h-9 object-contain flex-shrink-0"
          />
          <span className="text-base sm:text-lg font-bold tracking-tight leading-none">
            <span className="text-white">Elite</span>
            <span className="text-violet-400">MENA</span>
          </span>
        </a>

        {/* Center links */}
        <div className="hidden md:flex items-center gap-7">
          {links.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="relative text-sm text-gray-400 hover:text-white transition-colors duration-200 after:absolute after:-bottom-1 after:left-0 after:right-0 after:h-px after:rounded-full after:bg-violet-500 after:scale-x-0 hover:after:scale-x-100 after:transition-transform after:duration-200"
            >
              {link.label}
            </a>
          ))}
          {(role === "owner" || role === "admin") && (
            <a
              href="/admin/reports"
              className="relative text-sm text-violet-400 hover:text-violet-300 transition-colors duration-200 after:absolute after:-bottom-1 after:left-0 after:right-0 after:h-px after:rounded-full after:bg-violet-400 after:scale-x-0 hover:after:scale-x-100 after:transition-transform after:duration-200"
            >
              Reports
            </a>
          )}
          {role === "owner" && (
            <a
              href="/admin/users"
              className="relative text-sm text-violet-400 hover:text-violet-300 transition-colors duration-200 after:absolute after:-bottom-1 after:left-0 after:right-0 after:h-px after:rounded-full after:bg-violet-400 after:scale-x-0 hover:after:scale-x-100 after:transition-transform after:duration-200"
            >
              Users
            </a>
          )}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3 min-w-[120px] justify-end">
          {username ? (
            <UserDropdown username={username} role={role} />
          ) : (
            <>
              <a
                href="/sign-in"
                className="text-sm text-gray-400 hover:text-white transition-colors duration-200"
              >
                Sign In
              </a>
              <a
                href="/sign-up"
                className="text-sm font-medium px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-colors duration-200"
              >
                Sign Up
              </a>
            </>
          )}
        </div>

      </div>
    </nav>
    </>
  );
}