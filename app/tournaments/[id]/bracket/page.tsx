"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";

type Match = {
  id: string;
  round: number;
  match_number: number;
  team_a_id: string | null;
  team_b_id: string | null;
  winner_id: string | null;
  score_a: number | null;
  score_b: number | null;
  status: string;
  scheduled_at: string | null;
  team_a: { team_name: string; team_tag: string } | null;
  team_b: { team_name: string; team_tag: string } | null;
  winner: { team_name: string; team_tag: string } | null;
};

type Submission = {
  match_id: string;
  team_id: string;
  claimed_winner_id: string;
  score_a: number | null;
  score_b: number | null;
  proof_url: string | null;
};

type Registration = {
  team_id: string;
  teams: { team_name: string; team_tag: string } | null;
};

type RawTeam = { team_name: unknown; team_tag: unknown } | null;

function mapTeam(t: RawTeam): { team_name: string; team_tag: string } | null {
  return t ? { team_name: String(t.team_name ?? ""), team_tag: String(t.team_tag ?? "") } : null;
}

type RawRegistration = { team_id: string; teams: RawTeam };

function mapRegistration(r: RawRegistration): Registration {
  return { team_id: r.team_id, teams: mapTeam(r.teams) };
}

function fmtSchedule(s: string | null) {
  if (!s) return null;
  return new Date(s).toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ── Bracket layout constants ──────────────────────────────────
const MATCH_W = 210;
const MATCH_H = 80;
const SLOT_H = 112;   // vertical space per match in round 1
const ROUND_COL_W = 270; // match width + connector space
const CONN_W = ROUND_COL_W - MATCH_W; // 60px connector zone

function roundLabel(roundIdx: number, totalRounds: number): string {
  const fromEnd = totalRounds - 1 - roundIdx;
  if (fromEnd === 0) return "Final";
  if (fromEnd === 1) return "Semifinals";
  if (fromEnd === 2) return "Quarterfinals";
  return `Round ${roundIdx + 1}`;
}

export default function BracketPage() {
  const router = useRouter();
  const params = useParams();
  const tournamentId = params.id as string;
  const supabase = useMemo(() => createClient(), []);

  const [username, setUsername] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [captainOfTeams, setCaptainOfTeams] = useState<Set<string>>(new Set());
  const [matches, setMatches] = useState<Match[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [submissions, setSubmissions] = useState<Record<string, Submission[]>>({});
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState("");
  const [mutationSuccess, setMutationSuccess] = useState("");
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);

  const [submitForms, setSubmitForms] = useState<
    Record<string, { claimedWinner: string; scoreA: string; scoreB: string; proofFile: File | null; uploading: boolean; submitting: boolean; error: string }>
  >({});

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

      setUsername(profile?.username ?? null);
      setIsAdmin(!!(profile?.is_admin || profile?.role === "owner" || profile?.role === "admin"));

      const { data: captainedTeams } = await supabase
        .from("teams")
        .select("id")
        .eq("captain_id", user.id);
      setCaptainOfTeams(new Set((captainedTeams ?? []).map((t: { id: string }) => t.id)));

      await refreshMatches();

      const { data: regs } = await supabase
        .from("tournament_registrations")
        .select("team_id, teams(team_name, team_tag)")
        .eq("tournament_id", tournamentId);

      setRegistrations(((regs ?? []) as unknown as RawRegistration[]).map(mapRegistration));
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId, supabase, router]);

  async function refreshMatches() {
    const { data: rawMatches } = await supabase
      .from("matches")
      .select("id, round, match_number, team_a_id, team_b_id, winner_id, score_a, score_b, status, scheduled_at")
      .eq("tournament_id", tournamentId)
      .order("round")
      .order("match_number");

    const rows = (rawMatches ?? []) as {
      id: string; round: number; match_number: number;
      team_a_id: string | null; team_b_id: string | null; winner_id: string | null;
      score_a: number | null; score_b: number | null; status: string; scheduled_at: string | null;
    }[];

    const teamIds = [
      ...new Set(
        rows.flatMap((m) => [m.team_a_id, m.team_b_id, m.winner_id])
          .filter((id): id is string => id !== null)
      ),
    ];

    const teamMap = new Map<string, { team_name: string; team_tag: string }>();
    if (teamIds.length > 0) {
      const { data: teams } = await supabase
        .from("teams")
        .select("id, team_name, team_tag")
        .in("id", teamIds);
      for (const t of teams ?? []) {
        teamMap.set(t.id as string, {
          team_name: t.team_name as string,
          team_tag: t.team_tag as string,
        });
      }
    }

    const matchList = rows.map((m): Match => ({
      id: m.id,
      round: m.round,
      match_number: m.match_number,
      team_a_id: m.team_a_id,
      team_b_id: m.team_b_id,
      winner_id: m.winner_id,
      score_a: m.score_a,
      score_b: m.score_b,
      status: m.status,
      scheduled_at: m.scheduled_at,
      team_a: m.team_a_id ? (teamMap.get(m.team_a_id) ?? null) : null,
      team_b: m.team_b_id ? (teamMap.get(m.team_b_id) ?? null) : null,
      winner: m.winner_id ? (teamMap.get(m.winner_id) ?? null) : null,
    }));

    setMatches(matchList);

    if (matchList.length > 0) {
      const matchIds = matchList.map((m) => m.id);
      const { data: subs } = await supabase
        .from("match_submissions")
        .select("match_id, team_id, claimed_winner_id, score_a, score_b, proof_url")
        .in("match_id", matchIds);

      const subMap: Record<string, Submission[]> = {};
      for (const s of subs ?? []) {
        const sub = s as Submission;
        if (!subMap[sub.match_id]) subMap[sub.match_id] = [];
        subMap[sub.match_id].push(sub);
      }
      setSubmissions(subMap);
    }
  }

  async function generateBracket() {
    if (registrations.length < 2) return;
    setGenerating(true);
    setMutationError("");
    setMutationSuccess("");
    const res = await fetch(`/api/tournaments/${tournamentId}/bracket/generate`, { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setMutationError(body.error ?? "Failed to generate bracket.");
      setGenerating(false);
      return;
    }
    await refreshMatches();
    setGenerating(false);
    setMutationSuccess("Bracket generated!");
    setTimeout(() => setMutationSuccess(""), 3000);
  }

  async function handleSetWinner(match: Match, winnerId: string, loserId: string) {
    setUpdatingId(match.id);
    setMutationError("");
    const res = await fetch(`/api/tournaments/${tournamentId}/bracket/set-winner`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId: match.id, winnerId, loserId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setMutationError(body.error ?? "Failed to set winner.");
      setUpdatingId(null);
      return;
    }
    await refreshMatches();
    setUpdatingId(null);
    setMutationSuccess("Winner confirmed!");
    setTimeout(() => setMutationSuccess(""), 3000);
  }

  function getSubmitForm(matchId: string) {
    return submitForms[matchId] ?? {
      claimedWinner: "", scoreA: "", scoreB: "", proofFile: null,
      uploading: false, submitting: false, error: "",
    };
  }

  function patchSubmitForm(matchId: string, patch: Partial<typeof submitForms[string]>) {
    setSubmitForms((prev) => ({
      ...prev,
      [matchId]: { ...getSubmitForm(matchId), ...patch },
    }));
  }

  async function handleSubmitResult(match: Match, captainTeamId: string) {
    const form = getSubmitForm(match.id);
    if (!form.claimedWinner) { patchSubmitForm(match.id, { error: "Please select who won." }); return; }
    patchSubmitForm(match.id, { submitting: true, error: "" });

    let proofUrl: string | undefined = undefined;
    if (form.proofFile) {
      patchSubmitForm(match.id, { uploading: true });
      const ext = form.proofFile.name.split(".").pop() ?? "jpg";
      const path = `${match.id}/${captainTeamId}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("match-proofs")
        .upload(path, form.proofFile, { upsert: true });

      if (uploadError) {
        patchSubmitForm(match.id, { submitting: false, uploading: false, error: "Failed to upload image." });
        return;
      }
      const { data: urlData } = supabase.storage.from("match-proofs").getPublicUrl(path);
      proofUrl = urlData.publicUrl;
      patchSubmitForm(match.id, { uploading: false });
    }

    const res = await fetch(`/api/tournaments/${tournamentId}/bracket/submit-result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        matchId: match.id,
        teamId: captainTeamId,
        claimedWinnerId: form.claimedWinner,
        scoreA: form.scoreA ? Number(form.scoreA) : undefined,
        scoreB: form.scoreB ? Number(form.scoreB) : undefined,
        proofUrl,
      }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      patchSubmitForm(match.id, { submitting: false, error: body.error ?? "Failed to submit." });
      return;
    }
    patchSubmitForm(match.id, { submitting: false, error: "" });
    await refreshMatches();
    if (body.confirmed) {
      setMutationSuccess("Both teams agreed — winner confirmed!");
      setTimeout(() => setMutationSuccess(""), 4000);
    }
  }

  // ── Layout calculations ───────────────────────────────────────
  const rounds = useMemo(() => {
    const r: Record<number, Match[]> = {};
    for (const m of matches) {
      if (!r[m.round]) r[m.round] = [];
      r[m.round].push(m);
    }
    return r;
  }, [matches]);

  const roundNumbers = useMemo(
    () => Object.keys(rounds).map(Number).sort((a, b) => a - b),
    [rounds]
  );

  const numRounds = roundNumbers.length;
  const round1Count = rounds[roundNumbers[0]]?.length ?? 0;
  const canvasH = round1Count * SLOT_H;
  const canvasW = numRounds === 0 ? 0 : (numRounds - 1) * ROUND_COL_W + MATCH_W;

  function getMatchY(rIdx: number, mIdx: number) {
    const sh = SLOT_H * Math.pow(2, rIdx);
    return mIdx * sh + (sh - MATCH_H) / 2;
  }
  function getMatchCenterY(rIdx: number, mIdx: number) {
    const sh = SLOT_H * Math.pow(2, rIdx);
    return mIdx * sh + sh / 2;
  }
  function getMatchX(rIdx: number) {
    return rIdx * ROUND_COL_W;
  }

  // Build SVG connector paths
  const connectors = useMemo(() => {
    const paths: { key: string; d: string }[] = [];
    for (let rIdx = 0; rIdx < roundNumbers.length - 1; rIdx++) {
      const rNum = roundNumbers[rIdx];
      const rMatches = rounds[rNum] ?? [];
      rMatches.forEach((_, mIdx) => {
        const sx = getMatchX(rIdx) + MATCH_W;
        const sy = getMatchCenterY(rIdx, mIdx);
        const tx = getMatchX(rIdx + 1);
        const ty = getMatchCenterY(rIdx + 1, Math.floor(mIdx / 2));
        const mx = sx + CONN_W / 2;
        paths.push({
          key: `${rIdx}-${mIdx}`,
          d: `M ${sx} ${sy} L ${mx} ${sy} L ${mx} ${ty} L ${tx} ${ty}`,
        });
      });
    }
    return paths;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rounds, roundNumbers]);

  // Selected match data
  const selectedMatch = useMemo(
    () => matches.find((m) => m.id === selectedMatchId) ?? null,
    [matches, selectedMatchId]
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <svg className="w-8 h-8 animate-spin text-violet-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm text-gray-500">Loading bracket...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans">
      <Navbar username={username} />

      {/* ── Tab nav ────────────────────────────────────────────── */}
      <div className="border-b border-white/8 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10 mt-16">
        <div className="max-w-6xl mx-auto px-6">
          <nav className="flex items-center gap-0 -mb-px">
            <a href={`/tournaments/${tournamentId}`} className="px-4 py-3.5 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-600 transition-all duration-150">Overview</a>
            <a href={`/tournaments/${tournamentId}`} className="px-4 py-3.5 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-600 transition-all duration-150">Participants</a>
            <span className="px-4 py-3.5 text-sm font-medium border-b-2 border-violet-500 text-violet-400">Bracket</span>
            <a href={`/tournaments/${tournamentId}/rules`} className="px-4 py-3.5 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-600 transition-all duration-150">Rules</a>
          </nav>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-6 py-6 space-y-5">

        {/* ── Top bar ──────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-white">Bracket</h1>
            <p className="text-xs text-gray-500 mt-0.5">{registrations.length} teams registered</p>
          </div>
          {isAdmin && (
            <button
              onClick={generateBracket}
              disabled={generating || registrations.length < 2}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-all duration-200"
            >
              {generating ? (
                <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>Generating...</>
              ) : "Generate Bracket"}
            </button>
          )}
        </div>

        {/* ── Toasts ───────────────────────────────────────────── */}
        {mutationSuccess && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {mutationSuccess}
          </div>
        )}
        {mutationError && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9.303 3.376c.866 1.5-.217 3.374-1.948 3.374H4.645c-1.73 0-2.813-1.874-1.948-3.374L10.05 3.378c.866-1.5 3.032-1.5 3.898 0L21.303 16.126z" />
            </svg>
            {mutationError}
          </div>
        )}

        {/* ── Bracket visual ───────────────────────────────────── */}
        {matches.length === 0 ? (
          <div className="rounded-2xl border border-white/8 bg-white/4 p-16 flex flex-col items-center justify-center text-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/8 flex items-center justify-center">
              <svg className="w-7 h-7 text-gray-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
              </svg>
            </div>
            <div>
              <p className="text-white font-semibold">No bracket yet</p>
              <p className="text-gray-500 text-sm mt-1">
                {isAdmin ? "Click Generate Bracket above to create matches" : "Bracket will appear when the admin generates it"}
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/8 bg-white/4 p-6">
            {/* Round header labels */}
            <div className="flex mb-4" style={{ width: canvasW, minWidth: canvasW }}>
              {roundNumbers.map((_, rIdx) => (
                <div
                  key={rIdx}
                  style={{ width: rIdx < numRounds - 1 ? ROUND_COL_W : MATCH_W }}
                  className="text-center"
                >
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {roundLabel(rIdx, numRounds)}
                  </span>
                </div>
              ))}
            </div>

            {/* Horizontal scrollable bracket */}
            <div className="overflow-x-auto">
              <div
                className="relative"
                style={{ width: canvasW, height: canvasH, minWidth: canvasW }}
              >
                {/* SVG connector lines */}
                <svg
                  className="absolute inset-0 pointer-events-none"
                  width={canvasW}
                  height={canvasH}
                  style={{ overflow: "visible" }}
                >
                  {connectors.map(({ key, d }) => (
                    <path
                      key={key}
                      d={d}
                      fill="none"
                      stroke="rgba(255,255,255,0.1)"
                      strokeWidth={1.5}
                      strokeLinejoin="round"
                    />
                  ))}
                </svg>

                {/* Match cards */}
                {roundNumbers.map((rNum, rIdx) => {
                  const rMatches = rounds[rNum] ?? [];
                  return rMatches.map((match, mIdx) => {
                    const x = getMatchX(rIdx);
                    const y = getMatchY(rIdx, mIdx);
                    const matchSubs = submissions[match.id] ?? [];
                    const myTeamId =
                      match.team_a_id && captainOfTeams.has(match.team_a_id) ? match.team_a_id :
                      match.team_b_id && captainOfTeams.has(match.team_b_id) ? match.team_b_id :
                      null;
                    const hasAction = !match.winner_id && (isAdmin || !!myTeamId);
                    const isSelected = selectedMatchId === match.id;
                    const mySubmission = myTeamId ? matchSubs.find((s) => s.team_id === myTeamId) : null;
                    const needsSubmit = !!myTeamId && !match.winner_id && !mySubmission;
                    const teamASubmission = matchSubs.find((s) => s.team_id === match.team_a_id);
                    const teamBSubmission = matchSubs.find((s) => s.team_id === match.team_b_id);
                    const bothSub = !!(teamASubmission && teamBSubmission);
                    const disputed = bothSub && teamASubmission.claimed_winner_id !== teamBSubmission.claimed_winner_id;

                    return (
                      <button
                        key={match.id}
                        onClick={() => setSelectedMatchId(isSelected ? null : match.id)}
                        style={{
                          position: "absolute",
                          left: x,
                          top: y,
                          width: MATCH_W,
                          height: MATCH_H,
                        }}
                        className={`text-left rounded-xl border overflow-hidden transition-all duration-200 focus:outline-none ${
                          isSelected
                            ? "border-violet-500/60 bg-violet-500/10 shadow-lg shadow-violet-500/10"
                            : needsSubmit
                            ? "border-amber-500/40 bg-amber-500/5 hover:border-amber-500/60"
                            : match.winner_id
                            ? "border-white/10 bg-gray-900/60 hover:border-white/20"
                            : "border-white/10 bg-gray-900/80 hover:border-violet-500/40"
                        }`}
                      >
                        {/* Team A row */}
                        <div className={`flex items-center gap-2 px-3 py-2 ${
                          match.winner_id === match.team_a_id
                            ? "bg-green-500/10"
                            : match.winner_id && match.winner_id !== match.team_a_id
                            ? "opacity-40"
                            : ""
                        }`}>
                          <span className="text-[10px] font-bold text-violet-300/80 w-7 shrink-0 truncate">
                            {match.team_a?.team_tag ?? "—"}
                          </span>
                          <span className="text-xs font-medium text-white flex-1 truncate leading-tight">
                            {match.team_a?.team_name ?? "TBD"}
                          </span>
                          {match.winner_id === match.team_a_id && (
                            <svg className="w-3.5 h-3.5 text-green-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>

                        {/* Divider */}
                        <div className="h-px bg-white/5 mx-2" />

                        {/* Team B row */}
                        <div className={`flex items-center gap-2 px-3 py-2 ${
                          match.winner_id === match.team_b_id
                            ? "bg-green-500/10"
                            : match.winner_id && match.winner_id !== match.team_b_id
                            ? "opacity-40"
                            : !match.team_b_id
                            ? "opacity-30"
                            : ""
                        }`}>
                          <span className="text-[10px] font-bold text-violet-300/80 w-7 shrink-0 truncate">
                            {match.team_b?.team_tag ?? "—"}
                          </span>
                          <span className="text-xs font-medium text-white flex-1 truncate leading-tight">
                            {match.team_b_id ? (match.team_b?.team_name ?? "TBD") : "BYE"}
                          </span>
                          {match.winner_id === match.team_b_id && (
                            <svg className="w-3.5 h-3.5 text-green-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>

                        {/* Status indicator strip */}
                        {(disputed || needsSubmit || (hasAction && !match.winner_id)) && (
                          <div className={`h-0.5 w-full ${
                            disputed ? "bg-red-500/60" :
                            needsSubmit ? "bg-amber-500/60" :
                            "bg-violet-500/30"
                          }`} />
                        )}
                      </button>
                    );
                  });
                })}
              </div>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-5 mt-5 pt-4 border-t border-white/6">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-green-500/40 border border-green-500/60" />
                <span className="text-[10px] text-gray-500">Winner confirmed</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-amber-500/40 border border-amber-500/60" />
                <span className="text-[10px] text-gray-500">Needs your submission</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-violet-500/40 border border-violet-500/60" />
                <span className="text-[10px] text-gray-500">Selected</span>
              </div>
              <span className="text-[10px] text-gray-600 ml-auto">Click any match for details</span>
            </div>
          </div>
        )}

        {/* ── Selected match panel ─────────────────────────────── */}
        {selectedMatch && (() => {
          const match = selectedMatch;
          const matchSubs = submissions[match.id] ?? [];
          const teamASubmission = matchSubs.find((s) => s.team_id === match.team_a_id);
          const teamBSubmission = matchSubs.find((s) => s.team_id === match.team_b_id);
          const bothSubmitted = !!(teamASubmission && teamBSubmission);
          const agreed = bothSubmitted && teamASubmission.claimed_winner_id === teamBSubmission.claimed_winner_id;
          const disputed = bothSubmitted && !agreed;
          const myTeamId =
            match.team_a_id && captainOfTeams.has(match.team_a_id) ? match.team_a_id :
            match.team_b_id && captainOfTeams.has(match.team_b_id) ? match.team_b_id :
            null;
          const mySubmission = myTeamId ? matchSubs.find((s) => s.team_id === myTeamId) : null;
          const isCaptainInMatch = !!myTeamId && !match.winner_id;
          const form = getSubmitForm(match.id);

          return (
            <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 overflow-hidden">
              {/* Panel header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">
                    Round {match.round} · Match {match.match_number}
                  </p>
                  {match.scheduled_at && (
                    <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {fmtSchedule(match.scheduled_at)}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setSelectedMatchId(null)}
                  className="text-gray-600 hover:text-gray-400 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="p-6 space-y-5">
                {/* Teams side by side */}
                <div className="flex items-center gap-4">
                  <div className={`flex-1 flex items-center gap-3 px-4 py-3 rounded-xl border ${
                    match.winner_id === match.team_a_id
                      ? "bg-green-500/10 border-green-500/25"
                      : match.winner_id
                      ? "bg-white/3 border-white/8 opacity-50"
                      : "bg-white/5 border-white/10"
                  }`}>
                    <div className="w-9 h-9 rounded-xl bg-violet-500/20 border border-violet-500/20 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-violet-300">{match.team_a?.team_tag ?? "?"}</span>
                    </div>
                    <span className="text-sm font-semibold text-white flex-1 truncate">{match.team_a?.team_name ?? "TBD"}</span>
                    {match.winner_id === match.team_a_id && (
                      <span className="text-xs font-bold text-green-400">WIN</span>
                    )}
                  </div>

                  <span className="text-xs text-gray-600 font-bold shrink-0">VS</span>

                  <div className={`flex-1 flex items-center gap-3 px-4 py-3 rounded-xl border ${
                    match.winner_id === match.team_b_id
                      ? "bg-green-500/10 border-green-500/25"
                      : match.winner_id
                      ? "bg-white/3 border-white/8 opacity-50"
                      : !match.team_b_id
                      ? "bg-white/3 border-white/8 opacity-40"
                      : "bg-white/5 border-white/10"
                  }`}>
                    <div className="w-9 h-9 rounded-xl bg-violet-500/20 border border-violet-500/20 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-violet-300">{match.team_b?.team_tag ?? "—"}</span>
                    </div>
                    <span className="text-sm font-semibold text-white flex-1 truncate">
                      {match.team_b_id ? (match.team_b?.team_name ?? "TBD") : "BYE"}
                    </span>
                    {match.winner_id === match.team_b_id && (
                      <span className="text-xs font-bold text-green-400">WIN</span>
                    )}
                  </div>
                </div>

                {/* Score display */}
                {match.winner_id && (match.score_a !== null || match.score_b !== null) && (
                  <p className="text-sm text-gray-400 text-center">
                    Final score: <span className="font-semibold text-white">{match.score_a ?? 0} – {match.score_b ?? 0}</span>
                  </p>
                )}

                {/* Submission status badges */}
                {!match.winner_id && match.team_a_id && match.team_b_id && (
                  <div className="flex flex-wrap gap-2">
                    {[
                      { sub: teamASubmission, team: match.team_a },
                      { sub: teamBSubmission, team: match.team_b },
                    ].map(({ sub, team }) => (
                      <span
                        key={team?.team_tag ?? "?"}
                        className={`text-xs px-3 py-1 rounded-full border font-medium ${
                          sub
                            ? "bg-violet-500/15 border-violet-500/30 text-violet-400"
                            : "bg-white/5 border-white/10 text-gray-500"
                        }`}
                      >
                        {team?.team_tag ?? "?"} — {sub ? "submitted" : "pending"}
                      </span>
                    ))}
                    {disputed && (
                      <span className="text-xs px-3 py-1 rounded-full border bg-red-500/15 border-red-500/30 text-red-400 font-medium">
                        ⚠ Disputed — admin review needed
                      </span>
                    )}
                  </div>
                )}

                {/* Admin: view submission details */}
                {isAdmin && !match.winner_id && matchSubs.length > 0 && (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
                    <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider">Submitted Results</p>
                    {matchSubs.map((sub) => {
                      const subTeam = sub.team_id === match.team_a_id ? match.team_a : match.team_b;
                      const claimedTeam = sub.claimed_winner_id === match.team_a_id ? match.team_a : match.team_b;
                      return (
                        <div key={sub.team_id} className="flex items-start gap-3">
                          <span className="text-[10px] font-bold text-gray-400 shrink-0 mt-0.5">{subTeam?.team_tag ?? "?"}:</span>
                          <div className="flex-1 space-y-0.5">
                            <p className="text-xs text-white">
                              Claims <span className="font-semibold text-green-400">{claimedTeam?.team_name ?? "?"}</span> won
                              {(sub.score_a !== null || sub.score_b !== null) && (
                                <span className="text-gray-400 ml-1">({sub.score_a ?? 0} – {sub.score_b ?? 0})</span>
                              )}
                            </p>
                            {sub.proof_url && (
                              <a href={sub.proof_url} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[10px] text-violet-400 hover:text-violet-300 transition-colors">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                                </svg>
                                View screenshot
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Admin: set winner */}
                {isAdmin && !match.winner_id && match.team_a_id && match.team_b_id && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 shrink-0">Set winner:</span>
                    <button
                      onClick={() => handleSetWinner(match, match.team_a_id!, match.team_b_id!)}
                      disabled={updatingId === match.id}
                      className="flex-1 py-2 rounded-xl bg-violet-600/20 hover:bg-violet-600/40 border border-violet-500/30 text-violet-300 text-xs font-semibold transition-all duration-200 disabled:opacity-50"
                    >
                      {match.team_a?.team_name ?? "Team A"} wins
                    </button>
                    <button
                      onClick={() => handleSetWinner(match, match.team_b_id!, match.team_a_id!)}
                      disabled={updatingId === match.id}
                      className="flex-1 py-2 rounded-xl bg-violet-600/20 hover:bg-violet-600/40 border border-violet-500/30 text-violet-300 text-xs font-semibold transition-all duration-200 disabled:opacity-50"
                    >
                      {match.team_b?.team_name ?? "Team B"} wins
                    </button>
                  </div>
                )}

                {/* Captain submission form */}
                {isCaptainInMatch && myTeamId && (
                  <div className="border-t border-white/8 pt-5 space-y-4">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      {mySubmission ? "Update your result" : "Submit your result"}
                    </p>

                    {/* Who won */}
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500 shrink-0 w-14">Winner:</span>
                      <div className="flex gap-2 flex-1">
                        {[
                          { id: match.team_a_id!, tag: match.team_a?.team_tag ?? "A", name: match.team_a?.team_name ?? "Team A" },
                          { id: match.team_b_id!, tag: match.team_b?.team_tag ?? "B", name: match.team_b?.team_name ?? "Team B" },
                        ].map(({ id, tag, name }) => (
                          <button
                            key={id}
                            onClick={() => patchSubmitForm(match.id, { claimedWinner: id })}
                            className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all duration-200 ${
                              form.claimedWinner === id
                                ? "bg-green-500/15 border-green-500/35 text-green-300"
                                : "bg-white/5 border-white/10 text-gray-400 hover:text-white hover:border-white/20"
                            }`}
                          >
                            <span className="font-bold text-violet-300/80">{tag}</span>
                            <span className="truncate">{name}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Score */}
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500 shrink-0 w-14">Score:</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="number" min="0"
                          placeholder={match.team_a?.team_tag}
                          value={form.scoreA}
                          onChange={(e) => patchSubmitForm(match.id, { scoreA: e.target.value })}
                          className="w-16 px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs text-center focus:outline-none focus:border-violet-500"
                        />
                        <span className="text-xs text-gray-600">–</span>
                        <input
                          type="number" min="0"
                          placeholder={match.team_b?.team_tag}
                          value={form.scoreB}
                          onChange={(e) => patchSubmitForm(match.id, { scoreB: e.target.value })}
                          className="w-16 px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs text-center focus:outline-none focus:border-violet-500"
                        />
                      </div>
                    </div>

                    {/* Proof upload */}
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500 shrink-0 w-14">Screenshot:</span>
                      <label className="cursor-pointer">
                        <div className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-gray-300 text-xs font-medium transition-all duration-200 inline-block">
                          {form.proofFile ? form.proofFile.name : "Choose image"}
                        </div>
                        <input type="file" accept="image/*" className="hidden"
                          onChange={(e) => patchSubmitForm(match.id, { proofFile: e.target.files?.[0] ?? null })} />
                      </label>
                      {form.proofFile && (
                        <button onClick={() => patchSubmitForm(match.id, { proofFile: null })}
                          className="text-gray-600 hover:text-gray-400 text-xs">✕</button>
                      )}
                    </div>

                    {form.error && <p className="text-xs text-red-400">{form.error}</p>}

                    {mySubmission && (
                      <p className="text-[10px] text-gray-600">
                        Already submitted — you can resubmit to update.
                      </p>
                    )}

                    <button
                      onClick={() => handleSubmitResult(match, myTeamId)}
                      disabled={form.submitting || form.uploading}
                      className="px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold transition-all duration-200"
                    >
                      {form.uploading ? "Uploading image..." : form.submitting ? "Submitting..." : mySubmission ? "Resubmit" : "Submit Result"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

      </main>
    </div>
  );
}
