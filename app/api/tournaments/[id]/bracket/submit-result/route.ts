import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isValidOrigin } from "@/lib/csrf";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

// ── Double Elimination advancement ────────────────────────────────────────────

/** Fill the first empty team slot (team_a → team_b) in a match. */
async function fillMatchSlot(supabase: Supa, matchId: string, teamId: string) {
  const { data: m } = await supabase
    .from("matches")
    .select("id, team_a_id, team_b_id")
    .eq("id", matchId)
    .maybeSingle();
  if (!m) return;

  if (!m.team_a_id) {
    await supabase.from("matches").update({ team_a_id: teamId }).eq("id", matchId);
  } else if (!m.team_b_id) {
    await supabase.from("matches").update({ team_b_id: teamId }).eq("id", matchId);
  }
}

/**
 * Advance teams after a double-elimination match completes.
 * - Winner goes to next_winners_match_id
 * - Loser goes to next_losers_match_id (only for WB matches; LB losers are eliminated)
 */
export async function advanceDE(
  supabase: Supa,
  matchId: string,
  winnerId: string,
  loserId: string | null
) {
  const { data: match } = await supabase
    .from("matches")
    .select("id, bracket, next_winners_match_id, next_losers_match_id")
    .eq("id", matchId)
    .maybeSingle();
  if (!match) return;

  if (match.next_winners_match_id) {
    await fillMatchSlot(supabase, match.next_winners_match_id, winnerId);
  }
  // Only WB matches drop losers into LB; LB/GF losers are eliminated
  if (match.bracket === "winners" && loserId && match.next_losers_match_id) {
    await fillMatchSlot(supabase, match.next_losers_match_id, loserId);
  }
}

// ── Single / Round-Robin advancement ─────────────────────────────────────────

/** Advance bracket to the next round when all matches in a round are complete. */
export async function advanceBracketIfComplete(
  supabase: Supa,
  tournamentId: string,
  completedRound: number
) {
  // Fetch all matches in the completed round
  const { data: roundMatches, error } = await supabase
    .from("matches")
    .select("id, winner_id, match_number, team_a_id, team_b_id")
    .eq("tournament_id", tournamentId)
    .eq("round", completedRound)
    .eq("bracket", "winners") // only SE/RR matches (default bracket value)
    .order("match_number", { ascending: true });

  if (error || !roundMatches || roundMatches.length === 0) return;

  // Check if every match has a winner (or is a bye — no team_b)
  const allDone = roundMatches.every(
    (m: { winner_id: string | null; team_b_id: string | null }) =>
      m.winner_id !== null || m.team_b_id === null
  );
  if (!allDone) return;

  // Collect winners in match_number order; byes auto-advance team_a
  const winners: string[] = roundMatches.map(
    (m: { winner_id: string | null; team_a_id: string }) =>
      m.winner_id ?? m.team_a_id
  );

  // Only one winner left → tournament complete
  if (winners.length <= 1) return;

  // Auto-confirm bye matches
  const byeMatches = roundMatches.filter(
    (m: { team_b_id: string | null; winner_id: string | null; team_a_id: string; id: string }) =>
      m.team_b_id === null && m.winner_id === null
  );
  for (const bye of byeMatches) {
    await supabase
      .from("matches")
      .update({ winner_id: bye.team_a_id, status: "completed" })
      .eq("id", bye.id);
  }

  // Build next round matches
  const nextRound = completedRound + 1;
  const nextMatches = [];
  for (let i = 0; i < winners.length; i += 2) {
    nextMatches.push({
      tournament_id: tournamentId,
      round: nextRound,
      match_number: Math.floor(i / 2) + 1,
      team_a_id: winners[i],
      team_b_id: winners[i + 1] ?? null,
      status: "scheduled",
    });
  }

  const { error: insertError } = await supabase.from("matches").insert(nextMatches);
  if (insertError) {
    console.error("[advanceBracket] insert error:", insertError.message);
  }
}

// ── POST /api/tournaments/[id]/bracket/submit-result ──────────────────────────
export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/tournaments/[id]/bracket/submit-result">
) {
  const { id: tournamentId } = await ctx.params;

  if (!isValidOrigin(req)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const supabase = await createClient();

  // Auth
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // Parse body
  let body: {
    matchId?: string;
    teamId?: string;
    claimedWinnerId?: string;
    scoreA?: number;
    scoreB?: number;
    proofUrl?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { matchId, teamId, claimedWinnerId, scoreA, scoreB, proofUrl } = body;

  if (!matchId || !teamId || !claimedWinnerId) {
    return NextResponse.json(
      { error: "matchId, teamId, and claimedWinnerId are required." },
      { status: 400 }
    );
  }

  // Verify caller is the captain of the specified team
  const { data: team } = await supabase
    .from("teams")
    .select("id, captain_id")
    .eq("id", teamId)
    .maybeSingle();

  if (!team || team.captain_id !== user.id) {
    return NextResponse.json(
      { error: "You are not the captain of this team." },
      { status: 403 }
    );
  }

  // Fetch the match and verify it belongs to this tournament
  const { data: match } = await supabase
    .from("matches")
    .select("id, tournament_id, team_a_id, team_b_id, winner_id, round, bracket")
    .eq("id", matchId)
    .eq("tournament_id", tournamentId)
    .maybeSingle();

  if (!match) {
    return NextResponse.json({ error: "Match not found." }, { status: 404 });
  }
  if (match.winner_id) {
    return NextResponse.json(
      { error: "This match already has a confirmed winner." },
      { status: 409 }
    );
  }

  // The submitting team must actually be in this match
  if (teamId !== match.team_a_id && teamId !== match.team_b_id) {
    return NextResponse.json(
      { error: "Your team is not a participant in this match." },
      { status: 400 }
    );
  }

  // The claimed winner must be one of the two teams in the match
  if (claimedWinnerId !== match.team_a_id && claimedWinnerId !== match.team_b_id) {
    return NextResponse.json(
      { error: "Claimed winner is not a participant in this match." },
      { status: 400 }
    );
  }

  // Validate proof URL if provided
  if (proofUrl) {
    try {
      if (new URL(proofUrl).protocol !== "https:") {
        return NextResponse.json({ error: "Proof URL must use HTTPS." }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: "Invalid proof URL." }, { status: 400 });
    }
  }

  // Upsert this team's submission (captain can resubmit to correct)
  const { error: upsertError } = await supabase
    .from("match_submissions")
    .upsert(
      {
        match_id: matchId,
        team_id: teamId,
        submitted_by: user.id,
        claimed_winner_id: claimedWinnerId,
        score_a: scoreA ?? null,
        score_b: scoreB ?? null,
        proof_url: proofUrl ?? null,
      },
      { onConflict: "match_id,team_id" }
    );

  if (upsertError) {
    console.error("[submit-result] upsert error:", upsertError.message);
    return NextResponse.json({ error: "Failed to save submission." }, { status: 500 });
  }

  // Check if both teams have now submitted the same winner
  const { data: submissions } = await supabase
    .from("match_submissions")
    .select("team_id, claimed_winner_id, score_a, score_b")
    .eq("match_id", matchId);

  const teamASubmission = submissions?.find(
    (s: { team_id: string }) => s.team_id === match.team_a_id
  );
  const teamBSubmission = submissions?.find(
    (s: { team_id: string }) => s.team_id === match.team_b_id
  );

  const bothSubmitted = !!(teamASubmission && teamBSubmission);
  const agreed =
    bothSubmitted &&
    teamASubmission.claimed_winner_id === teamBSubmission.claimed_winner_id;

  if (agreed) {
    const confirmedWinnerId = teamASubmission.claimed_winner_id as string;
    const finalScoreA = teamASubmission.score_a ?? teamBSubmission.score_a ?? null;
    const finalScoreB = teamASubmission.score_b ?? teamBSubmission.score_b ?? null;

    const { error: updateError } = await supabase
      .from("matches")
      .update({
        winner_id: confirmedWinnerId,
        score_a: finalScoreA,
        score_b: finalScoreB,
        status: "completed",
      })
      .eq("id", matchId);

    if (updateError) {
      console.error("[submit-result] confirm error:", updateError.message);
      return NextResponse.json({ error: "Failed to confirm winner." }, { status: 500 });
    }

    // Advance bracket
    const loserId = confirmedWinnerId === match.team_a_id ? match.team_b_id : match.team_a_id;
    const bracket = match.bracket as string | null;

    if (bracket === "winners" || bracket === "losers" || bracket === "grand_final") {
      // Double elimination — use pointer-based advancement
      await advanceDE(supabase, matchId, confirmedWinnerId, loserId);
    } else {
      // Single elimination / round robin
      await advanceBracketIfComplete(supabase, tournamentId, match.round as number);
    }

    return NextResponse.json({ success: true, confirmed: true, winnerId: confirmedWinnerId });
  }

  return NextResponse.json({
    success: true,
    confirmed: false,
    bothSubmitted,
    agreed: false,
  });
}
