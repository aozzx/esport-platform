import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isValidOrigin } from "@/lib/csrf";

export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/tournaments/[id]/bracket/set-winner">
) {
  const { id: tournamentId } = await ctx.params;
  if (!isValidOrigin(req)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const supabase = await createClient();

  // Verify authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // Verify admin or owner role server-side — this is the authoritative check
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_admin")
    .eq("id", user.id)
    .maybeSingle();

  const isAdmin = !!(profile?.is_admin || profile?.role === "owner" || profile?.role === "admin");
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  // Parse and validate body
  let body: { matchId?: string; winnerId?: string; loserId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { matchId, winnerId, loserId } = body;
  if (!matchId || !winnerId || !loserId) {
    return NextResponse.json({ error: "matchId, winnerId, and loserId are required." }, { status: 400 });
  }

  // Fetch the match server-side to verify it belongs to this tournament
  // and to get authoritative team IDs (never trust client-supplied values for scoring)
  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select("id, tournament_id, team_a_id, team_b_id, winner_id")
    .eq("id", matchId)
    .eq("tournament_id", tournamentId)
    .maybeSingle();

  if (matchError || !match) {
    return NextResponse.json({ error: "Match not found." }, { status: 404 });
  }
  if (match.winner_id) {
    return NextResponse.json({ error: "Match already has a winner." }, { status: 409 });
  }

  // winnerId must be one of the two teams in the match
  if (winnerId !== match.team_a_id && winnerId !== match.team_b_id) {
    return NextResponse.json({ error: "Winner is not a participant in this match." }, { status: 400 });
  }
  // loserId must be the other team
  if (loserId !== match.team_a_id && loserId !== match.team_b_id) {
    return NextResponse.json({ error: "Loser is not a participant in this match." }, { status: 400 });
  }
  if (winnerId === loserId) {
    return NextResponse.json({ error: "Winner and loser cannot be the same team." }, { status: 400 });
  }

  // Update match using server-derived team IDs for scores
  const { error: updateError } = await supabase
    .from("matches")
    .update({
      winner_id: winnerId,
      score_a: winnerId === match.team_a_id ? 1 : 0,
      score_b: winnerId === match.team_b_id ? 1 : 0,
      status: "completed",
    })
    .eq("id", matchId);

  if (updateError) {
    return NextResponse.json({ error: "Failed to update match." }, { status: 500 });
  }

  // Update season standings if the tournament is tied to a season
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("season_id")
    .eq("id", tournamentId)
    .maybeSingle();

  if (tournament?.season_id) {
    const seasonId = tournament.season_id as string;

    const [{ data: winnerStanding }, { data: loserStanding }] = await Promise.all([
      supabase
        .from("season_standings")
        .select("id, points, wins")
        .eq("season_id", seasonId)
        .eq("team_id", winnerId)
        .maybeSingle(),
      supabase
        .from("season_standings")
        .select("id, losses")
        .eq("season_id", seasonId)
        .eq("team_id", loserId)
        .maybeSingle(),
    ]);

    const standingUpdates: Promise<unknown>[] = [];

    if (winnerStanding) {
      standingUpdates.push(
        supabase
          .from("season_standings")
          .update({
            points: winnerStanding.points + 3,
            wins: winnerStanding.wins + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", winnerStanding.id)
      );
    }

    if (loserStanding) {
      standingUpdates.push(
        supabase
          .from("season_standings")
          .update({
            losses: loserStanding.losses + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", loserStanding.id)
      );
    }

    await Promise.all(standingUpdates);
  }

  return NextResponse.json({ success: true });
}
