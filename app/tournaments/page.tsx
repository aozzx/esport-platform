"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";

function isSafeImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try { return new URL(url).protocol === "https:"; } catch { return false; }
}

type Tournament = {
  id: string;
  name: string;
  game: string;
  format: string;
  status: string;
  max_teams: number;
  prize_pool: string | null;
  start_date: string | null;
  banner_url: string | null;
};

export default function TournamentsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [username, setUsername] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/sign-in"); return; }

      const { data: profile } = await supabase
        .from("profiles")
        .select("username, role")
        .eq("id", user.id)
        .maybeSingle();
      setUsername(profile?.username ?? null);
      setRole(profile?.role ?? null);

      const { data } = await supabase
        .from("tournaments")
        .select("id, name, game, format, status, max_teams, prize_pool, start_date, banner_url")
        .order("created_at", { ascending: false });

      setTournaments(data ?? []);
      setLoading(false);
    }
    load();
  }, [supabase, router]);

  function statusLabel(status: string) {
    switch (status) {
      case "open": return { label: "Open", color: "bg-green-500/15 border-green-500/30 text-green-400" };
      case "in_progress": return { label: "Live", color: "bg-blue-500/15 border-blue-500/30 text-blue-400" };
      case "completed": return { label: "Completed", color: "bg-gray-500/15 border-gray-500/30 text-gray-400" };
      case "cancelled": return { label: "Cancelled", color: "bg-red-500/15 border-red-500/30 text-red-400" };
      default: return { label: "Draft", color: "bg-yellow-500/15 border-yellow-500/30 text-yellow-400" };
    }
  }

  function formatLabel(format: string) {
    switch (format) {
      case "single_elimination": return "Single Elimination";
      case "double_elimination": return "Double Elimination";
      case "round_robin": return "Round Robin";
      default: return format;
    }
  }

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString("en-US", {
      year: "numeric", month: "short", day: "numeric",
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <svg className="w-8 h-8 animate-spin text-violet-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm text-gray-500">Loading tournaments...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans">
      <Navbar username={username} />

      <main className="max-w-4xl mx-auto px-6 pt-28 pb-20">

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">Tournaments</h1>
            <p className="text-sm text-gray-500 mt-1">
              {tournaments.length > 0
                ? `${tournaments.length} tournament${tournaments.length > 1 ? "s" : ""} available`
                : "No tournaments yet"}
            </p>
          </div>
          {(role === "owner" || role === "admin") && (
            <a
              href="/admin/tournaments/new"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-all duration-200 shadow-lg shadow-violet-900/40"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Create Tournament
            </a>
          )}
        </div>

        {tournaments.length > 0 ? (
          <div className="space-y-4">
            {tournaments.map((t) => {
              const { label, color } = statusLabel(t.status);
              return (
                <a
                  key={t.id}
                  href={"/tournaments/" + t.id}
                  className="group relative flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 hover:border-violet-500/30 p-5 transition-all duration-200 overflow-hidden"
                >
                  <div className="absolute -top-8 -right-8 w-32 h-32 bg-violet-600/10 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

                  <div className="relative flex items-center gap-4 flex-1 min-w-0">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500/20 to-indigo-600/20 border border-violet-500/20 flex items-center justify-center shrink-0 overflow-hidden">
                      {isSafeImageUrl(t.banner_url) ? (
                        <img src={t.banner_url!} alt={t.name} className="w-full h-full object-cover" />
                      ) : (
                        <svg className="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0" />
                        </svg>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-base font-bold text-white">{t.name}</h2>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${color}`}>
                          {label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-xs text-gray-500">{t.game}</span>
                        <span className="text-xs text-gray-600">•</span>
                        <span className="text-xs text-gray-500">{formatLabel(t.format)}</span>
                        <span className="text-xs text-gray-600">•</span>
                        <span className="text-xs text-gray-500">{t.max_teams} teams</span>
                        {t.prize_pool && (
                          <>
                            <span className="text-xs text-gray-600">•</span>
                            <span className="text-xs text-yellow-400 font-medium">{t.prize_pool}</span>
                          </>
                        )}
                        {t.start_date && (
                          <>
                            <span className="text-xs text-gray-600">•</span>
                            <span className="text-xs text-gray-500">{fmtDate(t.start_date)}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <svg className="relative w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </a>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-12 flex flex-col items-center justify-center text-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <svg className="w-7 h-7 text-gray-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0" />
              </svg>
            </div>
            <div>
              <p className="text-white font-semibold">No tournaments yet</p>
              <p className="text-gray-500 text-sm mt-1">Check back soon for upcoming tournaments</p>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}