"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";
import BadgeList from "@/components/BadgeList";

function isSafeImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try { return new URL(url).protocol === "https:"; } catch { return false; }
}

function roleBadgeInfo(role: string | null | undefined): { label: string; classes: string } {
  if (role === "owner") return { label: "Owner", classes: "bg-yellow-500/15 border-yellow-500/30 text-yellow-300" };
  if (role === "admin") return { label: "Admin", classes: "bg-blue-500/15 border-blue-500/30 text-blue-300" };
  return { label: "Player", classes: "bg-violet-500/15 border-violet-500/30 text-violet-300" };
}

function tournamentStatusBadge(status: string): { label: string; dot: string; text: string } {
  switch (status) {
    case "open":        return { label: "Open",        dot: "bg-violet-400", text: "text-violet-300" };
    case "in_progress": return { label: "In Progress", dot: "bg-green-400",  text: "text-green-300"  };
    case "completed":   return { label: "Completed",   dot: "bg-gray-500",   text: "text-gray-400"   };
    case "cancelled":   return { label: "Cancelled",   dot: "bg-red-500",    text: "text-red-400"    };
    default:            return { label: status,        dot: "bg-gray-600",   text: "text-gray-500"   };
  }
}

function registrationStatusBadge(status: string): { label: string; classes: string } {
  switch (status) {
    case "approved": return { label: "Approved", classes: "bg-green-500/10 border-green-500/20 text-green-400"   };
    case "rejected": return { label: "Rejected", classes: "bg-red-500/10 border-red-500/20 text-red-400"         };
    default:         return { label: "Pending",  classes: "bg-yellow-500/10 border-yellow-500/20 text-yellow-400" };
  }
}

type Profile = {
  id: string;
  username: string;
  activision_id: string | null;
  avatar_url: string | null;
  role: string | null;
  badges: object[] | null;
};

type TeamMembership = {
  team_id: string;
  is_captain: boolean;
  teams: { team_name: string; team_tag: string; logo_url: string | null } | null;
};

type TournamentEntry = {
  reg_status: string;
  team_id: string;
  team_name: string;
  team_tag: string;
  tournament: { id: string; name: string; game: string; status: string; start_date: string | null } | null;
};

// Raw Supabase response shapes
type RawMembership = {
  team_id: string;
  teams: { team_name: unknown; team_tag: unknown; logo_url: unknown; captain_id: unknown } | null;
};
type RawTourReg = {
  status: unknown;
  team_id: unknown;
  tournaments: { id: unknown; name: unknown; game: unknown; status: unknown; start_date: unknown } | null;
  teams: { team_name: unknown; team_tag: unknown } | null;
};

export default function PublicProfilePage() {
  const router = useRouter();
  const params = useParams();
  const targetUsername = params.username as string;
  const supabase = useMemo(() => createClient(), []);

  const [viewerUsername, setViewerUsername] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [teams, setTeams] = useState<TeamMembership[]>([]);
  const [tournaments, setTournaments] = useState<TournamentEntry[]>([]);
  const [stats, setStats] = useState({ matches: 0, wins: 0, winRate: 0 });
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/sign-in"); return; }

      const [{ data: viewerProfile }, { data: targetProfile }] = await Promise.all([
        supabase.from("profiles").select("username").eq("id", user.id).maybeSingle(),
        supabase.from("profiles").select("id, username, activision_id, avatar_url, role, badges").eq("username", targetUsername).maybeSingle(),
      ]);

      setViewerUsername(viewerProfile?.username ?? null);

      if (!targetProfile) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setProfile(targetProfile as Profile);

      // Fetch all team memberships
      const { data: memberships } = await supabase
        .from("team_members")
        .select("team_id, teams(team_name, team_tag, logo_url, captain_id)")
        .eq("user_id", targetProfile.id);

      const mappedTeams: TeamMembership[] = ((memberships ?? []) as unknown as RawMembership[]).map((m) => ({
        team_id: m.team_id,
        is_captain: m.teams?.captain_id === targetProfile.id,
        teams: m.teams ? {
          team_name: String(m.teams.team_name ?? ""),
          team_tag:  String(m.teams.team_tag  ?? ""),
          logo_url:  m.teams.logo_url != null ? String(m.teams.logo_url) : null,
        } : null,
      }));

      setTeams(mappedTeams);

      // Fetch tournament history and match stats in parallel
      const teamIds = mappedTeams.map((m) => m.team_id);
      if (teamIds.length > 0) {
        const teamIdList = teamIds.join(",");

        const [{ data: tourRegs }, { data: matchRows }] = await Promise.all([
          supabase
            .from("tournament_registrations")
            .select("status, team_id, tournaments(id, name, game, status, start_date), teams(team_name, team_tag)")
            .in("team_id", teamIds)
            .order("registered_at", { ascending: false }),
          supabase
            .from("matches")
            .select("team_a_id, team_b_id, winner_id")
            .eq("status", "completed")
            .or(`team_a_id.in.(${teamIdList}),team_b_id.in.(${teamIdList})`),
        ]);

        const mappedTours: TournamentEntry[] = ((tourRegs ?? []) as unknown as RawTourReg[]).map((r) => ({
          reg_status: String(r.status ?? "pending"),
          team_id:    String(r.team_id ?? ""),
          team_name:  String(r.teams?.team_name ?? ""),
          team_tag:   String(r.teams?.team_tag  ?? ""),
          tournament: r.tournaments ? {
            id:         String(r.tournaments.id         ?? ""),
            name:       String(r.tournaments.name       ?? ""),
            game:       String(r.tournaments.game       ?? ""),
            status:     String(r.tournaments.status     ?? ""),
            start_date: r.tournaments.start_date != null ? String(r.tournaments.start_date) : null,
          } : null,
        }));

        setTournaments(mappedTours);

        type RawMatch = { team_a_id: string; team_b_id: string; winner_id: string | null };
        const matches = (matchRows ?? []) as RawMatch[];
        const totalMatches = matches.length;
        const wins = matches.filter((m) => m.winner_id && teamIds.includes(m.winner_id)).length;
        const winRate = totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0;
        setStats({ matches: totalMatches, wins, winRate });
      }

      setLoading(false);
    }
    load();
  }, [targetUsername, supabase, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <svg className="w-8 h-8 animate-spin text-violet-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm text-gray-500">Loading profile...</span>
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
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </div>
          <p className="text-white font-semibold">Player not found</p>
          <p className="text-sm text-gray-500">No account exists with the username &ldquo;{targetUsername}&rdquo;.</p>
          <button onClick={() => router.back()} className="text-sm text-violet-400 hover:text-violet-300 transition-colors duration-200">
            ← Go back
          </button>
        </main>
      </div>
    );
  }

  const roleBadge = roleBadgeInfo(profile!.role);

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

        {/* ── Profile header ── */}
        <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
          {/* Gradient banner */}
          <div className="h-20 bg-gradient-to-r from-violet-900/40 via-indigo-900/30 to-violet-900/40" />

          <div className="px-6 pb-6">
            {/* Avatar overlapping banner */}
            <div className="flex items-end justify-between -mt-10 mb-4">
              <div className="w-20 h-20 rounded-2xl ring-4 ring-gray-950 overflow-hidden bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0">
                {isSafeImageUrl(profile!.avatar_url) ? (
                  <img src={profile!.avatar_url!} alt={profile!.username} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-3xl font-bold text-white">{profile!.username.charAt(0).toUpperCase()}</span>
                )}
              </div>
            </div>

            {/* Name + badges */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-extrabold text-white tracking-tight">{profile!.username}</h1>
                <BadgeList badges={profile!.badges} />
              </div>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${roleBadge.classes}`}>
                {roleBadge.label}
              </span>
            </div>

            {/* Activision ID */}
            <div className="mt-5 pt-5 border-t border-white/8 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">Activision ID</p>
                {profile!.activision_id ? (
                  <p className="text-sm font-mono font-medium text-white">{profile!.activision_id}</p>
                ) : (
                  <p className="text-sm text-gray-600 italic">Not set</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Matches",  value: stats.matches, color: "text-white"       },
            { label: "Wins",     value: stats.wins,    color: "text-green-400"   },
            { label: "Win Rate", value: `${stats.winRate}%`, color: "text-violet-400" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-center">
              <p className={`text-2xl font-extrabold tracking-tight ${color}`}>{value}</p>
              <p className="text-xs text-gray-500 mt-1 font-medium">{label}</p>
            </div>
          ))}
        </div>

        {/* ── Teams ── */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">Teams</h2>
            {teams.length > 0 && (
              <span className="text-xs text-gray-500 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">
                {teams.length}
              </span>
            )}
          </div>

          {teams.length === 0 ? (
            <p className="text-sm text-gray-600 italic">Not on any team</p>
          ) : (
            <div className="space-y-2">
              {teams.map((m) => (
                <a
                  key={m.team_id}
                  href={`/teams/${m.team_id}`}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors duration-150 group"
                >
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500/20 to-indigo-600/20 border border-violet-500/20 flex items-center justify-center shrink-0">
                    {isSafeImageUrl(m.teams?.logo_url) ? (
                      <img src={m.teams!.logo_url!} alt={m.teams!.team_name} className="w-full h-full object-cover rounded-xl" />
                    ) : (
                      <span className="text-xs font-bold text-violet-300">{m.teams?.team_tag ?? "?"}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white group-hover:text-violet-300 transition-colors duration-150 truncate">
                      {m.teams?.team_name ?? "Unknown"}
                    </p>
                    {m.is_captain && (
                      <p className="text-xs text-yellow-400 mt-0.5">Captain</p>
                    )}
                  </div>
                  <svg className="w-4 h-4 text-gray-600 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </a>
              ))}
            </div>
          )}
        </div>

        {/* ── Tournament history ── */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">Tournament History</h2>
            {tournaments.length > 0 && (
              <span className="text-xs text-gray-500 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">
                {tournaments.length}
              </span>
            )}
          </div>

          {tournaments.length === 0 ? (
            <p className="text-sm text-gray-600 italic">No tournaments yet</p>
          ) : (
            <div className="space-y-2">
              {tournaments.map((t, i) => {
                if (!t.tournament) return null;
                const tourStatus = tournamentStatusBadge(t.tournament.status);
                const regStatus  = registrationStatusBadge(t.reg_status);
                return (
                  <a
                    key={i}
                    href={`/tournaments/${t.tournament.id}`}
                    className="flex items-start gap-3 px-3 py-3 rounded-xl hover:bg-white/5 transition-colors duration-150 group"
                  >
                    {/* Status dot */}
                    <div className="mt-1.5 shrink-0">
                      <span className={`block w-2 h-2 rounded-full ${tourStatus.dot}`} />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-sm font-medium text-white group-hover:text-violet-300 transition-colors duration-150 truncate">
                        {t.tournament.name}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-gray-500">{t.tournament.game}</span>
                        <span className="text-gray-700">·</span>
                        <span className="text-xs text-gray-500">{t.team_name}</span>
                        {t.tournament.start_date && (
                          <>
                            <span className="text-gray-700">·</span>
                            <span className="text-xs text-gray-600">
                              {new Date(t.tournament.start_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Badges */}
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className={`text-xs font-medium ${tourStatus.text}`}>{tourStatus.label}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${regStatus.classes}`}>
                        {regStatus.label}
                      </span>
                    </div>
                  </a>
                );
              })}
            </div>
          )}
        </div>

      </main>
    </div>
  );
}
