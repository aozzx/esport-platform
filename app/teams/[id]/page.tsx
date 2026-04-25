"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import BadgeList from "@/components/BadgeList";

function isSafeImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try { return new URL(url).protocol === "https:"; } catch { return false; }
}

type Team = {
  id: string;
  team_name: string;
  team_tag: string;
  logo_url: string | null;
  captain_id: string;
  created_at: string;
  badges: object[] | null;
};

type Member = {
  user_id: string;
  role: string;
  joined_at: string;
  profiles: {
    username: string | null;
    avatar_url: string | null;
  } | null;
};

type Standing = {
  season_id: string;
  points: number;
  wins: number;
  losses: number;
  seasons: { name: string } | null;
};

export default function PublicTeamPage() {
  const router = useRouter();
  const params = useParams();
  const teamId = params.id as string;
  const supabase = useMemo(() => createClient(), []);

  const [viewerUsername, setViewerUsername] = useState<string | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!UUID_RE.test(teamId)) { router.push("/teams"); return; }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/sign-in"); return; }

      const [profileResult, teamResult] = await Promise.all([
        supabase.from("profiles").select("username").eq("id", user.id).maybeSingle(),
        supabase.from("teams").select("id, team_name, team_tag, logo_url, captain_id, created_at, badges").eq("id", teamId).maybeSingle(),
      ]);

      if (cancelled) return;

      setViewerUsername(profileResult.data?.username ?? null);

      if (!teamResult.data) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setTeam(teamResult.data);

      const [membersResult, standingsResult] = await Promise.all([
        supabase
          .from("team_members")
          .select("user_id, role, joined_at, profiles(username, avatar_url)")
          .eq("team_id", teamId),
        supabase
          .from("season_standings")
          .select("season_id, points, wins, losses, seasons(name)")
          .eq("team_id", teamId)
          .order("points", { ascending: false }),
      ]);

      if (cancelled) return;

      setMembers((membersResult.data ?? []) as unknown as Member[]);
      setStandings((standingsResult.data ?? []) as unknown as Standing[]);
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [teamId, supabase, router]);

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <svg className="w-8 h-8 animate-spin text-violet-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm text-gray-500">Loading team...</span>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-gray-950 text-white font-sans">
        <Navbar username={viewerUsername} />
        <main className="max-w-2xl mx-auto px-6 pt-28 pb-20 text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto">
            <svg className="w-7 h-7 text-gray-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
          </div>
          <p className="text-white font-semibold">Team not found</p>
          <p className="text-sm text-gray-500">This team doesn&apos;t exist or has been removed.</p>
          <button onClick={() => router.back()} className="text-sm text-violet-400 hover:text-violet-300 transition-colors duration-200">
            ← Go back
          </button>
        </main>
      </div>
    );
  }

  const captain = members.find((m) => m.user_id === team!.captain_id);
  const totalWins   = standings.reduce((s, r) => s + r.wins,   0);
  const totalLosses = standings.reduce((s, r) => s + r.losses, 0);
  const totalPoints = standings.reduce((s, r) => s + r.points, 0);

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans">
      <Navbar username={viewerUsername} />

      <main className="max-w-2xl mx-auto px-6 pt-28 pb-20 space-y-5">

        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-300 transition-colors duration-200"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back
        </button>

        {/* Team header */}
        <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
          <div className="h-20 bg-gradient-to-r from-violet-900/40 via-indigo-900/30 to-violet-900/40" />
          <div className="px-6 pb-6">
            <div className="flex items-end justify-between -mt-10 mb-4">
              <div className="w-20 h-20 rounded-2xl ring-4 ring-gray-950 bg-gradient-to-br from-violet-500/20 to-indigo-600/20 border border-violet-500/20 flex items-center justify-center shrink-0 overflow-hidden">
                {isSafeImageUrl(team!.logo_url) ? (
                  <img src={team!.logo_url!} alt={team!.team_name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xl font-extrabold text-violet-300 tracking-wider">{team!.team_tag}</span>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-extrabold text-white tracking-tight">{team!.team_name}</h1>
                <span className="px-2 py-0.5 rounded-full bg-gray-500/15 border border-gray-500/25 text-gray-400 text-xs font-medium">
                  {team!.team_tag}
                </span>
              </div>
              <BadgeList badges={team!.badges} />
              <p className="text-xs text-gray-500">Founded {fmtDate(team!.created_at)}</p>
              {captain?.profiles?.username && (
                <p className="text-xs text-gray-500">
                  Captain:{" "}
                  <Link href={`/profile/${captain.profiles.username}`} className="text-violet-400 hover:text-violet-300 transition-colors duration-150">
                    {captain.profiles.username}
                  </Link>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Overall stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Wins",   value: totalWins,   color: "text-green-400"  },
            { label: "Losses", value: totalLosses, color: "text-red-400"    },
            { label: "Points", value: totalPoints, color: "text-violet-400" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-center">
              <p className={`text-2xl font-extrabold tracking-tight ${color}`}>{value}</p>
              <p className="text-xs text-gray-500 mt-1 font-medium">{label}</p>
            </div>
          ))}
        </div>

        {/* Members */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">Roster</h2>
            <span className="text-xs text-gray-500 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">
              {members.length}
            </span>
          </div>

          {members.length === 0 ? (
            <p className="text-sm text-gray-600 italic">No members</p>
          ) : (
            <div className="space-y-2">
              {members.map((m) => (
                <Link
                  key={m.user_id}
                  href={m.profiles?.username ? `/profile/${m.profiles.username}` : "#"}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors duration-150 group"
                >
                  <div className="w-9 h-9 rounded-xl overflow-hidden shrink-0">
                    {isSafeImageUrl(m.profiles?.avatar_url) ? (
                      <img src={m.profiles!.avatar_url!} alt="avatar" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-violet-500/30 to-indigo-600/30 flex items-center justify-center text-xs font-bold text-violet-300">
                        {(m.profiles?.username ?? "?").charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white group-hover:text-violet-300 transition-colors duration-150 truncate">
                      {m.profiles?.username ?? "Unknown"}
                    </p>
                    <p className="text-xs text-gray-500">Joined {fmtDate(m.joined_at)}</p>
                  </div>
                  <span className={
                    "px-2 py-0.5 rounded-full text-xs font-medium border shrink-0 " +
                    (m.role === "captain"
                      ? "bg-violet-500/15 border-violet-500/25 text-violet-300"
                      : "bg-white/5 border-white/10 text-gray-400")
                  }>
                    {m.role === "captain" ? "Captain" : "Member"}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Season standings */}
        {standings.length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 className="text-sm font-semibold text-white mb-4">Season Results</h2>
            <div className="space-y-2">
              <div className="flex items-center gap-3 px-3 py-1 text-xs text-gray-500 font-medium">
                <span className="flex-1">Season</span>
                <span className="w-10 text-center">W</span>
                <span className="w-10 text-center">L</span>
                <span className="w-12 text-center text-violet-400">PTS</span>
              </div>
              {standings.map((s) => (
                <div key={s.season_id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/3 border border-white/8">
                  <span className="flex-1 text-sm text-white truncate">{(s.seasons as { name: string } | null)?.name ?? "Unknown Season"}</span>
                  <span className="w-10 text-center text-sm text-green-400">{s.wins}</span>
                  <span className="w-10 text-center text-sm text-red-400">{s.losses}</span>
                  <span className="w-12 text-center text-sm font-bold text-violet-400">{s.points}</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
