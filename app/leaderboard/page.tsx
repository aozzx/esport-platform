"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import BadgeList from "@/components/BadgeList";

function isSafeImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try { return new URL(url).protocol === "https:"; } catch { return false; }
}

type TeamStanding = {
  team_id: string;
  points: number;
  wins: number;
  losses: number;
  teams: {
    team_name: string;
    team_tag: string;
    logo_url: string | null;
    badges: object[] | null;
  } | null;
};

type PlayerStat = {
  id: string;
  username: string;
  avatar_url: string | null;
  wins: number;
  titles: number;
  badges: object[] | null;
};

type Tab = "teams" | "players";

export default function LeaderboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [username, setUsername] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("teams");
  const [teamStandings, setTeamStandings] = useState<TeamStanding[]>([]);
  const [players, setPlayers] = useState<PlayerStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/sign-in"); return; }

      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .maybeSingle();
      setUsername(profile?.username ?? null);

      // Team standings — جيب من كل المواسم مجمعة
      const { data: standings } = await supabase
        .from("season_standings")
        .select("team_id, points, wins, losses, teams(team_name, team_tag, logo_url, badges)");

      const teamMap: Record<string, TeamStanding> = {};
      ((standings ?? []) as unknown as TeamStanding[]).forEach((s) => {
        if (!teamMap[s.team_id]) {
          teamMap[s.team_id] = {
            team_id: s.team_id,
            points: 0,
            wins: 0,
            losses: 0,
            teams: s.teams,
          };
        }
        teamMap[s.team_id].points += s.points;
        teamMap[s.team_id].wins += s.wins;
        teamMap[s.team_id].losses += s.losses;
      });

      const sortedTeams = Object.values(teamMap).sort((a, b) => b.points - a.points);
      setTeamStandings(sortedTeams);

      // Players — كل اللاعبين من الـ profiles
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, avatar_url, badges")
        .order("username");

      type RawProfile = { id: string; username: string | null; avatar_url: string | null; badges: object[] | null };
      const playersData = (profiles as RawProfile[] ?? [])
        .filter((p) => !!p.username)
        .map((p) => ({
          id: p.id,
          username: p.username as string,
          avatar_url: p.avatar_url,
          wins: 0,
          titles: 0,
          badges: p.badges,
        }));

      setPlayers(playersData);
      setLoading(false);
    }
    load();
  }, [supabase, router]);

  function rankColor(index: number) {
    if (index === 0) return "text-yellow-400";
    if (index === 1) return "text-gray-300";
    if (index === 2) return "text-orange-400";
    return "text-gray-600";
  }

  function rankBg(index: number) {
    if (index === 0) return "bg-yellow-500/5 border-yellow-500/20";
    if (index === 1) return "bg-gray-400/5 border-gray-400/15";
    if (index === 2) return "bg-orange-500/5 border-orange-500/15";
    return "bg-white/3 border-white/8";
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <svg className="w-8 h-8 animate-spin text-violet-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm text-gray-500">Loading leaderboard...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans">
      <Navbar username={username} />

      <main className="max-w-3xl mx-auto px-6 pt-28 pb-20 space-y-5">

        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Leaderboard</h1>
          <p className="text-sm text-gray-500 mt-1">Top teams and players across all seasons</p>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-white/10">
          {(["teams", "players"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={
                "px-5 py-3 text-sm font-medium capitalize transition-all duration-200 border-b-2 -mb-px " +
                (activeTab === tab
                  ? "border-violet-500 text-white"
                  : "border-transparent text-gray-500 hover:text-gray-300")
              }
            >
              {tab === "teams" ? "Teams" : "Players"}
            </button>
          ))}
        </div>

        {/* Teams Tab */}
        {activeTab === "teams" && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            {teamStandings.length === 0 ? (
              <p className="text-sm text-gray-600 italic text-center py-4">No team data yet</p>
            ) : (
              <div className="space-y-2">
                {/* Header */}
                <div className="flex items-center gap-3 px-4 py-2 text-xs text-gray-500 font-medium">
                  <span className="w-5">#</span>
                  <span className="flex-1">Team</span>
                  <span className="w-12 text-center">W</span>
                  <span className="w-12 text-center">L</span>
                  <span className="w-14 text-center text-violet-400">PTS</span>
                </div>

                {teamStandings.map((s, index) => (
                  <Link key={s.team_id} href={`/teams/${s.team_id}`} className={`flex items-center gap-3 px-4 py-3 rounded-xl border hover:brightness-125 transition-all duration-150 ${rankBg(index)}`}>
                    <span className={`text-xs font-bold w-5 ${rankColor(index)}`}>{index + 1}</span>
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/20 to-indigo-600/20 border border-violet-500/20 flex items-center justify-center shrink-0">
                      {isSafeImageUrl(s.teams?.logo_url) ? (
                        <img src={s.teams!.logo_url!} alt={s.teams!.team_name} className="w-full h-full object-cover rounded-lg" />
                      ) : (
                        <span className="text-xs font-bold text-violet-300">{s.teams?.team_tag ?? "?"}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <span className="text-sm font-medium text-white truncate">{s.teams?.team_name ?? "Unknown"}</span>
                      <BadgeList badges={s.teams?.badges} />
                    </div>
                    <span className="w-12 text-center text-sm text-green-400">{s.wins}</span>
                    <span className="w-12 text-center text-sm text-red-400">{s.losses}</span>
                    <span className="w-14 text-center text-sm font-bold text-violet-400">{s.points}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Players Tab */}
        {activeTab === "players" && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            {players.length === 0 ? (
              <p className="text-sm text-gray-600 italic text-center py-4">No players yet</p>
            ) : (
              <div className="space-y-2">
                {/* Header */}
                <div className="flex items-center gap-3 px-4 py-2 text-xs text-gray-500 font-medium">
                  <span className="w-5">#</span>
                  <span className="flex-1">Player</span>
                  <span className="w-16 text-center">Wins</span>
                  <span className="w-16 text-center text-yellow-400">Titles</span>
                </div>

                {players.map((p, index) => (
                  <Link key={p.id} href={`/profile/${p.username}`} className={`flex items-center gap-3 px-4 py-3 rounded-xl border hover:brightness-125 transition-all duration-150 ${rankBg(index)}`}>
                    <span className={`text-xs font-bold w-5 ${rankColor(index)}`}>{index + 1}</span>
                    <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0">
                      {isSafeImageUrl(p.avatar_url) ? (
                        <img src={p.avatar_url!} alt={p.username} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-xs font-bold text-white">
                          {p.username.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <span className="text-sm font-medium text-white truncate">{p.username}</span>
                      <BadgeList badges={p.badges} />
                    </div>
                    <span className="w-16 text-center text-sm text-green-400">{p.wins}</span>
                    <span className="w-16 text-center text-sm text-yellow-400 font-bold">{p.titles} 🏆</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  );
}