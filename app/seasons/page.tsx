"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";

function isSafeImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try { return new URL(url).protocol === "https:"; } catch { return false; }
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Season = {
  id: string;
  name: string;
  status: string;
  rules: string | null;
  created_at: string;
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

type SeasonQueueEntry = {
  id: string;
  season_id: string;
  team_id: string;
  captain_id: string;
  status: string;
  created_at: string;
};

type SeasonMatch = {
  id: string;
  season_id: string;
  team_a_id: string;
  team_b_id: string;
  team_a_result: "won" | "lost" | null;
  team_b_result: "won" | "lost" | null;
  team_a_screenshot_url: string | null;
  team_b_screenshot_url: string | null;
  status: "pending" | "confirmed" | "disputed";
  winner_team_id: string | null;
  created_at: string;
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function SeasonsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  // ── Core state ───────────────────────────────────────────────────────────────
  const [username, setUsername] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<Season | null>(null);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingStandings, setLoadingStandings] = useState(false);

  // ── Captain / team state ─────────────────────────────────────────────────────
  const [captainTeamId, setCaptainTeamId] = useState<string | null>(null);
  const [captainTeamName, setCaptainTeamName] = useState<string | null>(null);

  // ── Season queue state ───────────────────────────────────────────────────────
  const [seasonQueueEntries, setSeasonQueueEntries] = useState<SeasonQueueEntry[]>([]);
  const [inSeasonQueue, setInSeasonQueue] = useState(false);
  const [seasonQueueEntryId, setSeasonQueueEntryId] = useState<string | null>(null);
  const [joiningQueue, setJoiningQueue] = useState(false);
  const [queueError, setQueueError] = useState("");

  // ── Season match state ───────────────────────────────────────────────────────
  const [seasonMatch, setSeasonMatch] = useState<SeasonMatch | null>(null);
  const [opponentTeamName, setOpponentTeamName] = useState<string | null>(null);
  const [pendingResult, setPendingResult] = useState<"won" | "lost" | null>(null);
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [submittingResult, setSubmittingResult] = useState(false);
  const [resultError, setResultError] = useState("");
  const [mySubmittedResult, setMySubmittedResult] = useState<"won" | "lost" | null>(null);
  const [matchResolved, setMatchResolved] = useState(false);
  const [iWon, setIWon] = useState<boolean | null>(null);
  const [matchDisputed, setMatchDisputed] = useState(false);

  // ── Refs (stable values for async callbacks) ─────────────────────────────────
  const captainTeamIdRef = useRef<string | null>(null);
  const inSeasonQueueRef = useRef(false);
  const seasonQueueEntryIdRef = useRef<string | null>(null);
  const seasonMatchAttempted = useRef(false);
  const seasonStandingsApplied = useRef(false);

  // ── Derived ──────────────────────────────────────────────────────────────────
  const teamInSeason = useMemo(
    () => !!(captainTeamId && standings.some((s) => s.team_id === captainTeamId)),
    [captainTeamId, standings]
  );
  const waitingCount = seasonQueueEntries.filter((e) => e.status === "waiting").length;

  // ── Load profile, seasons, captain team ──────────────────────────────────────
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/sign-in"); return; }

      setUserId(user.id);

      const { data: profile } = await supabase
        .from("profiles")
        .select("username, is_admin, role")
        .eq("id", user.id)
        .maybeSingle();

      setUsername(profile?.username ?? null);
      setIsAdmin(!!(profile?.is_admin || profile?.role === "owner" || profile?.role === "admin"));
      setIsOwner(profile?.role === "owner");

      const { data: captainTeam } = await supabase
        .from("teams")
        .select("id, team_name")
        .eq("captain_id", user.id)
        .maybeSingle();

      if (captainTeam) {
        setCaptainTeamId(captainTeam.id as string);
        captainTeamIdRef.current = captainTeam.id as string;
        setCaptainTeamName(captainTeam.team_name as string);
      }

      const { data: seasonsData } = await supabase
        .from("seasons")
        .select("id, name, status, rules, created_at")
        .order("created_at", { ascending: false });

      setSeasons(seasonsData ?? []);

      if (seasonsData && seasonsData.length > 0) {
        setSelectedSeason(seasonsData[0]);
        await loadStandings(seasonsData[0].id);
      }

      setLoading(false);
    }
    load();
  }, [supabase, router]);

  // ── Load queue + match state when selected season / captain changes ───────────
  useEffect(() => {
    if (!selectedSeason || !userId || !captainTeamId) return;

    let cancelled = false;

    // Reset matchmaking state for new season
    setSeasonQueueEntries([]);
    setInSeasonQueue(false);
    inSeasonQueueRef.current = false;
    setSeasonQueueEntryId(null);
    seasonQueueEntryIdRef.current = null;
    setSeasonMatch(null);
    setOpponentTeamName(null);
    setPendingResult(null);
    setScreenshotFile(null);
    setResultError("");
    setMySubmittedResult(null);
    setMatchResolved(false);
    setIWon(null);
    setMatchDisputed(false);
    seasonMatchAttempted.current = false;
    seasonStandingsApplied.current = false;

    (async () => {
      const { data: queueData } = await supabase
        .from("scrim_queue")
        .select("id, season_id, team_id, captain_id, status, created_at")
        .eq("season_id", selectedSeason.id)
        .eq("status", "waiting")
        .order("created_at", { ascending: true });

      if (cancelled) return;

      const entries = (queueData ?? []) as SeasonQueueEntry[];
      setSeasonQueueEntries(entries);

      const myEntry = entries.find((e) => e.captain_id === userId);
      if (myEntry) {
        setInSeasonQueue(true);
        inSeasonQueueRef.current = true;
        setSeasonQueueEntryId(myEntry.id);
        seasonQueueEntryIdRef.current = myEntry.id;
      }

      const { data: matchData } = await supabase
        .from("season_match_results")
        .select("id, season_id, team_a_id, team_b_id, team_a_result, team_b_result, team_a_screenshot_url, team_b_screenshot_url, status, winner_team_id, created_at")
        .eq("season_id", selectedSeason.id)
        .eq("status", "pending")
        .or(`team_a_id.eq.${captainTeamId},team_b_id.eq.${captainTeamId}`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;

      if (matchData) {
        const match = matchData as SeasonMatch;
        setSeasonMatch(match);
        const myTeamIsA = match.team_a_id === captainTeamId;
        const myRes = myTeamIsA ? match.team_a_result : match.team_b_result;
        if (myRes) setMySubmittedResult(myRes);
      }
    })();

    return () => { cancelled = true; };
  }, [selectedSeason?.id, userId, captainTeamId, supabase]);

  // ── Realtime: season queue ───────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedSeason) return;

    const ch = supabase
      .channel(`season-mm-queue:${selectedSeason.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "scrim_queue",
        filter: `season_id=eq.${selectedSeason.id}`,
      }, (payload) => {
        const entry = payload.new as SeasonQueueEntry;
        if (entry.status !== "waiting") return;
        setSeasonQueueEntries((prev) =>
          prev.find((e) => e.id === entry.id) ? prev : [...prev, entry]
        );
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "scrim_queue",
        filter: `season_id=eq.${selectedSeason.id}`,
      }, (payload) => {
        const entry = payload.new as SeasonQueueEntry;
        if (entry.status !== "waiting") {
          setSeasonQueueEntries((prev) => prev.filter((e) => e.id !== entry.id));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [selectedSeason?.id, supabase]);

  // ── Realtime: season match results ───────────────────────────────────────────
  useEffect(() => {
    if (!selectedSeason || !captainTeamId) return;

    const ch = supabase
      .channel(`season-mm-matches:${selectedSeason.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "season_match_results",
        filter: `season_id=eq.${selectedSeason.id}`,
      }, (payload) => {
        if (!inSeasonQueueRef.current) return;
        const match = payload.new as SeasonMatch;
        const cId = captainTeamIdRef.current;
        if (match.team_a_id !== cId && match.team_b_id !== cId) return;

        setSeasonMatch(match);
        setInSeasonQueue(false);
        inSeasonQueueRef.current = false;
        setSeasonQueueEntryId(null);
        seasonQueueEntryIdRef.current = null;
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "season_match_results",
        filter: `season_id=eq.${selectedSeason.id}`,
      }, (payload) => {
        const updated = payload.new as SeasonMatch;
        const cId = captainTeamIdRef.current;
        if (updated.team_a_id !== cId && updated.team_b_id !== cId) return;
        setSeasonMatch(updated);
      })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [selectedSeason?.id, captainTeamId, supabase]);

  // ── Fetch opponent name when match is set ────────────────────────────────────
  useEffect(() => {
    if (!seasonMatch || !captainTeamId) return;
    const oppId = seasonMatch.team_a_id === captainTeamId
      ? seasonMatch.team_b_id
      : seasonMatch.team_a_id;
    supabase.from("teams").select("team_name").eq("id", oppId).maybeSingle()
      .then(({ data }) => setOpponentTeamName((data?.team_name as string) ?? null));
  }, [seasonMatch?.id, captainTeamId, supabase]);

  // ── Auto-create match when 2 teams queued ────────────────────────────────────
  useEffect(() => {
    if (!inSeasonQueue || seasonMatchAttempted.current || seasonMatch) return;
    if (!selectedSeason || !captainTeamId) return;

    const waiting = [...seasonQueueEntries]
      .filter((e) => e.status === "waiting")
      .sort((a, b) => a.created_at.localeCompare(b.created_at));

    if (waiting.length < 2) return;
    // Only the oldest captain creates the match to prevent race conditions
    if (waiting[0].id !== seasonQueueEntryIdRef.current) return;

    seasonMatchAttempted.current = true;

    const teamAId = waiting[0].team_id;
    const teamBId = waiting[1].team_id;

    (async () => {
      const { data: newMatch, error: matchErr } = await supabase
        .from("season_match_results")
        .insert({ season_id: selectedSeason.id, team_a_id: teamAId, team_b_id: teamBId, status: "pending" })
        .select()
        .single();

      if (matchErr) {
        // 23505 = unique_violation: another client won the race and created the match first.
        // Don't reset the flag — realtime will deliver the match row.
        if ((matchErr as { code?: string }).code !== "23505") {
          seasonMatchAttempted.current = false;
        }
        return;
      }

      await supabase.from("scrim_queue")
        .update({ status: "matched" })
        .in("id", [waiting[0].id, waiting[1].id]);

      setSeasonMatch(newMatch as SeasonMatch);
      setInSeasonQueue(false);
      inSeasonQueueRef.current = false;
      setSeasonQueueEntryId(null);
      seasonQueueEntryIdRef.current = null;
    })();
  }, [seasonQueueEntries, inSeasonQueue, seasonMatch, selectedSeason, captainTeamId, supabase]);

  // ── Resolve match when both results are in ───────────────────────────────────
  useEffect(() => {
    if (!seasonMatch || !captainTeamId) return;
    if (!seasonMatch.team_a_result || !seasonMatch.team_b_result) return;

    const myTeamIsA = seasonMatch.team_a_id === captainTeamId;
    const myRes = myTeamIsA ? seasonMatch.team_a_result : seasonMatch.team_b_result;
    const oppRes = myTeamIsA ? seasonMatch.team_b_result : seasonMatch.team_a_result;
    const agree = (myRes === "won" && oppRes === "lost") || (myRes === "lost" && oppRes === "won");
    const won = myRes === "won";

    setMatchResolved(true);
    setMatchDisputed(!agree);
    setIWon(won);

    // Already resolved by a previous run or by the other client — just update UI
    if (seasonMatch.status === "confirmed" || seasonMatch.status === "disputed") return;
    if (seasonStandingsApplied.current) return;
    seasonStandingsApplied.current = true;

    const winnerId = won
      ? captainTeamId
      : (myTeamIsA ? seasonMatch.team_b_id : seasonMatch.team_a_id);

    (async () => {
      // team_a captain is the single writer for match status to avoid conflicts
      if (myTeamIsA) {
        await supabase.from("season_match_results")
          .update({ status: agree ? "confirmed" : "disputed", ...(agree && { winner_team_id: winnerId }) })
          .eq("id", seasonMatch.id);
      }

      if (!agree) return;

      // Each captain independently updates their own team's standing
      const { data: standing } = await supabase
        .from("season_standings")
        .select("id, points, wins, losses")
        .eq("season_id", seasonMatch.season_id)
        .eq("team_id", captainTeamId)
        .maybeSingle();

      if (!standing) return;

      await supabase.rpc("update_standing_result", {
        p_season_id: seasonMatch.season_id,
        p_team_id:   captainTeamId,
        p_won:       won,
      });

      if (selectedSeason) await loadStandings(selectedSeason.id);
    })();
  }, [seasonMatch?.team_a_result, seasonMatch?.team_b_result, seasonMatch?.status, captainTeamId, supabase, selectedSeason?.id]);

  // ── Standings helpers ─────────────────────────────────────────────────────────
  async function loadStandings(seasonId: string) {
    setLoadingStandings(true);
    const { data } = await supabase
      .from("season_standings")
      .select("id, team_id, points, wins, losses, teams(team_name, team_tag, logo_url)")
      .eq("season_id", seasonId)
      .order("points", { ascending: false });
    setStandings((data ?? []) as unknown as Standing[]);
    setLoadingStandings(false);
  }

  async function handleSeasonChange(season: Season) {
    setSelectedSeason(season);
    await loadStandings(season.id);
  }

  // ── Matchmaking handlers ──────────────────────────────────────────────────────
  async function handleJoinSeasonQueue() {
    if (!selectedSeason || !captainTeamId) return;
    setJoiningQueue(true);
    setQueueError("");

    const { data: { user: freshUser } } = await supabase.auth.getUser();
    if (!freshUser) { router.push("/sign-in"); setJoiningQueue(false); return; }
    const freshUserId = freshUser.id;

    const { data: myMembers } = await supabase
      .from("team_members")
      .select("user_id")
      .eq("team_id", captainTeamId);

    const myUserIds = (myMembers ?? []).map((m: { user_id: string }) => m.user_id);
    const otherTeamIds = standings
      .filter((s) => s.team_id !== captainTeamId)
      .map((s) => s.team_id);

    if (otherTeamIds.length > 0) {
      const { data: otherMembers } = await supabase
        .from("team_members")
        .select("user_id")
        .in("team_id", otherTeamIds);

      const otherUserIds = new Set((otherMembers ?? []).map((m: { user_id: string }) => m.user_id));
      if (myUserIds.some((uid) => otherUserIds.has(uid))) {
        setQueueError("One or more players are already registered in this season with another team.");
        setJoiningQueue(false);
        return;
      }
    }

    const { data: row, error } = await supabase
      .from("scrim_queue")
      .insert({
        season_id: selectedSeason.id,
        team_id: captainTeamId,
        captain_id: freshUserId,
        status: "waiting",
        party_size: 1,
        activision_ids: [],
        user_ids: [freshUserId],
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23514" || error.message?.includes("at least 4 members")) {
        setQueueError(error.message ?? "Your team must have at least 4 members to join the queue.");
      } else {
        setQueueError("Failed to join queue. Please try again.");
      }
      setJoiningQueue(false);
      return;
    }

    const entryId = row.id as string;
    setSeasonQueueEntryId(entryId);
    seasonQueueEntryIdRef.current = entryId;
    setInSeasonQueue(true);
    inSeasonQueueRef.current = true;
    seasonMatchAttempted.current = false;
    setJoiningQueue(false);
  }

  async function handleLeaveSeasonQueue() {
    const { data: { user: freshUser } } = await supabase.auth.getUser();
    if (!freshUser) { router.push("/sign-in"); return; }

    if (seasonQueueEntryId) {
      await supabase.from("scrim_queue").delete().eq("id", seasonQueueEntryId).eq("captain_id", freshUser.id);
    }
    setSeasonQueueEntryId(null);
    seasonQueueEntryIdRef.current = null;
    setInSeasonQueue(false);
    inSeasonQueueRef.current = false;
    seasonMatchAttempted.current = false;
    setQueueError("");
  }

  async function handleSubmitResult() {
    if (!seasonMatch || !captainTeamId || submittingResult || !pendingResult) return;
    if (pendingResult === "won" && !screenshotFile) return;

    setSubmittingResult(true);
    setResultError("");

    const { data: { user: freshUser } } = await supabase.auth.getUser();
    if (!freshUser) { router.push("/sign-in"); setSubmittingResult(false); return; }

    const { data: freshCaptainTeam } = await supabase
      .from("teams")
      .select("id")
      .eq("captain_id", freshUser.id)
      .maybeSingle();

    if (!freshCaptainTeam) {
      setResultError("You are no longer a team captain.");
      setSubmittingResult(false);
      return;
    }
    const freshCaptainTeamId = freshCaptainTeam.id as string;

    const myTeamIsA = seasonMatch.team_a_id === freshCaptainTeamId;
    let screenshotUrl: string | null = null;

    if (pendingResult === "won" && screenshotFile) {
      if (screenshotFile.size > 5 * 1024 * 1024) {
        setResultError("Screenshot must be under 5MB.");
        setSubmittingResult(false);
        return;
      }

      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from("match-screenshots")
        .upload(`${seasonMatch.id}/${freshCaptainTeamId}.png`, screenshotFile, { upsert: true });

      if (uploadErr) {
        setResultError("Failed to upload screenshot. Please try again.");
        setSubmittingResult(false);
        return;
      }

      const { data: { publicUrl } } = supabase.storage
        .from("match-screenshots")
        .getPublicUrl(uploadData.path);
      screenshotUrl = publicUrl;
    }

    const updateData = myTeamIsA
      ? { team_a_result: pendingResult, ...(screenshotUrl ? { team_a_screenshot_url: screenshotUrl } : {}) }
      : { team_b_result: pendingResult, ...(screenshotUrl ? { team_b_screenshot_url: screenshotUrl } : {}) };

    const { error } = await supabase
      .from("season_match_results")
      .update(updateData)
      .eq("id", seasonMatch.id);

    if (error) {
      setResultError("Failed to submit result. Please try again.");
      setSubmittingResult(false);
      return;
    }

    setMySubmittedResult(pendingResult);
    setSubmittingResult(false);
  }

  function handleResetMatch() {
    setSeasonMatch(null);
    setOpponentTeamName(null);
    setPendingResult(null);
    setScreenshotFile(null);
    setResultError("");
    setMySubmittedResult(null);
    setMatchResolved(false);
    setIWon(null);
    setMatchDisputed(false);
    seasonMatchAttempted.current = false;
    seasonStandingsApplied.current = false;
  }

  // ── Misc helpers ──────────────────────────────────────────────────────────────
  function statusLabel(status: string) {
    switch (status) {
      case "active": return { label: "Active", color: "bg-green-500/15 border-green-500/30 text-green-400" };
      case "completed": return { label: "Completed", color: "bg-gray-500/15 border-gray-500/30 text-gray-400" };
      default: return { label: status, color: "bg-yellow-500/15 border-yellow-500/30 text-yellow-400" };
    }
  }

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <svg className="w-8 h-8 animate-spin text-violet-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm text-gray-500">Loading seasons...</span>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans">
      <Navbar username={username} />

      <main className="max-w-3xl mx-auto px-6 pt-28 pb-20 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">Seasons</h1>
            <p className="text-sm text-gray-500 mt-1">Season standings and points</p>
          </div>
          {isOwner && (
            <a
              href="/admin/seasons/new"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-all duration-200 shadow-lg shadow-violet-900/40"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              New Season
            </a>
          )}
        </div>

        {seasons.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-12 flex flex-col items-center justify-center text-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <svg className="w-7 h-7 text-gray-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0" />
              </svg>
            </div>
            <div>
              <p className="text-white font-semibold">No seasons yet</p>
              <p className="text-gray-500 text-sm mt-1">Create a season to start tracking points</p>
            </div>
          </div>
        ) : (
          <>
            {/* Season Tabs */}
            <div className="flex items-center gap-2 flex-wrap">
              {seasons.map((season) => {
                const { label, color } = statusLabel(season.status);
                const isSelected = selectedSeason?.id === season.id;
                return (
                  <div key={season.id} className="flex items-center gap-1">
                    <button
                      onClick={() => handleSeasonChange(season)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all duration-200 ${
                        isSelected
                          ? "border-violet-500/50 bg-violet-500/15 text-white"
                          : "border-white/10 bg-white/5 text-gray-400 hover:text-white hover:bg-white/10"
                      }`}
                    >
                      {season.name}
                      <span className={`px-1.5 py-0.5 rounded-full text-xs border ${color}`}>{label}</span>
                    </button>
                    <a
                      href={`/seasons/${season.id}/rules`}
                      className="px-2 py-1 text-xs text-gray-600 hover:text-gray-300 transition-colors duration-200"
                    >
                      Rules
                    </a>
                  </div>
                );
              })}
            </div>

            {/* Standings */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-white">
                  {selectedSeason?.name} — Standings
                </h2>
                <div className="flex items-center gap-3">
                  {selectedSeason?.rules && (
                    <a
                      href={`/seasons/${selectedSeason.id}/rules`}
                      className="text-xs text-gray-400 hover:text-gray-200 transition-colors duration-200"
                    >
                      Rules →
                    </a>
                  )}
                  {isAdmin && selectedSeason && (
                    <a
                      href={`/admin/seasons/${selectedSeason.id}`}
                      className="text-xs text-violet-400 hover:text-violet-300 transition-colors duration-200"
                    >
                      Manage →
                    </a>
                  )}
                </div>
              </div>

              {loadingStandings ? (
                <div className="flex justify-center py-8">
                  <svg className="w-6 h-6 animate-spin text-violet-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </div>
              ) : standings.length === 0 ? (
                <p className="text-sm text-gray-600 italic text-center py-4">No standings yet</p>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-3 px-4 py-2 text-xs text-gray-500 font-medium">
                    <span className="w-5">#</span>
                    <span className="flex-1">Team</span>
                    <span className="w-12 text-center">W</span>
                    <span className="w-12 text-center">L</span>
                    <span className="w-14 text-center font-semibold text-violet-400">PTS</span>
                  </div>
                  {standings.map((s, index) => (
                    <div
                      key={s.id}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors duration-200 ${
                        index === 0 ? "bg-yellow-500/5 border-yellow-500/20" :
                        index === 1 ? "bg-gray-400/5 border-gray-400/15" :
                        index === 2 ? "bg-orange-500/5 border-orange-500/15" :
                        "bg-white/3 border-white/8"
                      }`}
                    >
                      <span className={`text-xs font-bold w-5 ${
                        index === 0 ? "text-yellow-400" :
                        index === 1 ? "text-gray-300" :
                        index === 2 ? "text-orange-400" :
                        "text-gray-600"
                      }`}>{index + 1}</span>
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/20 to-indigo-600/20 border border-violet-500/20 flex items-center justify-center shrink-0">
                        {isSafeImageUrl(s.teams?.logo_url) ? (
                          <img src={s.teams!.logo_url!} alt={s.teams!.team_name} className="w-full h-full object-cover rounded-lg" />
                        ) : (
                          <span className="text-xs font-bold text-violet-300">{s.teams?.team_tag ?? "?"}</span>
                        )}
                      </div>
                      <span className="text-sm font-medium text-white flex-1">{s.teams?.team_name ?? "Unknown"}</span>
                      <span className="w-12 text-center text-sm text-green-400">{s.wins}</span>
                      <span className="w-12 text-center text-sm text-red-400">{s.losses}</span>
                      <span className="w-14 text-center text-sm font-bold text-violet-400">{s.points}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Season Matchmaking ──────────────────────────────────────────── */}
            {selectedSeason && captainTeamId && teamInSeason && (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">

                <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                  </svg>
                  Season Matchmaking
                </h2>

                {/* ─ Resolved ─ */}
                {matchResolved ? (
                  <div className="space-y-4">
                    {matchDisputed ? (
                      <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/8 p-5 text-center space-y-2">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-yellow-500/15 border border-yellow-500/25 text-yellow-400 text-xs font-medium mb-1">
                          Disputed
                        </div>
                        <p className="text-white font-semibold">Both teams reported conflicting results</p>
                        <p className="text-sm text-gray-400">An admin will review and settle this match.</p>
                      </div>
                    ) : iWon ? (
                      <div className="rounded-xl border border-green-500/30 bg-green-500/8 p-5 text-center space-y-3">
                        <svg className="w-10 h-10 mx-auto text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                        </svg>
                        <p className="text-green-400 font-extrabold text-lg">Victory!</p>
                        <div className="flex items-center justify-center gap-2 flex-wrap">
                          <span className="px-2.5 py-1 rounded-full bg-green-500/15 border border-green-500/25 text-green-400 text-xs font-semibold">+3 season points</span>
                          <span className="px-2.5 py-1 rounded-full bg-violet-500/15 border border-violet-500/25 text-violet-300 text-xs font-semibold">+1 win</span>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-white/10 bg-white/3 p-5 text-center space-y-1">
                        <p className="text-gray-300 font-semibold">Match Complete</p>
                        <p className="text-sm text-gray-500">
                          {opponentTeamName ? `${opponentTeamName} wins this one.` : "Better luck next time."}
                        </p>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={handleResetMatch}
                      className="w-full py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-sm text-gray-400 hover:text-white transition-all duration-200"
                    >
                      Find Another Match
                    </button>
                  </div>

                ) : seasonMatch ? (
                  /* ─ Active match ─ */
                  <div className="space-y-4">
                    {/* Opponent card */}
                    <div className="flex items-center gap-3 p-4 rounded-xl border border-indigo-500/30 bg-indigo-500/8">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-violet-600/20 border border-indigo-500/20 flex items-center justify-center shrink-0">
                        <svg className="w-5 h-5 text-indigo-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Match found — playing against</p>
                        <p className="text-sm font-semibold text-white">{opponentTeamName ?? "Loading…"}</p>
                      </div>
                    </div>

                    {/* Result submission or waiting */}
                    {mySubmittedResult ? (
                      <div className="text-center py-4 space-y-2">
                        <p className="text-sm text-gray-400">
                          Result submitted:{" "}
                          <span className={`font-semibold ${mySubmittedResult === "won" ? "text-green-400" : "text-red-400"}`}>
                            {mySubmittedResult === "won" ? "Won" : "Lost"}
                          </span>
                        </p>
                        <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
                          <svg className="w-3.5 h-3.5 animate-spin text-violet-400" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Waiting for {opponentTeamName ?? "opponent"} to submit…
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Report your result</p>

                        {/* Won / Lost toggle */}
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => { setPendingResult("won"); setScreenshotFile(null); setResultError(""); }}
                            className={`py-3 rounded-xl border text-sm font-semibold transition-all duration-200 ${
                              pendingResult === "won"
                                ? "border-green-500/50 bg-green-500/15 text-green-400"
                                : "border-white/10 bg-white/5 text-gray-400 hover:text-white hover:bg-white/10"
                            }`}
                          >
                            We Won
                          </button>
                          <button
                            type="button"
                            onClick={() => { setPendingResult("lost"); setScreenshotFile(null); setResultError(""); }}
                            className={`py-3 rounded-xl border text-sm font-semibold transition-all duration-200 ${
                              pendingResult === "lost"
                                ? "border-red-500/50 bg-red-500/15 text-red-400"
                                : "border-white/10 bg-white/5 text-gray-400 hover:text-white hover:bg-white/10"
                            }`}
                          >
                            We Lost
                          </button>
                        </div>

                        {/* Screenshot upload (required for wins) */}
                        {pendingResult === "won" && (
                          <div className="space-y-2">
                            <p className="text-xs text-gray-400">
                              Screenshot <span className="text-red-400">required</span>
                            </p>
                            <label className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl border border-dashed cursor-pointer transition-all duration-200 ${
                              screenshotFile
                                ? "border-green-500/40 bg-green-500/8 text-green-400"
                                : "border-white/20 bg-white/3 text-gray-400 hover:border-violet-500/40 hover:text-gray-200"
                            }`}>
                              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                              </svg>
                              <span className="text-sm truncate max-w-[200px]">
                                {screenshotFile ? screenshotFile.name : "Choose screenshot"}
                              </span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => setScreenshotFile(e.target.files?.[0] ?? null)}
                              />
                            </label>
                          </div>
                        )}

                        {resultError && (
                          <p className="text-sm text-red-400">{resultError}</p>
                        )}

                        {/* Submit button */}
                        {pendingResult && (pendingResult === "lost" || screenshotFile) && (
                          <button
                            type="button"
                            onClick={handleSubmitResult}
                            disabled={submittingResult}
                            className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2"
                          >
                            {submittingResult ? (
                              <>
                                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                Submitting…
                              </>
                            ) : "Submit Result"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                ) : inSeasonQueue ? (
                  /* ─ In queue ─ */
                  <div className="flex flex-col items-center gap-4 py-6">
                    <div className="relative w-14 h-14 flex items-center justify-center">
                      <span className="absolute w-14 h-14 rounded-full bg-violet-500/20 animate-ping" />
                      <span className="relative w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500" />
                    </div>
                    <div className="text-center space-y-1">
                      <p className="text-white font-semibold">Searching for opponent…</p>
                      <p className="text-sm text-gray-500">
                        {waitingCount} {waitingCount === 1 ? "team" : "teams"} in queue
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleLeaveSeasonQueue}
                      className="px-5 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-sm text-gray-400 hover:text-white transition-all duration-200"
                    >
                      Leave Queue
                    </button>
                  </div>

                ) : (
                  /* ─ Find Match button ─ */
                  <div className="space-y-3">
                    {queueError && (
                      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                        {queueError}
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm text-gray-400">
                          Compete as{" "}
                          <span className="text-white font-medium">{captainTeamName}</span>
                        </p>
                        {waitingCount > 0 && (
                          <p className="text-xs text-violet-400 mt-0.5">
                            {waitingCount} {waitingCount === 1 ? "team" : "teams"} waiting for a match
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={handleJoinSeasonQueue}
                        disabled={joiningQueue}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-all duration-200 shadow-lg shadow-violet-900/40 shrink-0"
                      >
                        {joiningQueue ? (
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                          </svg>
                        )}
                        {joiningQueue ? "Joining…" : "Find Match"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

          </>
        )}

      </main>
    </div>
  );
}
