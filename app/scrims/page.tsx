"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";

type PartySize = "Solo" | "Duo" | "Trio" | "Stack";

type QueueEntry = {
  id: string;
  party_size: number;
  activision_ids: string[];
  user_ids: string[];
  created_at: string;
};

type ScrimMatch = {
  id: string;
  team_a: string[];
  team_b: string[];
  created_at: string;
};

type VoteSide = "team_a" | "team_b";
type Votes = { team_a: number; team_b: number };

const PARTY_OPTIONS: { label: PartySize; count: number; subtitle: string }[] = [
  { label: "Solo", count: 1, subtitle: "Just me" },
  { label: "Duo", count: 2, subtitle: "2 players" },
  { label: "Trio", count: 3, subtitle: "3 players" },
  { label: "Stack", count: 4, subtitle: "Full team (4)" },
];

export default function ScrimsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  // ── Auth / profile ───────────────────────────────────────────────────────────
  const [username, setUsername] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Queue form ───────────────────────────────────────────────────────────────
  const [partySize, setPartySize] = useState<PartySize>("Solo");
  const [ids, setIds] = useState<string[]>(["", "", "", ""]);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");

  // ── Queue state ──────────────────────────────────────────────────────────────
  const [inQueue, setInQueue] = useState(false);
  const [queueEntryId, setQueueEntryId] = useState<string | null>(null);
  const [queueEntries, setQueueEntries] = useState<QueueEntry[]>([]);

  // ── Match state ──────────────────────────────────────────────────────────────
  const [match, setMatch] = useState<ScrimMatch | null>(null);

  // ── Voting state ─────────────────────────────────────────────────────────────
  const [votes, setVotes] = useState<Votes>({ team_a: 0, team_b: 0 });
  const [hasVoted, setHasVoted] = useState(false);
  const [myVote, setMyVote] = useState<VoteSide | null>(null);
  const [voting, setVoting] = useState(false);
  const [winner, setWinner] = useState<VoteSide | null>(null);

  // ── Refs (stable values for callbacks / async IIFEs) ─────────────────────────
  const myActivisionIdRef = useRef("");
  const userIdRef = useRef<string | null>(null);
  const inQueueRef = useRef(false);
  const matchAttempted = useRef(false);
  const rewardsApplied = useRef(false);

  // ── Load user + initial queue snapshot ───────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/sign-in");
        return;
      }

      const [profileResult, queueResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("username, activision_id")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("scrim_queue")
          .select("*")
          .order("created_at", { ascending: true }),
      ]);

      if (cancelled) return;
      if (!profileResult.data) {
        router.push("/");
        return;
      }

      const activisionId =
        (profileResult.data.activision_id as string | null) ?? "";
      myActivisionIdRef.current = activisionId;
      userIdRef.current = user.id;
      setUserId(user.id);
      setUsername(profileResult.data.username);
      setIds((prev) => {
        const next = [...prev];
        next[0] = activisionId;
        return next;
      });
      setQueueEntries(queueResult.data ?? []);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, router]);

  // ── Queue + match realtime channels (mounted once) ────────────────────────────
  useEffect(() => {
    const queueChannel = supabase
      .channel("scrims:queue")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "scrim_queue" },
        (payload) => {
          const entry = payload.new as QueueEntry;
          setQueueEntries((prev) =>
            prev.find((e) => e.id === entry.id) ? prev : [...prev, entry]
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "scrim_queue" },
        (payload) => {
          const deleted = payload.old as { id: string };
          setQueueEntries((prev) => prev.filter((e) => e.id !== deleted.id));
        }
      )
      .subscribe();

    const matchChannel = supabase
      .channel("scrims:match")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "scrim_match" },
        (payload) => {
          if (!inQueueRef.current) return;
          const newMatch = payload.new as ScrimMatch;
          const myId = myActivisionIdRef.current;
          if (
            myId &&
            (newMatch.team_a.includes(myId) || newMatch.team_b.includes(myId))
          ) {
            setMatch(newMatch);
            setInQueue(false);
            inQueueRef.current = false;
            setQueueEntryId(null);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(queueChannel);
      supabase.removeChannel(matchChannel);
    };
  }, [supabase]);

  // ── Watch queue: create match when 8 players present ─────────────────────────
  useEffect(() => {
    if (!inQueue || matchAttempted.current || match) return;

    const sorted = [...queueEntries].sort((a, b) =>
      a.created_at.localeCompare(b.created_at)
    );
    const totalPlayers = sorted.reduce(
      (n, e) => n + e.activision_ids.length,
      0
    );
    if (totalPlayers < 8) return;
    if (sorted[0]?.id !== queueEntryId) return;

    matchAttempted.current = true;

    const allIds = sorted.flatMap((e) => e.activision_ids);
    const team_a = allIds.slice(0, 4);
    const team_b = allIds.slice(4, 8);

    const usedEntryIds: string[] = [];
    let used = 0;
    for (const entry of sorted) {
      usedEntryIds.push(entry.id);
      used += entry.activision_ids.length;
      if (used >= 8) break;
    }

    (async () => {
      const { data: newMatch, error: matchErr } = await supabase
        .from("scrim_match")
        .insert({ team_a, team_b })
        .select()
        .single();

      if (matchErr) {
        // 23505 = unique_violation: another tab/client already won the race.
        // Don't reset the flag — the realtime subscription will deliver the row.
        if ((matchErr as { code?: string }).code !== "23505") {
          matchAttempted.current = false;
        }
        return;
      }

      await supabase.from("scrim_queue").delete().in("id", usedEntryIds);
      setMatch(newMatch as ScrimMatch);
      setInQueue(false);
      inQueueRef.current = false;
      setQueueEntryId(null);
    })();
  }, [queueEntries, inQueue, match, queueEntryId, supabase]);

  // ── Fetch existing votes + subscribe when match is set ────────────────────────
  useEffect(() => {
    if (!match) return;
    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from("scrim_votes")
        .select("voted_for, voter_id")
        .eq("match_id", match.id);

      if (cancelled) return;

      const aCount = data?.filter((v) => v.voted_for === "team_a").length ?? 0;
      const bCount = data?.filter((v) => v.voted_for === "team_b").length ?? 0;
      setVotes({ team_a: aCount, team_b: bCount });

      const uid = userIdRef.current;
      const existing = uid ? data?.find((v) => v.voter_id === uid) : null;
      if (existing) {
        setHasVoted(true);
        setMyVote(existing.voted_for as VoteSide);
      }
    })();

    const channel = supabase
      .channel(`scrims:votes:${match.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "scrim_votes",
          filter: `match_id=eq.${match.id}`,
        },
        (payload) => {
          const vote = payload.new as { voted_for: VoteSide };
          setVotes((prev) => ({
            ...prev,
            [vote.voted_for]: prev[vote.voted_for] + 1,
          }));
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [match?.id, supabase]);

  // ── Determine winner and apply rewards ───────────────────────────────────────
  useEffect(() => {
    if (!match || winner) return;

    const winningTeam: VoteSide | null =
      votes.team_a >= 5 ? "team_a" : votes.team_b >= 5 ? "team_b" : null;
    if (!winningTeam) return;

    setWinner(winningTeam);

    // Each winner applies only their own profile update (no cross-client conflicts).
    // Resolve winning team's user_ids from their activision_ids so the check is
    // by user UUID rather than the activision_id string the user typed.
    const uid = userIdRef.current;
    if (!uid || rewardsApplied.current) return;

    rewardsApplied.current = true;

    (async () => {
      const winnerActivisionIds =
        winningTeam === "team_a" ? match.team_a : match.team_b;

      const { data: winnerProfiles } = await supabase
        .from("profiles")
        .select("id")
        .in("activision_id", winnerActivisionIds);

      const winnerUserIds = new Set(
        (winnerProfiles ?? []).map((p) => p.id as string)
      );
      if (!winnerUserIds.has(uid)) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("scrim_points, scrim_wins")
        .eq("id", uid)
        .single();

      if (!profile) return;

      await supabase
        .from("profiles")
        .update({
          scrim_points: ((profile.scrim_points as number | null) ?? 0) + 3,
          scrim_wins: ((profile.scrim_wins as number | null) ?? 0) + 1,
        })
        .eq("id", uid);
    })();
  }, [votes, match, winner, supabase]);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const count = PARTY_OPTIONS.find((p) => p.label === partySize)!.count;
  const totalQueued = queueEntries.reduce(
    (n, e) => n + e.activision_ids.length,
    0
  );

  function updateId(i: number, value: string) {
    setIds((prev) => {
      const next = [...prev];
      next[i] = value;
      return next;
    });
  }

  async function handleReady() {
    const activeIds = ids.slice(0, count).map((id) => id.trim());
    if (activeIds.some((id) => !id)) {
      setError("Please fill in all Activision IDs before queuing.");
      return;
    }

    setJoining(true);
    setError("");

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/sign-in");
      return;
    }

    // Slot 0 is always the current user — use their auth id directly.
    // Only look up teammates (slots 1+) by Activision ID.
    const teammateActivisionIds = activeIds.slice(1);
    let userIds: string[] = [user.id];

    if (teammateActivisionIds.length > 0) {
      const { data: profiles, error: lookupError } = await supabase
        .from("profiles")
        .select("id, activision_id")
        .in("activision_id", teammateActivisionIds);

      if (lookupError) {
        setError(lookupError.message);
        setJoining(false);
        return;
      }

      const idMap = new Map(
        (profiles ?? []).map((p) => [p.activision_id as string, p.id as string])
      );

      for (const aid of teammateActivisionIds) {
        if (!idMap.has(aid)) {
          setError(
            `Player ${aid} is not registered on EliteMENA. Ask them to create an account first.`
          );
          setJoining(false);
          return;
        }
      }

      const teammateUserIds = teammateActivisionIds.map((aid) => idMap.get(aid)!);

      // Verify each teammate is on at least one of the captain's teams.
      // Prevents submitting a rival's Activision ID and falsely attributing
      // scrim results to them.
      const { data: captainTeams } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", user.id);

      const captainTeamIds = (captainTeams ?? []).map((t) => t.team_id as string);

      if (captainTeamIds.length === 0) {
        setError("You must be on a team to queue with teammates.");
        setJoining(false);
        return;
      }

      const { data: sharedMembers } = await supabase
        .from("team_members")
        .select("user_id")
        .in("team_id", captainTeamIds)
        .in("user_id", teammateUserIds);

      const verifiedIds = new Set(
        (sharedMembers ?? []).map((m) => m.user_id as string)
      );

      for (const aid of teammateActivisionIds) {
        if (!verifiedIds.has(idMap.get(aid)!)) {
          setError(
            `${aid} is not a member of your team. You can only queue with your registered teammates.`
          );
          setJoining(false);
          return;
        }
      }

      userIds = [user.id, ...teammateUserIds];
    }

    const { data: row, error: insertError } = await supabase
      .from("scrim_queue")
      .insert({ party_size: count, activision_ids: activeIds, user_ids: userIds })
      .select("id")
      .single();

    if (insertError) {
      setError(insertError.message);
      setJoining(false);
      return;
    }

    myActivisionIdRef.current = activeIds[0];
    matchAttempted.current = false;
    setQueueEntryId(row.id as string);
    setInQueue(true);
    inQueueRef.current = true;
    setJoining(false);
  }

  async function handleLeaveQueue() {
    if (queueEntryId) {
      await supabase.from("scrim_queue").delete().eq("id", queueEntryId);
    }
    matchAttempted.current = false;
    setQueueEntryId(null);
    setInQueue(false);
    inQueueRef.current = false;
    setError("");
  }

  async function castVote(side: VoteSide) {
    if (hasVoted || voting || !match) return;
    setVoting(true);

    const { data: { user: freshUser } } = await supabase.auth.getUser();
    if (!freshUser) { router.push("/sign-in"); setVoting(false); return; }

    const { error: voteErr } = await supabase.from("scrim_votes").insert({
      match_id: match.id,
      voter_id: freshUser.id,
      voted_for: side,
    });

    if (voteErr) {
      setVoting(false);
      return;
    }

    setMyVote(side);
    setHasVoted(true);
    setVoting(false);
  }

  function handleFindAnother() {
    setMatch(null);
    setVotes({ team_a: 0, team_b: 0 });
    setHasVoted(false);
    setMyVote(null);
    setVoting(false);
    setWinner(null);
    matchAttempted.current = false;
    rewardsApplied.current = false;
  }

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <svg
            className="w-8 h-8 animate-spin text-violet-500"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <span className="text-sm text-gray-500">Loading...</span>
        </div>
      </div>
    );
  }

  // ── Match view ───────────────────────────────────────────────────────────────
  if (match) {
    const myId = myActivisionIdRef.current;
    const onTeamA = match.team_a.includes(myId);
    const myTeamSide: VoteSide = onTeamA ? "team_a" : "team_b";
    const myTeamLabel = onTeamA ? "A" : "B";
    const myTeamIds = onTeamA ? match.team_a : match.team_b;
    const oppTeamLabel = onTeamA ? "B" : "A";
    const oppTeamIds = onTeamA ? match.team_b : match.team_a;
    const userWon = winner === myTeamSide;
    const winnerLabel = winner === "team_a" ? "A" : "B";

    return (
      <div className="min-h-screen bg-gray-950 text-white font-sans">
        <Navbar username={username} />

        <main className="max-w-xl mx-auto px-6 pt-28 pb-20 space-y-5">

          {/* Header: pre-result vs post-result */}
          {winner ? (
            <div className="rounded-2xl border border-yellow-500/25 bg-yellow-500/8 p-6 text-center space-y-3">
              <svg
                className="w-10 h-10 mx-auto text-yellow-400"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
              <div>
                <h1 className="text-2xl font-extrabold text-white tracking-tight">
                  Team {winnerLabel} Wins!
                </h1>
                {userWon ? (
                  <div className="flex items-center justify-center gap-2 mt-2.5 flex-wrap">
                    <span className="px-2.5 py-1 rounded-full bg-green-500/15 border border-green-500/25 text-green-400 text-xs font-semibold">
                      +3 scrim points
                    </span>
                    <span className="px-2.5 py-1 rounded-full bg-violet-500/15 border border-violet-500/25 text-violet-300 text-xs font-semibold">
                      +1 win
                    </span>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 mt-1">
                    Better luck next time
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/15 border border-green-500/25 text-green-400 text-xs font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                Match Found
              </div>
              <h1 className="text-2xl font-extrabold text-white tracking-tight">
                Your Scrim is Ready
              </h1>
            </div>
          )}

          {/* Your team */}
          <div className="rounded-2xl border border-violet-500/30 bg-violet-500/10 p-5 space-y-3">
            <h2 className="text-xs font-semibold text-violet-300 uppercase tracking-wider">
              Team {myTeamLabel} — Your Side
            </h2>
            <div className="space-y-2">
              {myTeamIds.map((id) => (
                <div
                  key={id}
                  className={
                    "flex items-center gap-3 px-4 py-3 rounded-xl border " +
                    (id === myId
                      ? "border-violet-500/40 bg-violet-500/10"
                      : "border-white/8 bg-white/3")
                  }
                >
                  <span className="w-2 h-2 rounded-full shrink-0 bg-violet-400" />
                  <span className="text-sm text-white font-medium">{id}</span>
                  {id === myId && (
                    <span className="ml-auto text-xs text-violet-400 font-medium">
                      You
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Opponent team */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Team {oppTeamLabel} — Opponents
            </h2>
            <div className="space-y-2">
              {oppTeamIds.map((id) => (
                <div
                  key={id}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/8 bg-white/3"
                >
                  <span className="w-2 h-2 rounded-full shrink-0 bg-gray-500" />
                  <span className="text-sm text-white font-medium">{id}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Voting card */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                {winner ? "Final Vote" : "Vote for the Winner"}
              </h2>
              <span className="text-xs text-gray-600">
                {votes.team_a + votes.team_b} / 8 voted
              </span>
            </div>

            {/* Vote progress bars */}
            <div className="space-y-3">
              {(
                [
                  { side: "team_a" as VoteSide, label: "Team A", color: "bg-violet-500" },
                  { side: "team_b" as VoteSide, label: "Team B", color: "bg-indigo-500" },
                ] as const
              ).map(({ side, label, color }) => {
                const voteCount = votes[side];
                const isWinner = winner === side;
                const isLoser = winner && winner !== side;
                return (
                  <div key={side} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span
                        className={
                          isWinner
                            ? "text-yellow-400 font-semibold"
                            : isLoser
                            ? "text-gray-600"
                            : myVote === side
                            ? "text-white font-medium"
                            : "text-gray-400"
                        }
                      >
                        {label}
                        {myVote === side && (
                          <span className="ml-1.5 text-gray-500">(your vote)</span>
                        )}
                        {isWinner && (
                          <span className="ml-1.5 text-yellow-500">✓ Won</span>
                        )}
                      </span>
                      <span
                        className={
                          isWinner ? "text-yellow-400 font-semibold" : "text-gray-500"
                        }
                      >
                        {voteCount} / 5
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className={
                          "h-full rounded-full transition-all duration-500 " +
                          (isWinner
                            ? "bg-yellow-400"
                            : isLoser
                            ? "bg-white/20"
                            : color)
                        }
                        style={{
                          width: `${Math.min(100, (voteCount / 5) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Vote buttons or status */}
            {!winner && (
              hasVoted ? (
                <p className="text-center text-xs text-gray-500 py-1">
                  Vote submitted — waiting for more votes…
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <button
                    type="button"
                    disabled={voting}
                    onClick={() => castVote("team_a")}
                    className="py-3 rounded-xl border border-violet-500/30 bg-violet-500/10 hover:bg-violet-500/20 text-violet-300 text-sm font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Team A Won
                  </button>
                  <button
                    type="button"
                    disabled={voting}
                    onClick={() => castVote("team_b")}
                    className="py-3 rounded-xl border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 text-sm font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Team B Won
                  </button>
                </div>
              )
            )}
          </div>

          {/* Find Another Match — only shown after winner decided */}
          {winner && (
            <button
              type="button"
              onClick={handleFindAnother}
              className="w-full py-3 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 text-sm text-gray-400 hover:text-white transition-all duration-200"
            >
              Find Another Match
            </button>
          )}
        </main>
      </div>
    );
  }

  // ── Queue UI ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans">
      <Navbar username={username} />

      <main className="max-w-xl mx-auto px-6 pt-28 pb-20 space-y-5">
        <div className="space-y-1">
          <h1 className="text-2xl font-extrabold text-white tracking-tight">
            Scrims Queue
          </h1>
          <p className="text-sm text-gray-500">
            Select your party size, fill in Activision IDs, then ready up.
          </p>
        </div>

        {/* Live queue counter */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">Players in queue</span>
            <span className="font-semibold text-white">
              {totalQueued}
              <span className="text-gray-500"> / 8</span>
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-500"
              style={{ width: `${Math.min(100, (totalQueued / 8) * 100)}%` }}
            />
          </div>
          {queueEntries.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {queueEntries.map((entry) => (
                <span
                  key={entry.id}
                  className={
                    "px-2 py-0.5 rounded-full text-xs font-medium border " +
                    (entry.id === queueEntryId
                      ? "border-violet-500/40 bg-violet-500/15 text-violet-300"
                      : "border-white/10 bg-white/5 text-gray-400")
                  }
                >
                  {entry.party_size === 1
                    ? "Solo"
                    : entry.party_size === 2
                    ? "Duo"
                    : entry.party_size === 3
                    ? "Trio"
                    : "Stack"}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Party Size Selector */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Party Size
          </h2>
          <div className="grid grid-cols-4 gap-2">
            {PARTY_OPTIONS.map(({ label, subtitle }) => (
              <button
                key={label}
                type="button"
                disabled={inQueue}
                onClick={() => {
                  setPartySize(label);
                  setError("");
                }}
                className={
                  "flex flex-col items-center gap-1 py-3 rounded-xl border text-sm font-semibold transition-all duration-200 " +
                  (partySize === label
                    ? "border-violet-500/60 bg-violet-500/15 text-violet-300"
                    : "border-white/10 bg-white/3 text-gray-400 hover:border-white/20 hover:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed")
                }
              >
                <span>{label}</span>
                <span className="text-xs font-normal text-gray-600">
                  {subtitle}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Activision IDs */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Activision IDs
          </h2>
          <div className="space-y-2">
            {Array.from({ length: count }).map((_, i) => (
              <div key={i} className="space-y-1">
                <label className="block text-xs text-gray-500">
                  {i === 0 ? "You" : `Player ${i + 1}`}
                </label>
                <input
                  type="text"
                  value={ids[i]}
                  onChange={(e) => updateId(i, e.target.value)}
                  disabled={inQueue}
                  placeholder={
                    i === 0
                      ? "Your Activision ID"
                      : `Player ${i + 1} Activision ID`
                  }
                  maxLength={50}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            <svg
              className="w-4 h-4 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
            {error}
          </div>
        )}

        {/* In-queue pulse / Ready button */}
        {inQueue ? (
          <div className="rounded-2xl border border-violet-500/30 bg-violet-500/10 p-8 flex flex-col items-center gap-4 text-center">
            <div className="relative w-14 h-14 flex items-center justify-center">
              <span className="absolute w-14 h-14 rounded-full bg-violet-500/20 animate-ping" />
              <span className="relative w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500" />
            </div>
            <div className="space-y-1">
              <p className="text-white font-semibold">Looking for match…</p>
              <p className="text-sm text-gray-400">
                {partySize} &middot; {count} player{count > 1 ? "s" : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={handleLeaveQueue}
              className="px-5 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-sm text-gray-400 hover:text-white transition-all duration-200"
            >
              Leave Queue
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleReady}
            disabled={joining}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm transition-all duration-200 shadow-lg shadow-violet-900/40 flex items-center justify-center gap-2"
          >
            {joining ? (
              <>
                <svg
                  className="w-4 h-4 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Joining Queue…
              </>
            ) : (
              "Ready"
            )}
          </button>
        )}
      </main>
    </div>
  );
}
