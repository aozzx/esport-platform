import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isValidOrigin } from "@/lib/csrf";

export async function POST(
  _req: NextRequest,
  ctx: RouteContext<"/api/tournaments/[id]/bracket/generate">
) {
  const { id: tournamentId } = await ctx.params;
  if (!isValidOrigin(_req)) {
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

  // Fetch registered teams server-side (do not trust client-supplied team list)
  const { data: regs, error: regsError } = await supabase
    .from("tournament_registrations")
    .select("team_id")
    .eq("tournament_id", tournamentId);

  if (regsError) {
    return NextResponse.json({ error: "Failed to fetch registrations." }, { status: 500 });
  }
  if (!regs || regs.length < 2) {
    return NextResponse.json({ error: "At least 2 registered teams required." }, { status: 400 });
  }

  // Rate limit: reject if the bracket was regenerated in the last 60 seconds.
  // Uses the most recently created match's timestamp as a serverless-safe signal.
  const { data: recentMatch } = await supabase
    .from("matches")
    .select("created_at")
    .eq("tournament_id", tournamentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recentMatch) {
    const elapsed = Date.now() - new Date(recentMatch.created_at).getTime();
    if (elapsed < 60_000) {
      return NextResponse.json(
        { error: "Bracket was just generated. Please wait 60 seconds before regenerating." },
        { status: 429 }
      );
    }
  }

  // Clear existing matches
  const { error: deleteError } = await supabase
    .from("matches")
    .delete()
    .eq("tournament_id", tournamentId);

  if (deleteError) {
    return NextResponse.json({ error: "Failed to clear existing bracket." }, { status: 500 });
  }

  // Build randomised bracket
  const teams = [...regs].sort(() => Math.random() - 0.5);
  const newMatches = [];
  let matchNumber = 1;

  for (let i = 0; i < teams.length; i += 2) {
    newMatches.push({
      tournament_id: tournamentId,
      round: 1,
      match_number: matchNumber++,
      team_a_id: teams[i].team_id,
      team_b_id: teams[i + 1]?.team_id ?? null,
      status: "scheduled",
    });
  }

  const { error: insertError } = await supabase.from("matches").insert(newMatches);
  if (insertError) {
    return NextResponse.json({ error: "Failed to create bracket." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
