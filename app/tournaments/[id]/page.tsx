"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
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
  description: string | null;
  banner_url: string | null;
  team_size: string | null;
  game_mode: string | null;
};

type TeamMember = {
  user_id: string;
  profiles: { username: string; activision_id: string | null } | null;
};

type Registration = {
  id: string;
  team_id: string;
  status: string;
  registered_at: string;
  teams: {
    team_name: string;
    team_tag: string;
    logo_url: string | null;
  } | null;
};

type Team = {
  id: string;
  team_name: string;
  team_tag: string;
};

export default function TournamentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const tournamentId = params.id as string;
  const supabase = useMemo(() => createClient(), []);

  const [username, setUsername] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [userTeams, setUserTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState("");
  const [registerSuccess, setRegisterSuccess] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamMembersLoading, setTeamMembersLoading] = useState(false);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/sign-in"); return; }

      // Fetch profile and tournament in parallel
      const [profileResult, tournamentResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("username, is_admin, role")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("tournaments")
          .select("id, name, game, format, status, max_teams, prize_pool, start_date, description, banner_url, team_size, game_mode")
          .eq("id", tournamentId)
          .maybeSingle(),
      ]);

      if (cancelled) return;

      setUsername(profileResult.data?.username ?? null);
      setIsAdmin(!!(profileResult.data?.is_admin || profileResult.data?.role === "owner" || profileResult.data?.role === "admin"));

      if (tournamentResult.error) {
        console.error("[tournament] query error:", tournamentResult.error.message, tournamentResult.error.code);
        setLoadError(true);
        setLoading(false);
        return;
      }
      // Only redirect when the tournament genuinely doesn't exist (no error, no data)
      if (!tournamentResult.data) { router.push("/tournaments"); return; }

      setTournament(tournamentResult.data);

      const [regsResult, captainResult] = await Promise.all([
        supabase
          .from("tournament_registrations")
          .select("id, team_id, status, registered_at, teams(team_name, team_tag, logo_url)")
          .eq("tournament_id", tournamentId)
          .order("registered_at", { ascending: true }),
        supabase
          .from("teams")
          .select("id, team_name, team_tag")
          .eq("captain_id", user.id),
      ]);

      if (cancelled) return;

      setRegistrations((regsResult.data ?? []) as unknown as Registration[]);

      const captainTeams = captainResult.data ?? [];
      const registeredIds = new Set((regsResult.data ?? []).map((r: { team_id: string }) => r.team_id));
      setUserTeams(captainTeams);
      const firstEligible = captainTeams.find((t) => !registeredIds.has(t.id));
      if (firstEligible) setSelectedTeamId(firstEligible.id);

      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [tournamentId, supabase, router]);

  function teamSizeNumber(ts: string | null | undefined): number {
    if (!ts) return 5;
    const n = parseInt(ts.split("v")[0], 10);
    return isNaN(n) ? 5 : n;
  }

  useEffect(() => {
    if (!selectedTeamId) return;
    let cancelled = false;
    setTeamMembersLoading(true);
    setSelectedMemberIds([]);
    supabase
      .from("team_members")
      .select("user_id, profiles(username, activision_id)")
      .eq("team_id", selectedTeamId)
      .then(({ data }) => {
        if (cancelled) return;
        setTeamMembers((data ?? []) as unknown as TeamMember[]);
        setTeamMembersLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedTeamId, supabase]);

  async function handleRegister() {
    setRegisterError("");
    setRegisterSuccess("");

    if (!selectedTeamId) {
      setRegisterError("Please select a team.");
      return;
    }

    const required = teamSizeNumber(tournament?.team_size);

    if (selectedMemberIds.length !== required) {
      setRegisterError(`Please select exactly ${required} player${required !== 1 ? "s" : ""} for this tournament.`);
      return;
    }

    setRegistering(true);

    const selectedMembers = teamMembers.filter((m) => selectedMemberIds.includes(m.user_id));
    const missingActivision = selectedMembers.filter((m) => !m.profiles?.activision_id);
    if (missingActivision.length > 0) {
      const names = missingActivision.map((m) => m.profiles?.username ?? "Unknown").join(", ");
      setRegisterError(`These selected players don't have an Activision ID: ${names}`);
      setRegistering(false);
      return;
    }

    const alreadyRegistered = registrations.some((r) => r.team_id === selectedTeamId);
    if (alreadyRegistered) {
      setRegisterError("This team is already registered.");
      setRegistering(false);
      return;
    }

    if (registrations.length >= (tournament?.max_teams ?? 0)) {
      setRegisterError("Tournament is full.");
      setRegistering(false);
      return;
    }

    const { data: rosterConflicts } = await supabase
      .from("tournament_roster")
      .select("user_id")
      .eq("tournament_id", tournamentId)
      .in("user_id", selectedMemberIds);

    if ((rosterConflicts ?? []).length > 0) {
      setRegisterError("One or more selected players are already registered in this tournament with another team.");
      setRegistering(false);
      return;
    }

    const { data: { user: freshUser } } = await supabase.auth.getUser();
    if (!freshUser) { router.push("/sign-in"); setRegistering(false); return; }

    const { data: freshTeam } = await supabase
      .from("teams")
      .select("captain_id")
      .eq("id", selectedTeamId)
      .maybeSingle();

    if (freshTeam?.captain_id !== freshUser.id) {
      setRegisterError("You are no longer the captain of this team.");
      setRegistering(false);
      return;
    }

    const regId = crypto.randomUUID();
    const { error } = await supabase
      .from("tournament_registrations")
      .insert({
        id: regId,
        tournament_id: tournamentId,
        team_id: selectedTeamId,
        status: "pending",
      });

    if (error) {
      setRegisterError("Failed to register. Please try again.");
      setRegistering(false);
      return;
    }

    const { error: rosterError } = await supabase
      .from("tournament_roster")
      .insert(
        selectedMemberIds.map((userId) => ({
          registration_id: regId,
          tournament_id: tournamentId,
          user_id: userId,
        }))
      );

    if (rosterError) {
      setRegisterError("Registered but failed to save player roster. Please contact an admin.");
      setRegistering(false);
      return;
    }

    const registeredTeam = userTeams.find((t) => t.id === selectedTeamId);
    if (registeredTeam) {
      setRegistrations((prev) => [...prev, {
        id: regId,
        team_id: selectedTeamId,
        status: "pending",
        registered_at: new Date().toISOString(),
        teams: { team_name: registeredTeam.team_name, team_tag: registeredTeam.team_tag, logo_url: null },
      }]);
    }

    setRegisterSuccess("Team registered successfully!");
    setRegistering(false);
    setTimeout(() => setRegisterSuccess(""), 3000);
  }

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

  function fmtDateTime(d: string) {
    return new Date(d).toLocaleString("en-US", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  const isRegistrationOpen = tournament?.status === "open";
  const isFull = registrations.length >= (tournament?.max_teams ?? 0);
  const eligibleTeams = userTeams.filter((t) => !registrations.some((r) => r.team_id === t.id));
  const userTeamAlreadyRegistered = userTeams.length > 0 && userTeams.some((t) => registrations.some((r) => r.team_id === t.id));
  const requiredCount = teamSizeNumber(tournament?.team_size);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <svg className="w-8 h-8 animate-spin text-violet-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm text-gray-500">Loading tournament...</span>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-gray-950 text-white font-sans">
        <Navbar username={username} />
        <div className="flex flex-col items-center justify-center min-h-screen gap-4">
          <p className="text-gray-400 text-sm">Failed to load tournament. Check the browser console for details.</p>
          <a href="/tournaments" className="text-violet-400 hover:text-violet-300 text-sm transition-colors duration-200">← Back to Tournaments</a>
        </div>
      </div>
    );
  }

  if (!tournament) return null;

  const { label, color } = statusLabel(tournament.status);

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans">
      <Navbar username={username} />

      <main className="max-w-3xl mx-auto px-6 pt-28 pb-20 space-y-5">

        <a href="/tournaments" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-300 transition-colors duration-200">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back to Tournaments
        </a>

        {/* Header */}
        <div className="relative rounded-2xl border border-white/10 bg-white/5 p-6 overflow-hidden">
          <div className="absolute -top-16 -left-16 w-64 h-64 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <h1 className="text-2xl font-extrabold text-white tracking-tight">{tournament.name}</h1>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${color}`}>{label}</span>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm text-gray-400">{tournament.game}</span>
                  <span className="text-gray-600">•</span>
                  <span className="text-sm text-gray-400">{formatLabel(tournament.format)}</span>
                  <span className="text-gray-600">•</span>
                  <span className="text-sm text-gray-400">{registrations.length}/{tournament.max_teams} teams</span>
                  {tournament.prize_pool && (
                    <>
                      <span className="text-gray-600">•</span>
                      <span className="text-sm text-yellow-400 font-medium">{tournament.prize_pool}</span>
                    </>
                  )}
                </div>
                {tournament.start_date && (
                  <p className="text-xs text-gray-500 mt-2">Starts {fmtDateTime(tournament.start_date)}</p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={`/tournaments/${tournament.id}/rules`}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 bg-white/5 text-gray-300 text-sm font-medium hover:bg-white/10 transition-all duration-200"
                >
                  Rules
                </a>
                <a
                  href={`/tournaments/${tournament.id}/bracket`}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 bg-white/5 text-gray-300 text-sm font-medium hover:bg-white/10 transition-all duration-200"
                >
                  View Bracket
                </a>
                {isAdmin && (
                  <a
                    href={`/admin/tournaments/${tournament.id}`}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-violet-500/30 bg-violet-500/10 text-violet-300 text-sm font-medium hover:bg-violet-500/20 transition-all duration-200"
                  >
                    Manage
                  </a>
                )}
              </div>
            </div>

            {tournament.description && (
              <p className="mt-4 text-sm text-gray-400 leading-relaxed">{tournament.description}</p>
            )}
          </div>
        </div>

        {/* Register */}
        {isRegistrationOpen && eligibleTeams.length > 0 && !isFull && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
            <h2 className="text-sm font-semibold text-white">Register Your Team</h2>

            {registerError && (
              <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                {registerError}
              </div>
            )}

            {registerSuccess && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {registerSuccess}
              </div>
            )}

            {/* Team selector */}
            {eligibleTeams.length > 1 ? (
              <select
                value={selectedTeamId}
                onChange={(e) => setSelectedTeamId(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-gray-900 border border-white/10 text-white text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
              >
                {eligibleTeams.map((t) => (
                  <option key={t.id} value={t.id}>{t.team_name}</option>
                ))}
              </select>
            ) : (
              <div className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm">
                {eligibleTeams[0]?.team_name}
              </div>
            )}

            {/* Member picker */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">
                  Select {requiredCount} player{requiredCount !== 1 ? "s" : ""} who will compete
                </p>
                <p className={`text-xs font-medium ${selectedMemberIds.length === requiredCount ? "text-green-400" : "text-gray-500"}`}>
                  {selectedMemberIds.length}/{requiredCount} selected
                </p>
              </div>

              {teamMembersLoading ? (
                <p className="text-xs text-gray-600 italic py-2">Loading members...</p>
              ) : teamMembers.length === 0 ? (
                <p className="text-xs text-gray-600 italic py-2">No members found.</p>
              ) : (
                <div className="space-y-1.5">
                  {teamMembers.map((m) => {
                    const isChecked = selectedMemberIds.includes(m.user_id);
                    const canCheck = isChecked || selectedMemberIds.length < requiredCount;
                    return (
                      <label
                        key={m.user_id}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all duration-150 ${
                          isChecked
                            ? "bg-violet-500/10 border-violet-500/30 cursor-pointer"
                            : canCheck
                            ? "bg-white/3 border-white/8 hover:bg-white/5 cursor-pointer"
                            : "bg-white/3 border-white/8 opacity-40 cursor-not-allowed"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={!canCheck}
                          onChange={() => {
                            if (isChecked) {
                              setSelectedMemberIds((prev) => prev.filter((id) => id !== m.user_id));
                            } else if (canCheck) {
                              setSelectedMemberIds((prev) => [...prev, m.user_id]);
                            }
                          }}
                          className="w-3.5 h-3.5 rounded accent-violet-500 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">{m.profiles?.username ?? "Unknown"}</p>
                          {m.profiles?.activision_id ? (
                            <p className="text-xs text-gray-500 truncate">{m.profiles.activision_id}</p>
                          ) : (
                            <p className="text-xs text-red-400/70">No Activision ID</p>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <button
              onClick={handleRegister}
              disabled={registering || selectedMemberIds.length !== requiredCount}
              className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-all duration-200"
            >
              {registering ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : `Register (${selectedMemberIds.length}/${requiredCount} selected)`}
            </button>
          </div>
        )}

        {userTeamAlreadyRegistered && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Your team is registered in this tournament.
          </div>
        )}

        {isFull && !userTeamAlreadyRegistered && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            Tournament is full.
          </div>
        )}

        {/* Registered Teams */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
            Registered Teams ({registrations.length}/{tournament.max_teams})
          </h2>

          {registrations.length === 0 ? (
            <p className="text-sm text-gray-600 italic text-center py-4">No teams registered yet</p>
          ) : (
            <div className="space-y-2">
              {registrations.map((reg, index) => (
                <div key={reg.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/3 border border-white/8">
                  <span className="text-xs text-gray-600 w-5">{index + 1}</span>
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/20 to-indigo-600/20 border border-violet-500/20 flex items-center justify-center shrink-0">
                    {isSafeImageUrl(reg.teams?.logo_url) ? (
                      <img src={reg.teams!.logo_url!} alt={reg.teams!.team_name} className="w-full h-full object-cover rounded-lg" />
                    ) : (
                      <span className="text-xs font-bold text-violet-300">{reg.teams?.team_tag ?? "?"}</span>
                    )}
                  </div>
                  <span className="text-sm font-medium text-white flex-1">{reg.teams?.team_name ?? "Unknown"}</span>
                  <span className="text-xs text-gray-500">{fmtDate(reg.registered_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

      </main>
    </div>
  );
}