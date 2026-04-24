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
  team_a: { team_name: string; team_tag: string } | null;
  team_b: { team_name: string; team_tag: string } | null;
  winner: { team_name: string; team_tag: string } | null;
};

type Registration = {
  team_id: string;
  teams: { team_name: string; team_tag: string } | null;
};

type RawTeam = { team_name: unknown; team_tag: unknown } | null;

function mapTeam(t: RawTeam): { team_name: string; team_tag: string } | null {
  return t ? { team_name: String(t.team_name ?? ""), team_tag: String(t.team_tag ?? "") } : null;
}

type RawMatch = {
  id: string; round: number; match_number: number;
  team_a_id: string | null; team_b_id: string | null; winner_id: string | null;
  score_a: number | null; score_b: number | null; status: string;
  team_a: RawTeam; team_b: RawTeam; winner: RawTeam;
};

function mapMatch(m: RawMatch): Match {
  return {
    id: m.id, round: m.round, match_number: m.match_number,
    team_a_id: m.team_a_id, team_b_id: m.team_b_id, winner_id: m.winner_id,
    score_a: m.score_a, score_b: m.score_b, status: m.status,
    team_a: mapTeam(m.team_a), team_b: mapTeam(m.team_b), winner: mapTeam(m.winner),
  };
}

type RawRegistration = { team_id: string; teams: RawTeam };

function mapRegistration(r: RawRegistration): Registration {
  return { team_id: r.team_id, teams: mapTeam(r.teams) };
}

export default function BracketPage() {
  const router = useRouter();
  const params = useParams();
  const tournamentId = params.id as string;
  const supabase = useMemo(() => createClient(), []);

  const [username, setUsername] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState("");

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

      await refreshMatches();

      const { data: regs } = await supabase
        .from("tournament_registrations")
        .select("team_id, teams(team_name, team_tag)")
        .eq("tournament_id", tournamentId);

      setRegistrations(((regs ?? []) as unknown as RawRegistration[]).map(mapRegistration));
      setLoading(false);
    }
    load();
  }, [tournamentId, supabase, router]);

  async function refreshMatches() {
    const { data } = await supabase
      .from("matches")
      .select(`
        id, round, match_number, team_a_id, team_b_id, winner_id, score_a, score_b, status,
        team_a:teams!matches_team_a_id_fkey(team_name, team_tag),
        team_b:teams!matches_team_b_id_fkey(team_name, team_tag),
        winner:teams!matches_winner_id_fkey(team_name, team_tag)
      `)
      .eq("tournament_id", tournamentId)
      .order("round")
      .order("match_number");

    setMatches(((data ?? []) as unknown as RawMatch[]).map(mapMatch));
  }

  async function generateBracket() {
    if (registrations.length < 2) return;
    setGenerating(true);
    setMutationError("");

    const res = await fetch(`/api/tournaments/${tournamentId}/bracket/generate`, {
      method: "POST",
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setMutationError(body.error ?? "Failed to generate bracket.");
      setGenerating(false);
      return;
    }

    await refreshMatches();
    setGenerating(false);
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
  }

  // تجميع المباريات حسب الراوند
  const rounds = matches.reduce((acc, match) => {
    if (!acc[match.round]) acc[match.round] = [];
    acc[match.round].push(match);
    return acc;
  }, {} as Record<number, Match[]>);

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

      <main className="max-w-4xl mx-auto px-6 pt-28 pb-20 space-y-5">

        <div className="flex items-center justify-between">
          <a href={`/tournaments/${tournamentId}`} className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-300 transition-colors duration-200">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            Back to Tournament
          </a>

          {isAdmin && (
            <button
              onClick={generateBracket}
              disabled={generating || registrations.length < 2}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-all duration-200"
            >
              {generating ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Generating...
                </>
              ) : "Generate Bracket"}
            </button>
          )}
        </div>

        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Bracket</h1>
          <p className="text-sm text-gray-500 mt-1">{registrations.length} teams registered</p>
        </div>

        {mutationError && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            {mutationError}
          </div>
        )}

        {matches.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-12 flex flex-col items-center justify-center text-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <svg className="w-7 h-7 text-gray-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
              </svg>
            </div>
            <div>
              <p className="text-white font-semibold">No bracket yet</p>
              <p className="text-gray-500 text-sm mt-1">
                {isAdmin ? "Click Generate Bracket to create matches" : "Bracket will appear when the admin generates it"}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(rounds).map(([round, roundMatches]) => (
              <div key={round}>
                <h2 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">
                  Round {round}
                </h2>
                <div className="space-y-3">
                  {roundMatches.map((match) => (
                    <div key={match.id} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                      <div className="flex items-center gap-3">

                        {/* Team A */}
                        <div className={`flex-1 flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 ${
                          match.winner_id === match.team_a_id
                            ? "bg-green-500/10 border-green-500/20"
                            : match.winner_id && match.winner_id !== match.team_a_id
                            ? "bg-white/3 border-white/5 opacity-50"
                            : "bg-white/3 border-white/8"
                        }`}>
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/20 to-indigo-600/20 border border-violet-500/20 flex items-center justify-center shrink-0">
                            <span className="text-xs font-bold text-violet-300">{match.team_a?.team_tag ?? "?"}</span>
                          </div>
                          <span className="text-sm font-medium text-white flex-1 truncate">
                            {match.team_a?.team_name ?? "TBD"}
                          </span>
                          {match.winner_id === match.team_a_id && (
                            <span className="text-xs text-green-400 font-bold">WIN</span>
                          )}
                        </div>

                        <span className="text-xs text-gray-600 font-medium shrink-0">VS</span>

                        {/* Team B */}
                        <div className={`flex-1 flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 ${
                          match.winner_id === match.team_b_id
                            ? "bg-green-500/10 border-green-500/20"
                            : match.winner_id && match.winner_id !== match.team_b_id
                            ? "bg-white/3 border-white/5 opacity-50"
                            : "bg-white/3 border-white/8"
                        }`}>
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/20 to-indigo-600/20 border border-violet-500/20 flex items-center justify-center shrink-0">
                            <span className="text-xs font-bold text-violet-300">{match.team_b?.team_tag ?? "?"}</span>
                          </div>
                          <span className="text-sm font-medium text-white flex-1 truncate">
                            {match.team_b?.team_name ?? "TBD"}
                          </span>
                          {match.winner_id === match.team_b_id && (
                            <span className="text-xs text-green-400 font-bold">WIN</span>
                          )}
                        </div>

                        {/* Admin: Set Winner */}
                        {isAdmin && !match.winner_id && match.team_a_id && match.team_b_id && (
                          <div className="flex flex-col gap-1 shrink-0">
                            <button
                              onClick={() => handleSetWinner(match, match.team_a_id!, match.team_b_id!)}
                              disabled={updatingId === match.id}
                              className="px-3 py-1.5 rounded-lg bg-violet-600/20 hover:bg-violet-600/40 border border-violet-500/30 text-violet-300 text-xs font-medium transition-all duration-200 disabled:opacity-50"
                            >
                              {match.team_a?.team_tag} wins
                            </button>
                            <button
                              onClick={() => handleSetWinner(match, match.team_b_id!, match.team_a_id!)}
                              disabled={updatingId === match.id}
                              className="px-3 py-1.5 rounded-lg bg-violet-600/20 hover:bg-violet-600/40 border border-violet-500/30 text-violet-300 text-xs font-medium transition-all duration-200 disabled:opacity-50"
                            >
                              {match.team_b?.team_tag} wins
                            </button>
                          </div>
                        )}

                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

      </main>
    </div>
  );
}