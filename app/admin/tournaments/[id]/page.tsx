"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";

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
  rules: string | null;
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

type RawRegistration = {
  id: string;
  team_id: string;
  status: string;
  registered_at: string;
  teams: { team_name: unknown; team_tag: unknown; logo_url: unknown } | null;
};

function mapRegistration(r: RawRegistration): Registration {
  return {
    id: r.id,
    team_id: r.team_id,
    status: r.status,
    registered_at: r.registered_at,
    teams: r.teams
      ? {
          team_name: String(r.teams.team_name ?? ""),
          team_tag: String(r.teams.team_tag ?? ""),
          logo_url: r.teams.logo_url != null ? String(r.teams.logo_url) : null,
        }
      : null,
  };
}

const STATUSES = ["draft", "open", "in_progress", "completed", "cancelled"];

export default function AdminTournamentPage() {
  const router = useRouter();
  const params = useParams();
  const tournamentId = params.id as string;
  const supabase = useMemo(() => createClient(), []);

  const [username, setUsername] = useState<string | null>(null);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);

  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState("");

  const [rulesInput, setRulesInput] = useState("");
  const [editingRules, setEditingRules] = useState(false);
  const [savingRules, setSavingRules] = useState(false);

  useEffect(() => {
    async function load() {
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!UUID_RE.test(tournamentId)) { router.push("/tournaments"); return; }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/sign-in"); return; }

      const { data: profile } = await supabase
        .from("profiles")
        .select("username, is_admin, role")
        .eq("id", user.id)
        .maybeSingle();

      if (!profile?.is_admin && profile?.role !== 'owner' && profile?.role !== 'admin') { router.push("/"); return; }
      setUsername(profile.username);

      const { data: tournamentData } = await supabase
        .from("tournaments")
        .select("id, name, game, format, status, max_teams, prize_pool, start_date, description, rules")
        .eq("id", tournamentId)
        .maybeSingle();

      if (!tournamentData) { router.push("/tournaments"); return; }
      setTournament(tournamentData);
      setRulesInput(tournamentData.rules ?? "");

      const { data: regsData } = await supabase
        .from("tournament_registrations")
        .select("id, team_id, status, registered_at, teams(team_name, team_tag, logo_url)")
        .eq("tournament_id", tournamentId)
        .order("registered_at", { ascending: true });

      setRegistrations(((regsData ?? []) as unknown as RawRegistration[]).map(mapRegistration));
      setLoading(false);
    }
    load();
  }, [tournamentId, supabase, router]);

  async function awardBadge(teamId: string, badge: { type: string; place: number }) {
    const { data: team } = await supabase
      .from("teams")
      .select("badges")
      .eq("id", teamId)
      .maybeSingle();
    const teamBadges = [...((team?.badges as object[] | null) ?? []), badge];
    await supabase.from("teams").update({ badges: teamBadges }).eq("id", teamId);

    const { data: members } = await supabase
      .from("team_members")
      .select("user_id")
      .eq("team_id", teamId);
    const userIds = (members ?? []).map((m: { user_id: string }) => m.user_id);
    if (userIds.length === 0) return;

    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id, badges")
      .in("id", userIds);

    await Promise.all(
      ((profileRows ?? []) as { id: string; badges: object[] | null }[]).map((p) => {
        const profileBadges = [...(p.badges ?? []), badge];
        return supabase.from("profiles").update({ badges: profileBadges }).eq("id", p.id);
      })
    );
  }

  async function awardTournamentBadges() {
    const { data: finalMatch } = await supabase
      .from("matches")
      .select("team_a_id, team_b_id, winner_id")
      .eq("tournament_id", tournamentId)
      .eq("status", "completed")
      .not("winner_id", "is", null)
      .order("round", { ascending: false })
      .order("match_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!finalMatch?.winner_id) return;

    const firstTeamId = finalMatch.winner_id as string;
    const secondTeamId = (
      finalMatch.team_a_id === firstTeamId ? finalMatch.team_b_id : finalMatch.team_a_id
    ) as string | null;

    await awardBadge(firstTeamId, { type: "tournament", place: 1 });
    if (secondTeamId) {
      await awardBadge(secondTeamId, { type: "tournament", place: 2 });
    }
  }

  async function handleStatusChange(newStatus: string) {
    if (!tournament) return;
    setUpdatingStatus(true);

    const { data: { user: actor } } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("tournaments")
      .update({ status: newStatus })
      .eq("id", tournamentId);

    if (!error) {
      setTournament({ ...tournament, status: newStatus });
      if (actor) {
        await supabase.from("admin_audit_log").insert({
          actor_id: actor.id,
          action: "tournament_status_change",
          target_id: tournamentId,
          details: { new_status: newStatus, previous_status: tournament.status },
        });
      }
      if (newStatus === "completed") {
        await awardTournamentBadges();
      }
      showSuccess("Status updated successfully.");
    }
    setUpdatingStatus(false);
  }

  async function handleRemoveTeam(regId: string) {
    setRemovingId(regId);

    const { data: { user: actor } } = await supabase.auth.getUser();
    const reg = registrations.find((r) => r.id === regId);

    await supabase
      .from("tournament_registrations")
      .delete()
      .eq("id", regId);

    if (actor) {
      await supabase.from("admin_audit_log").insert({
        actor_id: actor.id,
        action: "tournament_team_removed",
        target_id: regId,
        details: { tournament_id: tournamentId, team_id: reg?.team_id ?? null },
      });
    }

    setRegistrations((prev) => prev.filter((r) => r.id !== regId));
    setRemovingId(null);
    showSuccess("Team removed.");
  }

  async function handleSaveRules() {
    if (rulesInput.trim().length > 5000) return;
    setSavingRules(true);
    const { error } = await supabase
      .from("tournaments")
      .update({ rules: rulesInput.trim() || null })
      .eq("id", tournamentId);
    if (!error) {
      setTournament((prev) => prev ? { ...prev, rules: rulesInput.trim() || null } : prev);
      setEditingRules(false);
      showSuccess("Rules saved.");
    }
    setSavingRules(false);
  }

  function showSuccess(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(""), 3000);
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

  if (!tournament) return null;

  const { label, color } = statusLabel(tournament.status);

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans">
      <Navbar username={username} />

      <main className="max-w-3xl mx-auto px-6 pt-28 pb-20 space-y-5">

        <a href={`/tournaments/${tournamentId}`} className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-300 transition-colors duration-200">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back to Tournament
        </a>

        {successMsg && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {successMsg}
          </div>
        )}

        {/* Header */}
        <div className="relative rounded-2xl border border-white/10 bg-white/5 p-6 overflow-hidden">
          <div className="absolute -top-16 -left-16 w-64 h-64 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 text-xs font-medium mb-3">
                Admin Panel
              </div>
              <h1 className="text-2xl font-extrabold text-white tracking-tight">{tournament.name}</h1>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-sm text-gray-400">{tournament.game}</span>
                <span className="text-gray-600">•</span>
                <span className="text-sm text-gray-400">{registrations.length}/{tournament.max_teams} teams</span>
              </div>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${color}`}>{label}</span>
          </div>
        </div>

        {/* Change Status */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-sm font-semibold text-white mb-4">Tournament Status</h2>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => {
              const { label: sLabel, color: sColor } = statusLabel(s);
              const isActive = tournament.status === s;
              return (
                <button
                  key={s}
                  onClick={() => handleStatusChange(s)}
                  disabled={updatingStatus || isActive}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all duration-200 disabled:cursor-not-allowed ${
                    isActive
                      ? sColor + " opacity-100"
                      : "border-white/10 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white"
                  }`}
                >
                  {sLabel}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-gray-600 mt-3">
            Tip: Set to <span className="text-green-400">Open</span> so teams can register.
          </p>
        </div>

        {/* Rules */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">Rules</h2>
            {!editingRules && (
              <button
                onClick={() => setEditingRules(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-xs text-gray-300 hover:text-white transition-all duration-200"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
                </svg>
                {tournament.rules ? "Edit" : "Add Rules"}
              </button>
            )}
          </div>
          {editingRules ? (
            <div className="space-y-3">
              <textarea
                value={rulesInput}
                onChange={(e) => setRulesInput(e.target.value)}
                rows={6}
                maxLength={5000}
                placeholder="Enter tournament rules..."
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors duration-200 resize-none"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveRules}
                  disabled={savingRules}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-all duration-200"
                >
                  {savingRules ? (
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : null}
                  Save
                </button>
                <button
                  onClick={() => { setEditingRules(false); setRulesInput(tournament.rules ?? ""); }}
                  className="px-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-sm text-gray-400 hover:text-white transition-all duration-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : tournament.rules ? (
            <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{tournament.rules}</p>
          ) : (
            <p className="text-sm text-gray-600 italic">No rules set yet.</p>
          )}
        </div>

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
                    {reg.teams?.logo_url ? (
                      <img src={reg.teams.logo_url} alt={reg.teams.team_name} className="w-full h-full object-cover rounded-lg" />
                    ) : (
                      <span className="text-xs font-bold text-violet-300">{reg.teams?.team_tag ?? "?"}</span>
                    )}
                  </div>
                  <span className="text-sm font-medium text-white flex-1">{reg.teams?.team_name ?? "Unknown"}</span>
                  <span className="text-xs text-gray-500">{fmtDate(reg.registered_at)}</span>
                  <button
                    onClick={() => handleRemoveTeam(reg.id)}
                    disabled={removingId === reg.id}
                    className="flex items-center justify-center w-7 h-7 rounded-lg border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-all duration-200 disabled:opacity-50"
                  >
                    {removingId === reg.id ? (
                      <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

      </main>
    </div>
  );
}