"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";

type Season = {
  id: string;
  name: string;
  status: string;
  rules: string | null;
};

type Standing = {
  id: string;
  team_id: string;
  points: number;
  wins: number;
  losses: number;
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

export default function AdminSeasonPage() {
  const router = useRouter();
  const params = useParams();
  const seasonId = params.id as string;
  const supabase = useMemo(() => createClient(), []);

  const [username, setUsername] = useState<string | null>(null);
  const [season, setSeason] = useState<Season | null>(null);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [addingTeam, setAddingTeam] = useState(false);

  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const [rulesInput, setRulesInput] = useState("");
  const [editingRules, setEditingRules] = useState(false);
  const [savingRules, setSavingRules] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/sign-in"); return; }

      const { data: profile } = await supabase
        .from("profiles")
        .select("username, is_admin, role")
        .eq("id", user.id)
        .maybeSingle();

      if (!profile?.is_admin && profile?.role !== 'owner' && profile?.role !== 'admin') { router.push("/"); return; }
      setUsername(profile.username);

      const { data: seasonData } = await supabase
        .from("seasons")
        .select("id, name, status, rules")
        .eq("id", seasonId)
        .maybeSingle();

      if (!seasonData) { router.push("/seasons"); return; }
      setSeason(seasonData);
      setRulesInput(seasonData.rules ?? "");

      await refreshStandings();

      const { data: teamsData } = await supabase
        .from("teams")
        .select("id, team_name, team_tag")
        .order("team_name");

      setAllTeams(teamsData ?? []);
      if (teamsData && teamsData.length > 0) {
        setSelectedTeamId(teamsData[0].id);
      }

      setLoading(false);
    }
    load();
  }, [seasonId, supabase, router]);

  async function refreshStandings() {
    const { data } = await supabase
      .from("season_standings")
      .select("id, team_id, points, wins, losses, teams(team_name, team_tag, logo_url)")
      .eq("season_id", seasonId)
      .order("points", { ascending: false });

    setStandings((data ?? []) as unknown as Standing[]);
  }

  async function handleAddTeam() {
    if (!selectedTeamId) return;
    setAddingTeam(true);

    const { error } = await supabase
      .from("season_standings")
      .insert({
        season_id: seasonId,
        team_id: selectedTeamId,
        points: 0,
        wins: 0,
        losses: 0,
      });

    if (!error) {
      await refreshStandings();
      showSuccess("Team added to season.");
    }
    setAddingTeam(false);
  }

  async function handleAddWin(standing: Standing) {
    setUpdatingId(standing.id);

    const { data: { user: actor } } = await supabase.auth.getUser();
    if (!actor) { router.push("/sign-in"); setUpdatingId(null); return; }

    const { data: callerProfile } = await supabase
      .from("profiles").select("role").eq("id", actor.id).maybeSingle();

    if (callerProfile?.role !== "owner" && callerProfile?.role !== "admin") {
      showError("You no longer have permission to modify standings.");
      setUpdatingId(null);
      return;
    }

    await supabase
      .from("season_standings")
      .update({
        points: standing.points + 3,
        wins: standing.wins + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", standing.id);

    await refreshStandings();
    setUpdatingId(null);
    showSuccess(`+3 points added to ${standing.teams?.team_name}.`);
  }

  async function handleAddLoss(standing: Standing) {
    setUpdatingId(standing.id);

    const { data: { user: actor } } = await supabase.auth.getUser();
    if (!actor) { router.push("/sign-in"); setUpdatingId(null); return; }

    const { data: callerProfile } = await supabase
      .from("profiles").select("role").eq("id", actor.id).maybeSingle();

    if (callerProfile?.role !== "owner" && callerProfile?.role !== "admin") {
      showError("You no longer have permission to modify standings.");
      setUpdatingId(null);
      return;
    }

    await supabase
      .from("season_standings")
      .update({
        losses: standing.losses + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", standing.id);

    await refreshStandings();
    setUpdatingId(null);
    showSuccess(`Loss recorded for ${standing.teams?.team_name}.`);
  }

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

  async function handleStatusChange(newStatus: string) {
    if (!season) return;

    const { error } = await supabase
      .from("seasons")
      .update({ status: newStatus })
      .eq("id", seasonId);

    if (error) return;

    setSeason({ ...season, status: newStatus });

    if (newStatus === "completed") {
      const { data: topTeams } = await supabase
        .from("season_standings")
        .select("team_id")
        .eq("season_id", seasonId)
        .order("points", { ascending: false })
        .limit(4);

      for (let i = 0; i < (topTeams ?? []).length; i++) {
        await awardBadge(
          (topTeams as { team_id: string }[])[i].team_id,
          { type: "season", place: i + 1 }
        );
      }
    }

    showSuccess("Season status updated.");
  }

  async function handleRemoveTeam(standingId: string) {
    await supabase
      .from("season_standings")
      .delete()
      .eq("id", standingId);

    await refreshStandings();
    showSuccess("Team removed from season.");
  }

  async function handleSaveRules() {
    if (rulesInput.trim().length > 5000) return;
    setSavingRules(true);
    const { error } = await supabase
      .from("seasons")
      .update({ rules: rulesInput.trim() || null })
      .eq("id", seasonId);
    if (!error) {
      setSeason((prev) => prev ? { ...prev, rules: rulesInput.trim() || null } : prev);
      setEditingRules(false);
      showSuccess("Rules saved.");
    }
    setSavingRules(false);
  }

  function showSuccess(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(""), 3000);
  }

  function showError(msg: string) {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(""), 3000);
  }

  const teamsNotInSeason = allTeams.filter(
    (t) => !standings.some((s) => s.team_id === t.id)
  );

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

  if (!season) return null;

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans">
      <Navbar username={username} />

      <main className="max-w-3xl mx-auto px-6 pt-28 pb-20 space-y-5">

        <a href="/seasons" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-300 transition-colors duration-200">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back to Seasons
        </a>

        {successMsg && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {successMsg}
          </div>
        )}

        {errorMsg && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            {errorMsg}
          </div>
        )}

        {/* Header */}
        <div className="relative rounded-2xl border border-white/10 bg-white/5 p-6 overflow-hidden">
          <div className="absolute -top-16 -left-16 w-64 h-64 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 text-xs font-medium mb-3">
              Admin Panel
            </div>
            <h1 className="text-2xl font-extrabold text-white">{season.name}</h1>
          </div>
        </div>

        {/* Status */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-sm font-semibold text-white mb-4">Season Status</h2>
          <div className="flex gap-2">
            {["active", "completed"].map((s) => (
              <button
                key={s}
                onClick={() => handleStatusChange(s)}
                disabled={season.status === s}
                className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all duration-200 capitalize disabled:cursor-not-allowed ${
                  season.status === s
                    ? s === "active"
                      ? "bg-green-500/15 border-green-500/30 text-green-400"
                      : "bg-gray-500/15 border-gray-500/30 text-gray-400"
                    : "border-white/10 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white"
                }`}
              >
                {s === "active" ? "Active" : "Completed"}
              </button>
            ))}
          </div>
        </div>

        {/* Add Team */}
        {teamsNotInSeason.length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-sm font-semibold text-white mb-4">Add Team to Season</h2>
            <div className="flex items-center gap-3">
              <select
                value={selectedTeamId}
                onChange={(e) => setSelectedTeamId(e.target.value)}
                className="flex-1 px-4 py-2.5 rounded-xl bg-gray-900 border border-white/10 text-white text-sm focus:outline-none focus:border-violet-500"
              >
                {teamsNotInSeason.map((t) => (
                  <option key={t.id} value={t.id}>{t.team_name}</option>
                ))}
              </select>
              <button
                onClick={handleAddTeam}
                disabled={addingTeam}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-medium transition-all duration-200"
              >
                {addingTeam ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : "Add"}
              </button>
            </div>
          </div>
        )}

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
                {season.rules ? "Edit" : "Add Rules"}
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
                placeholder="Enter season rules..."
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
                  onClick={() => { setEditingRules(false); setRulesInput(season.rules ?? ""); }}
                  className="px-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-sm text-gray-400 hover:text-white transition-all duration-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : season.rules ? (
            <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{season.rules}</p>
          ) : (
            <p className="text-sm text-gray-600 italic">No rules set yet.</p>
          )}
        </div>

        {/* Standings */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-sm font-semibold text-white mb-4">
            Standings ({standings.length} teams)
          </h2>

          {standings.length === 0 ? (
            <p className="text-sm text-gray-600 italic text-center py-4">No teams added yet</p>
          ) : (
            <div className="space-y-2">
              {standings.map((s, index) => (
                <div key={s.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/3 border border-white/8">
                  <span className="text-xs text-gray-600 w-5">{index + 1}</span>
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/20 to-indigo-600/20 border border-violet-500/20 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-violet-300">{s.teams?.team_tag ?? "?"}</span>
                  </div>
                  <span className="text-sm font-medium text-white flex-1">{s.teams?.team_name ?? "Unknown"}</span>

                  <div className="flex items-center gap-1">
                    {/* Win button */}
                    <button
                      onClick={() => handleAddWin(s)}
                      disabled={updatingId === s.id}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20 hover:bg-green-500/20 text-green-400 text-xs font-medium transition-all duration-200 disabled:opacity-50"
                    >
                      +W
                    </button>
                    {/* Loss button */}
                    <button
                      onClick={() => handleAddLoss(s)}
                      disabled={updatingId === s.id}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 text-xs font-medium transition-all duration-200 disabled:opacity-50"
                    >
                      +L
                    </button>
                  </div>

                  <div className="flex items-center gap-3 min-w-[80px] justify-end">
                    <span className="text-xs text-green-400">{s.wins}W</span>
                    <span className="text-xs text-red-400">{s.losses}L</span>
                    <span className="text-sm font-bold text-violet-400">{s.points}pts</span>
                  </div>

                  <button
                    onClick={() => handleRemoveTeam(s.id)}
                    className="flex items-center justify-center w-7 h-7 rounded-lg border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-all duration-200"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
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