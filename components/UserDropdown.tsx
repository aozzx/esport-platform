"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Props = { username: string; role?: string | null };

function roleBadge(role: string | null | undefined): string {
  if (role === "owner") return "👑 ";
  if (role === "admin") return "🛡️ ";
  return "";
}

export default function UserDropdown({ username, role }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    setOpen(false);
    router.push("/");
    router.refresh();
  }

  const initial = username.charAt(0).toUpperCase();

  const navItems = [
    { label: "Profile", href: "/profile" },
    { label: "Teams", href: "/teams" },
    { label: "Invites", href: "/invites" },
    { label: "My Reports", href: "/my-reports" },
    { label: "Settings", href: "/settings" },
  ];

  return (
    <div ref={ref} className="relative z-50">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all duration-200"
      >
        <div className="relative">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-xs font-bold text-white">
            {initial}
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-400 border-2 border-gray-950" />
        </div>

        <span className="hidden sm:block text-sm font-medium text-white">
          {roleBadge(role)}{username}
        </span>

        <svg
          className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 8.25l-7.5 7.5-7.5-7.5"
          />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-white/10 bg-gray-900 shadow-2xl shadow-black/60 overflow-hidden">
          {/* User Info */}
          <div className="px-4 py-3 border-b border-white/10">
            <p className="text-sm font-semibold text-white truncate">
              {roleBadge(role)}{username}
            </p>
            <p className="text-xs text-green-400">Online</p>
          </div>

          {/* Navigation Links */}
          <div className="py-1">
            {navItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                onClick={() => setOpen(false)}
                className="block px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-white/5 transition"
              >
                {item.label}
              </a>
            ))}
          </div>

          {/* Logout */}
          <div className="border-t border-white/10">
            <button
              type="button"
              onClick={handleLogout}
              className="w-full text-left px-4 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 transition"
            >
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  );
}