"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";

export default function NewTournamentPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [username, setUsername] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [game, setGame] = useState("");
  const [format, setFormat] = useState("single_elimination");
  const [teamSize, setTeamSize] = useState("5v5");
  const [gameMode, setGameMode] = useState("Search and Destroy");
  const [maxTeams, setMaxTeams] = useState("8");
  const [prizePool, setPrizePool] = useState("");
  const [startDate, setStartDate] = useState("");
  const [description, setDescription] = useState("");
  const [rules, setRules] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/sign-in"); return; }

      const { data: profile } = await supabase
        .from("profiles")
        .select("username, is_admin, role")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.role !== 'owner') {
        router.push("/");
        return;
      }

      setUserId(user.id);
      setUsername(profile.username);
      setLoading(false);
    }
    load();
  }, [supabase, router]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    if (!name.trim()) { setError("Tournament name is required."); return; }
    if (!game.trim()) { setError("Game is required."); return; }
    if (!maxTeams || isNaN(Number(maxTeams))) { setError("Max teams must be a number."); return; }

    const VALID_FORMATS = ["single_elimination", "double_elimination", "round_robin"];
    if (!VALID_FORMATS.includes(format)) { setError("Invalid tournament format."); return; }

    if (description.trim().length > 2000) { setError("Description must be 2000 characters or fewer."); return; }
    if (rules.trim().length > 5000) { setError("Rules must be 5000 characters or fewer."); return; }

    setSubmitting(true);

    const { error: insertError } = await supabase
      .from("tournaments")
      .insert({
        name: name.trim(),
        game: game.trim(),
        format,
        team_size: teamSize,
        game_mode: gameMode,
        max_teams: Number(maxTeams),
        prize_pool: prizePool.trim() || null,
        start_date: startDate || null,
        description: description.trim() || null,
        rules: rules.trim() || null,
        status: "draft",
        created_by: userId,
      });

    if (insertError) {
      console.error("[create tournament]", insertError.code, insertError.message, insertError.details);
      setError("Failed to create tournament. Please try again.");
      setSubmitting(false);
      return;
    }

    router.push("/tournaments");
  }

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

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans flex flex-col">
      <Navbar username={username} />

      <main className="relative flex flex-1 items-center justify-center px-6 pt-16 pb-12 overflow-hidden">

        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-violet-600/15 rounded-full blur-3xl" />
        </div>

        <div className="relative w-full max-w-lg">

          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 text-xs font-medium tracking-wide uppercase mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
              Admin
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white">Create Tournament</h1>
            <p className="mt-2 text-sm text-gray-400">Fill in the details for the new tournament</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-8">
            <form onSubmit={handleSubmit} className="space-y-5" noValidate>

              {error && (
                <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-300">Tournament Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors duration-200"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-300">Game</label>
                <input
                  type="text"
                  value={game}
                  onChange={(e) => setGame(e.target.value)}
                  placeholder="e.g. Call of Duty"
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors duration-200"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-300">Format</label>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-gray-900 border border-white/10 text-white text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors duration-200"
                >
                  <option value="single_elimination">Single Elimination</option>
                  <option value="double_elimination">Double Elimination</option>
                  <option value="round_robin">Round Robin</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-gray-300">Team Size</label>
                  <select
                    value={teamSize}
                    onChange={(e) => setTeamSize(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-gray-900 border border-white/10 text-white text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors duration-200"
                  >
                    {["1v1", "2v2", "4v4", "5v5", "6v6"].map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-gray-300">Game Mode</label>
                  <select
                    value={gameMode}
                    onChange={(e) => setGameMode(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-gray-900 border border-white/10 text-white text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors duration-200"
                  >
                    <option value="Search and Destroy">Search and Destroy</option>
                    <option value="CDL">CDL</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-gray-300">Max Teams</label>
                  <input
                    type="number"
                    value={maxTeams}
                    onChange={(e) => setMaxTeams(e.target.value)}
                    min="2"
                    max="128"
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors duration-200"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-gray-300">
                    Prize Pool
                    <span className="ml-2 text-xs text-gray-600 font-normal">Optional</span>
                  </label>
                  <input
                    type="text"
                    value={prizePool}
                    onChange={(e) => setPrizePool(e.target.value)}
                    placeholder="e.g. $500"
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors duration-200"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-300">
                  Start Date
                  <span className="ml-2 text-xs text-gray-600 font-normal">Optional</span>
                </label>
                <input
                  type="datetime-local"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors duration-200"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-300">
                  Description
                  <span className="ml-2 text-xs text-gray-600 font-normal">Optional</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors duration-200 resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-300">
                  Rules
                  <span className="ml-2 text-xs text-gray-600 font-normal">Optional</span>
                </label>
                <textarea
                  value={rules}
                  onChange={(e) => setRules(e.target.value)}
                  rows={5}
                  maxLength={5000}
                  placeholder="Enter tournament rules, format details, or any other important information..."
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors duration-200 resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="group w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm transition-all duration-200 shadow-lg shadow-violet-900/40"
              >
                {submitting ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Creating...
                  </>
                ) : (
                  <>
                    Create Tournament
                    <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform duration-200" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </>
                )}
              </button>

            </form>
          </div>

          <p className="text-center text-sm text-gray-600 mt-6">
            <a href="/tournaments" className="text-violet-400 hover:text-violet-300 transition-colors duration-200 font-medium">
              ← Back to Tournaments
            </a>
          </p>

        </div>
      </main>
    </div>
  );
}