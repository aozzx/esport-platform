import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isValidOrigin } from "@/lib/csrf";

// ── Double Elimination helpers ────────────────────────────────────────────────

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

type DEMatch = {
  id: string;
  tournament_id: string;
  round: number;
  match_number: number;
  bracket: string;
  team_a_id: string | null;
  team_b_id: string | null;
  status: string;
  next_winners_match_id: string | null;
  next_losers_match_id: string | null;
};

function buildDoubleElim(tournamentId: string, teamIds: string[]): DEMatch[] {
  const P = nextPow2(teamIds.length);           // pad to power of 2
  const wbN = Math.log2(P);                     // WB rounds: log2(P)
  const lbN = 2 * (wbN - 1);                    // LB rounds: 2*(wbN-1)

  // Pre-generate all UUIDs so we can wire pointers before insert
  const wb: string[][] = [];
  for (let r = 0; r < wbN; r++) {
    const count = Math.round(P / Math.pow(2, r + 1));
    wb[r] = Array.from({ length: count }, () => crypto.randomUUID());
  }

  const lb: string[][] = [];
  for (let r = 0; r < lbN; r++) {
    // LB match count: same for pairs of rounds, halving every two rounds
    // count[r] = P / 2^(floor(r/2) + 2)
    const count = Math.round(P / Math.pow(2, Math.floor(r / 2) + 2));
    lb[r] = Array.from({ length: count }, () => crypto.randomUUID());
  }

  const gfId = crypto.randomUUID();
  const matches: DEMatch[] = [];

  // ── Winners Bracket ────────────────────────────────────────────────────────
  for (let r = 0; r < wbN; r++) {
    const isLastWB = r === wbN - 1;
    for (let i = 0; i < wb[r].length; i++) {
      // WB Rj (0-indexed) loser drops to LB round:
      //   j=0 → LB R1 (index 0), pairs of WB losers → lb[0][floor(i/2)]
      //   j>0 → LB R(2j-1) (index 2j-1), 1-to-1 → lb[2j-1][i]
      const lbRoundIdx = r === 0 ? 0 : 2 * r - 1;
      const lbMatchIdx = r === 0 ? Math.floor(i / 2) : i;

      matches.push({
        id: wb[r][i],
        tournament_id: tournamentId,
        round: r + 1,
        match_number: i + 1,
        bracket: "winners",
        team_a_id: r === 0 ? (teamIds[i * 2] ?? null) : null,
        team_b_id: r === 0 ? (teamIds[i * 2 + 1] ?? null) : null,
        status: "scheduled",
        // Winner advances in WB (or to GF from WB Final)
        next_winners_match_id: isLastWB ? gfId : wb[r + 1][Math.floor(i / 2)],
        // Loser drops to LB (or eliminated from GF, but WB matches always have an LB dest)
        next_losers_match_id: lbN > 0 ? lb[lbRoundIdx][lbMatchIdx] : null,
      });
    }
  }

  // ── Losers Bracket ─────────────────────────────────────────────────────────
  // Even r (0-indexed) = culling round (LB survivors pair up, same slot count as next round)
  // Odd r (0-indexed) = mixing round (LB survivors meet WB dropins, count halves next round)
  for (let r = 0; r < lbN; r++) {
    const isLastLB = r === lbN - 1;
    const isCulling = r % 2 === 0;

    for (let i = 0; i < lb[r].length; i++) {
      let nextWinnersId: string | null;
      if (isLastLB) {
        nextWinnersId = gfId; // LB Final winner → Grand Final
      } else if (isCulling) {
        nextWinnersId = lb[r + 1][i]; // culling→mixing: same index (count unchanged)
      } else {
        nextWinnersId = lb[r + 1][Math.floor(i / 2)]; // mixing→culling: pairs merge
      }

      matches.push({
        id: lb[r][i],
        tournament_id: tournamentId,
        round: r + 1,
        match_number: i + 1,
        bracket: "losers",
        team_a_id: null,
        team_b_id: null,
        status: "scheduled",
        next_winners_match_id: nextWinnersId,
        next_losers_match_id: null, // LB losers are eliminated
      });
    }
  }

  // ── Grand Final ────────────────────────────────────────────────────────────
  // team_a → WB champion (fills first)
  // team_b → LB champion (fills second)
  matches.push({
    id: gfId,
    tournament_id: tournamentId,
    round: 1,
    match_number: 1,
    bracket: "grand_final",
    team_a_id: null,
    team_b_id: null,
    status: "scheduled",
    next_winners_match_id: null,
    next_losers_match_id: null,
  });

  return matches;
}

// ── Route handler ─────────────────────────────────────────────────────────────

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

  // Fetch tournament format + registered teams
  const [{ data: tournament }, { data: regs, error: regsError }] = await Promise.all([
    supabase.from("tournaments").select("format").eq("id", tournamentId).maybeSingle(),
    supabase.from("tournament_registrations").select("team_id").eq("tournament_id", tournamentId),
  ]);

  if (regsError) {
    return NextResponse.json({ error: "Failed to fetch registrations." }, { status: 500 });
  }
  if (!regs || regs.length < 2) {
    return NextResponse.json({ error: "At least 2 registered teams required." }, { status: 400 });
  }

  // Rate limit: reject if regenerated in the last 60 seconds.
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
    .from("matches").delete().eq("tournament_id", tournamentId);

  if (deleteError) {
    console.error("[bracket/generate] delete error:", deleteError.message);
    return NextResponse.json({ error: "Failed to clear existing bracket.", detail: deleteError.message }, { status: 500 });
  }

  const teamIds = [...regs].sort(() => Math.random() - 0.5).map((r) => r.team_id);

  // ── Build match rows by format ────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let newMatches: any[];

  if (tournament?.format === "round_robin") {
    // ── Round Robin: every pair plays once (circle scheduling algorithm) ──
    const arr = teamIds.length % 2 === 0 ? [...teamIds] : [...teamIds, null];
    const n = arr.length;
    const numRounds = n - 1;
    let matchNum = 1;
    newMatches = [];

    for (let round = 0; round < numRounds; round++) {
      for (let i = 0; i < n / 2; i++) {
        const a = arr[i] as string | null;
        const b = arr[n - 1 - i] as string | null;
        if (a && b) {
          newMatches.push({
            tournament_id: tournamentId,
            round: round + 1,
            match_number: matchNum++,
            team_a_id: a,
            team_b_id: b,
            status: "scheduled",
          });
        }
      }
      arr.splice(1, 0, arr.pop()!);
    }

  } else if (tournament?.format === "double_elimination") {
    // ── Double Elimination ─────────────────────────────────────────────────
    newMatches = buildDoubleElim(tournamentId, teamIds);

  } else {
    // ── Single Elimination (default) ──────────────────────────────────────
    newMatches = [];
    let matchNumber = 1;
    for (let i = 0; i < teamIds.length; i += 2) {
      newMatches.push({
        tournament_id: tournamentId,
        round: 1,
        match_number: matchNumber++,
        team_a_id: teamIds[i],
        team_b_id: teamIds[i + 1] ?? null,
        status: "scheduled",
      });
    }
  }

  const { error: insertError } = await supabase.from("matches").insert(newMatches);
  if (insertError) {
    console.error("[bracket/generate] insert error:", insertError.message);
    return NextResponse.json({ error: "Failed to create bracket.", detail: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
