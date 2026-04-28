import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isValidOrigin } from "@/lib/csrf";

export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/tournaments/[id]/bracket/claim-walkover">
) {
  const { id: tournamentId } = await ctx.params;
  if (!isValidOrigin(req)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: { matchId?: string; teamId?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { matchId, teamId } = body;
  if (!matchId || !teamId) {
    return NextResponse.json({ error: "matchId and teamId are required." }, { status: 400 });
  }

  // Verify caller is captain of the specified team
  const { data: team } = await supabase
    .from("teams").select("captain_id").eq("id", teamId).maybeSingle();
  if (!team || team.captain_id !== user.id) {
    return NextResponse.json({ error: "You are not the captain of this team." }, { status: 403 });
  }

  // Fetch match
  const { data: match } = await supabase
    .from("matches")
    .select("id, tournament_id, team_a_id, team_b_id, winner_id, walkover_requested_by")
    .eq("id", matchId)
    .eq("tournament_id", tournamentId)
    .maybeSingle();

  if (!match) return NextResponse.json({ error: "Match not found." }, { status: 404 });
  if (match.winner_id) return NextResponse.json({ error: "Match already decided." }, { status: 409 });
  if (match.walkover_requested_by) return NextResponse.json({ error: "Walkover already requested." }, { status: 409 });

  // Claimant must be in the match
  if (teamId !== match.team_a_id && teamId !== match.team_b_id) {
    return NextResponse.json({ error: "Your team is not in this match." }, { status: 400 });
  }

  // Claimant must have already submitted their result
  const { data: mySubmission } = await supabase
    .from("match_submissions")
    .select("id")
    .eq("match_id", matchId)
    .eq("team_id", teamId)
    .maybeSingle();

  if (!mySubmission) {
    return NextResponse.json({ error: "Submit your result first before claiming a walkover." }, { status: 400 });
  }

  // Opponent must NOT have submitted
  const opponentId = teamId === match.team_a_id ? match.team_b_id : match.team_a_id;
  const { data: opponentSubmission } = await supabase
    .from("match_submissions")
    .select("id")
    .eq("match_id", matchId)
    .eq("team_id", opponentId)
    .maybeSingle();

  if (opponentSubmission) {
    return NextResponse.json({ error: "Opponent has already submitted. No walkover needed." }, { status: 400 });
  }

  // Flag the match
  const { error: updateError } = await supabase
    .from("matches")
    .update({
      walkover_requested_by: teamId,
      walkover_requested_at: new Date().toISOString(),
    })
    .eq("id", matchId);

  if (updateError) {
    return NextResponse.json({ error: "Failed to submit walkover request." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
