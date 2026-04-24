"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";

function isSafeImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try { return new URL(url).protocol === "https:"; } catch { return false; }
}

type Team = {
  id: string;
  team_name: string;
  team_tag: string;
  logo_url: string | null;
  created_at: string;
  isCaptain: boolean;
};

export default function TeamsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [username, setUsername] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/sign-in"); return; }

      const [profileResult, memberResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("username")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("team_members")
          .select("team_id, teams(id, team_name, team_tag, logo_url, created_at, captain_id)")
          .eq("user_id", user.id),
      ]);

      setUsername(profileResult.data?.username ?? null);

      type MemberRow = {
        team_id: string;
        teams: {
          id: string;
          team_name: string;
          team_tag: string;
          logo_url: string | null;
          created_at: string;
          captain_id: string;
        } | null;
      };

      const rows = (memberResult.data ?? []) as unknown as MemberRow[];
      const seen = new Set<string>();
      const allTeams: Team[] = rows
        .filter((r) => r.teams !== null && !seen.has(r.teams!.id) && !!seen.add(r.teams!.id))
        .map((r) => ({
          id: r.teams!.id,
          team_name: r.teams!.team_name,
          team_tag: r.teams!.team_tag,
          logo_url: r.teams!.logo_url,
          created_at: r.teams!.created_at,
          isCaptain: r.teams!.captain_id === user.id,
        }));

      setTeams(allTeams);
      setLoading(false);
    }
    load();
  }, [supabase, router]);

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
          <span className="text-sm text-gray-500">Loading...</span>
        </div>
      </div>
    );
  }

  const isCaptainOfATeam = teams.some((t) => t.isCaptain);

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans">
      <Navbar username={username} />
      <main className="max-w-4xl mx-auto px-6 pt-28 pb-20">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">Teams</h1>
            <p className="text-sm text-gray-500 mt-1">
              {teams.length > 0
                ? `You are in ${teams.length} team${teams.length > 1 ? "s" : ""}`
                : "Create your first team and start competing"}
            </p>
          </div>
          {!isCaptainOfATeam && (
            <a
              href="/create-team"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-all duration-200 shadow-lg shadow-violet-900/40"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Create Team
            </a>
          )}
        </div>

        {teams.length > 0 ? (
          <div className="space-y-4">
            {teams.map((team) => (
              <a
                key={team.id}
                href={"/team/" + team.id}
                className="group relative flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 hover:border-violet-500/30 p-5 transition-all duration-200 overflow-hidden"
              >
                <div className="absolute -top-8 -right-8 w-32 h-32 bg-violet-600/10 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                <div className="relative flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500/20 to-indigo-600/20 border border-violet-500/20 flex items-center justify-center shrink-0 overflow-hidden">
                    {isSafeImageUrl(team.logo_url) ? (
                      <img src={team.logo_url!} alt={team.team_name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-sm font-extrabold text-violet-300 tracking-wider">{team.team_tag}</span>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base font-bold text-white">{team.team_name}</h2>
                      <span className={`px-2 py-0.5 rounded-full border text-xs font-medium ${
                        team.isCaptain
                          ? "bg-violet-500/15 border-violet-500/25 text-violet-300"
                          : "bg-white/5 border-white/15 text-gray-400"
                      }`}>
                        {team.isCaptain ? "Captain" : "Member"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">Created {fmtDate(team.created_at)}</p>
                  </div>
                </div>
                <svg className="relative w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </a>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-12 flex flex-col items-center justify-center text-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <svg className="w-7 h-7 text-gray-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
              </svg>
            </div>
            <div>
              <p className="text-white font-semibold">You have no teams yet</p>
              <p className="text-gray-500 text-sm mt-1">Create your first team and start competing</p>
            </div>
            <a href="/create-team" className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-all duration-200 shadow-lg shadow-violet-900/40">
              Create Team
            </a>
          </div>
        )}
      </main>
    </div>
  );
}