"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";

function isSafeImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try { return new URL(url).protocol === "https:"; } catch { return false; }
}

type Tournament = {
  id: string;
  name: string;
  game: string;
  format: string;
  status: string;
  max_teams: number;
  prize_pool: string | null;
  start_date: string | null;
  registration_opens_at: string | null;
  description: string | null;
  banner_url: string | null;
  game_image_url: string | null;
  team_size: string | null;
  game_mode: string | null;
};

type TeamMember = {
  user_id: string;
  profiles: { username: string; activision_id: string | null } | null;
};

type Registration = {
  id: string;
  team_id: string;
  status: string;
  registered_at: string;
  teams: {
    team_name: string;
    team_tag: string;
    logo_url: string | null;
  } | null;
};

type Team = {
  id: string;
  team_name: string;
  team_tag: string;
};

type ActiveTab = "overview" | "participants";

export default function TournamentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const tournamentId = params.id as string;
  const supabase = useMemo(() => createClient(), []);

  const [username, setUsername] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [userTeams, setUserTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");
  const [participantSearch, setParticipantSearch] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageUploadError, setImageUploadError] = useState("");

  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState("");
  const [registerSuccess, setRegisterSuccess] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamMembersLoading, setTeamMembersLoading] = useState(false);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/sign-in"); return; }

      const [profileResult, tournamentResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("username, is_admin, role")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("tournaments")
          .select("id, name, game, format, status, max_teams, prize_pool, start_date, registration_opens_at, description, banner_url, game_image_url, team_size, game_mode")
          .eq("id", tournamentId)
          .maybeSingle(),
      ]);

      if (cancelled) return;

      setUsername(profileResult.data?.username ?? null);
      setIsAdmin(!!(profileResult.data?.is_admin || profileResult.data?.role === "owner" || profileResult.data?.role === "admin"));

      if (tournamentResult.error) {
        console.error("[tournament] query error:", tournamentResult.error.message, tournamentResult.error.code);
        setLoadError(true);
        setLoading(false);
        return;
      }
      if (!tournamentResult.data) { router.push("/tournaments"); return; }

      setTournament(tournamentResult.data);

      const [regsResult, captainResult] = await Promise.all([
        supabase
          .from("tournament_registrations")
          .select("id, team_id, status, registered_at, teams(team_name, team_tag, logo_url)")
          .eq("tournament_id", tournamentId)
          .order("registered_at", { ascending: true }),
        supabase
          .from("teams")
          .select("id, team_name, team_tag")
          .eq("captain_id", user.id),
      ]);

      if (cancelled) return;

      setRegistrations((regsResult.data ?? []) as unknown as Registration[]);

      const captainTeams = captainResult.data ?? [];
      const registeredIds = new Set((regsResult.data ?? []).map((r: { team_id: string }) => r.team_id));
      setUserTeams(captainTeams);
      const firstEligible = captainTeams.find((t) => !registeredIds.has(t.id));
      if (firstEligible) setSelectedTeamId(firstEligible.id);

      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [tournamentId, supabase, router]);

  function teamSizeNumber(ts: string | null | undefined): number {
    if (!ts) return 5;
    const n = parseInt(ts.split("v")[0], 10);
    return isNaN(n) ? 5 : n;
  }

  useEffect(() => {
    if (!selectedTeamId) return;
    let cancelled = false;
    setTeamMembersLoading(true);
    setSelectedMemberIds([]);
    supabase
      .from("team_members")
      .select("user_id, profiles(username, activision_id)")
      .eq("team_id", selectedTeamId)
      .then(({ data }) => {
        if (cancelled) return;
        setTeamMembers((data ?? []) as unknown as TeamMember[]);
        setTeamMembersLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedTeamId, supabase]);

  async function handleRegister() {
    setRegisterError("");
    setRegisterSuccess("");

    if (!selectedTeamId) {
      setRegisterError("Please select a team.");
      return;
    }

    const required = teamSizeNumber(tournament?.team_size);

    if (selectedMemberIds.length !== required) {
      setRegisterError(`Please select exactly ${required} player${required !== 1 ? "s" : ""} for this tournament.`);
      return;
    }

    setRegistering(true);

    const selectedMembers = teamMembers.filter((m) => selectedMemberIds.includes(m.user_id));
    const missingActivision = selectedMembers.filter((m) => !m.profiles?.activision_id);
    if (missingActivision.length > 0) {
      const names = missingActivision.map((m) => m.profiles?.username ?? "Unknown").join(", ");
      setRegisterError(`These selected players don't have an Activision ID: ${names}`);
      setRegistering(false);
      return;
    }

    const alreadyRegistered = registrations.some((r) => r.team_id === selectedTeamId);
    if (alreadyRegistered) {
      setRegisterError("This team is already registered.");
      setRegistering(false);
      return;
    }

    if (registrations.length >= (tournament?.max_teams ?? 0)) {
      setRegisterError("Tournament is full.");
      setRegistering(false);
      return;
    }

    const { data: rosterConflicts } = await supabase
      .from("tournament_roster")
      .select("user_id")
      .eq("tournament_id", tournamentId)
      .in("user_id", selectedMemberIds);

    if ((rosterConflicts ?? []).length > 0) {
      setRegisterError("One or more selected players are already registered in this tournament with another team.");
      setRegistering(false);
      return;
    }

    const { data: { user: freshUser } } = await supabase.auth.getUser();
    if (!freshUser) { router.push("/sign-in"); setRegistering(false); return; }

    const { data: freshTeam } = await supabase
      .from("teams")
      .select("captain_id")
      .eq("id", selectedTeamId)
      .maybeSingle();

    if (freshTeam?.captain_id !== freshUser.id) {
      setRegisterError("You are no longer the captain of this team.");
      setRegistering(false);
      return;
    }

    const regId = crypto.randomUUID();
    const { error } = await supabase
      .from("tournament_registrations")
      .insert({
        id: regId,
        tournament_id: tournamentId,
        team_id: selectedTeamId,
        status: "pending",
      });

    if (error) {
      setRegisterError("Failed to register. Please try again.");
      setRegistering(false);
      return;
    }

    const { error: rosterError } = await supabase
      .from("tournament_roster")
      .insert(
        selectedMemberIds.map((userId) => ({
          registration_id: regId,
          tournament_id: tournamentId,
          user_id: userId,
        }))
      );

    if (rosterError) {
      setRegisterError("Registered but failed to save player roster. Please contact an admin.");
      setRegistering(false);
      return;
    }

    const registeredTeam = userTeams.find((t) => t.id === selectedTeamId);
    if (registeredTeam) {
      setRegistrations((prev) => [...prev, {
        id: regId,
        team_id: selectedTeamId,
        status: "pending",
        registered_at: new Date().toISOString(),
        teams: { team_name: registeredTeam.team_name, team_tag: registeredTeam.team_tag, logo_url: null },
      }]);
    }

    setRegisterSuccess("Team registered successfully!");
    setRegistering(false);
    setTimeout(() => setRegisterSuccess(""), 3000);
  }

  async function handleGameImageUpload(file: File) {
    setUploadingImage(true);
    setImageUploadError("");
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `tournament-images/${tournamentId}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("match-proofs")
      .upload(path, file, { upsert: true });
    if (uploadError) {
      setImageUploadError("Failed to upload image.");
      setUploadingImage(false);
      return;
    }
    const { data: urlData } = supabase.storage.from("match-proofs").getPublicUrl(path);
    const publicUrl = urlData.publicUrl;
    const { error: updateError } = await supabase
      .from("tournaments")
      .update({ game_image_url: publicUrl })
      .eq("id", tournamentId);
    if (updateError) {
      setImageUploadError("Uploaded but failed to save URL.");
      setUploadingImage(false);
      return;
    }
    setTournament((prev) => prev ? { ...prev, game_image_url: publicUrl } : prev);
    setUploadingImage(false);
  }

  function statusConfig(status: string) {
    switch (status) {
      case "open": return { label: "Open", dot: "bg-green-400", text: "text-green-400", bg: "bg-green-500/10 border-green-500/30" };
      case "in_progress": return { label: "Live", dot: "bg-blue-400 animate-pulse", text: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/30" };
      case "completed": return { label: "Completed", dot: "bg-gray-400", text: "text-gray-400", bg: "bg-gray-500/10 border-gray-500/30" };
      case "cancelled": return { label: "Cancelled", dot: "bg-red-400", text: "text-red-400", bg: "bg-red-500/10 border-red-500/30" };
      default: return { label: "Draft", dot: "bg-yellow-400", text: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/30" };
    }
  }

  function formatLabel(format: string) {
    switch (format) {
      case "single_elimination": return "Single Elimination";
      case "double_elimination": return "Double Elimination";
      case "round_robin": return "Round Robin";
      default: return format;
    }
  }

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString("en-US", {
      year: "numeric", month: "short", day: "numeric",
    });
  }

  function fmtDateTime(d: string) {
    return new Date(d).toLocaleString("en-US", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  const isRegistrationOpen = tournament?.status === "open";
  const isFull = registrations.length >= (tournament?.max_teams ?? 0);
  const eligibleTeams = userTeams.filter((t) => !registrations.some((r) => r.team_id === t.id));
  const userTeamAlreadyRegistered = userTeams.length > 0 && userTeams.some((t) => registrations.some((r) => r.team_id === t.id));
  const requiredCount = teamSizeNumber(tournament?.team_size);

  const filteredRegistrations = registrations.filter((r) =>
    !participantSearch || r.teams?.team_name.toLowerCase().includes(participantSearch.toLowerCase()) || r.teams?.team_tag.toLowerCase().includes(participantSearch.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <svg className="w-8 h-8 animate-spin text-violet-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm text-gray-500">Loading tournament...</span>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-gray-950 text-white font-sans">
        <Navbar username={username} />
        <div className="flex flex-col items-center justify-center min-h-screen gap-4">
          <p className="text-gray-400 text-sm">Failed to load tournament. Check the browser console for details.</p>
          <a href="/tournaments" className="text-violet-400 hover:text-violet-300 text-sm transition-colors duration-200">← Back to Tournaments</a>
        </div>
      </div>
    );
  }

  if (!tournament) return null;

  const sc = statusConfig(tournament.status);

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans">
      <Navbar username={username} />

      {/* ── Banner / Hero ──────────────────────────────────────── */}
      <div className="relative w-full h-52 md:h-64 overflow-hidden">
        {isSafeImageUrl(tournament.banner_url) ? (
          <img
            src={tournament.banner_url!}
            alt={tournament.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-violet-900/60 via-indigo-900/40 to-gray-950" />
        )}
        {/* dark overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/50 to-transparent" />

        {/* Back link */}
        <div className="absolute top-20 left-0 right-0 px-6 max-w-5xl mx-auto">
          <a
            href="/tournaments"
            className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors duration-200"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            All Tournaments
          </a>
        </div>

        {/* Tournament title block */}
        <div className="absolute bottom-0 left-0 right-0 px-6 pb-5 max-w-5xl mx-auto">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${sc.bg} ${sc.text}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                  {sc.label}
                </span>
                <span className="text-xs text-gray-400">{tournament.game}</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight leading-tight">
                {tournament.name}
              </h1>
            </div>
            {isAdmin && (
              <a
                href={`/admin/tournaments/${tournament.id}`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-violet-500/40 bg-violet-500/10 text-violet-300 text-sm font-medium hover:bg-violet-500/20 transition-all duration-200 shrink-0"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Manage
              </a>
            )}
          </div>
        </div>
      </div>

      {/* ── Tab Navigation ─────────────────────────────────────── */}
      <div className="border-b border-white/8 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6">
          <nav className="flex items-center gap-0 -mb-px">
            {(["overview", "participants"] as ActiveTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-3.5 text-sm font-medium border-b-2 transition-all duration-150 capitalize ${
                  activeTab === tab
                    ? "border-violet-500 text-violet-400"
                    : "border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-600"
                }`}
              >
                {tab === "participants" ? `Participants (${registrations.length})` : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
            <a
              href={`/tournaments/${tournament.id}/bracket`}
              className="px-4 py-3.5 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-600 transition-all duration-150"
            >
              Bracket
            </a>
            <a
              href={`/tournaments/${tournament.id}/rules`}
              className="px-4 py-3.5 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-600 transition-all duration-150"
            >
              Rules
            </a>
          </nav>
        </div>
      </div>

      {/* ── Tab Content ────────────────────────────────────────── */}
      <main className="max-w-5xl mx-auto px-6 py-8">

        {/* ══ OVERVIEW TAB ══ */}
        {activeTab === "overview" && (
          <div className="space-y-6">

            {/* Description */}
            {tournament.description && (
              <div className="rounded-2xl border border-white/8 bg-white/4 p-6">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">About</h2>
                <p className="text-sm text-gray-300 leading-relaxed">{tournament.description}</p>
              </div>
            )}

            {/* Details grid */}
            <div className="rounded-2xl border border-white/8 bg-white/4 p-6">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Details</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-gray-500">Format</p>
                  <p className="text-sm font-medium text-white">{formatLabel(tournament.format)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-gray-500">Teams</p>
                  <p className="text-sm font-medium text-white">{registrations.length} / {tournament.max_teams}</p>
                </div>
                {tournament.team_size && (
                  <div className="space-y-1">
                    <p className="text-xs text-gray-500">Team Size</p>
                    <p className="text-sm font-medium text-white">{tournament.team_size}</p>
                  </div>
                )}
                {tournament.game_mode && (
                  <div className="space-y-1">
                    <p className="text-xs text-gray-500">Game Mode</p>
                    <p className="text-sm font-medium text-white">{tournament.game_mode}</p>
                  </div>
                )}
                {tournament.registration_opens_at && (
                  <div className="space-y-1">
                    <p className="text-xs text-gray-500">Registration Opens</p>
                    <p className="text-sm font-medium text-white">{fmtDateTime(tournament.registration_opens_at)}</p>
                  </div>
                )}
                {tournament.start_date && (
                  <div className="space-y-1">
                    <p className="text-xs text-gray-500">Starts</p>
                    <p className="text-sm font-medium text-white">{fmtDateTime(tournament.start_date)}</p>
                  </div>
                )}
                {tournament.prize_pool && (
                  <div className="space-y-1">
                    <p className="text-xs text-gray-500">Prize Pool</p>
                    <p className="text-sm font-medium text-yellow-400">{tournament.prize_pool}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Game image */}
            {(tournament.game_image_url || isAdmin) && (
              <div className="rounded-2xl border border-white/8 bg-white/4 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Game Image</h2>
                  {isAdmin && (
                    <label className="cursor-pointer">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/8 hover:bg-white/12 border border-white/10 text-gray-300 text-xs font-medium transition-all duration-200">
                        {uploadingImage ? (
                          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                          </svg>
                        )}
                        {uploadingImage ? "Uploading..." : tournament.game_image_url ? "Change Image" : "Upload Image"}
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={uploadingImage}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleGameImageUpload(file);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  )}
                </div>
                {imageUploadError && (
                  <p className="text-xs text-red-400">{imageUploadError}</p>
                )}
                {isSafeImageUrl(tournament.game_image_url) ? (
                  <img
                    src={tournament.game_image_url!}
                    alt={tournament.game}
                    className="w-full max-h-64 object-cover rounded-xl border border-white/8"
                  />
                ) : (
                  <div className="w-full h-32 rounded-xl border border-dashed border-white/15 flex items-center justify-center text-gray-600 text-sm">
                    {isAdmin ? "Upload a game image above" : "No image yet"}
                  </div>
                )}
              </div>
            )}

            {/* Registration status / CTA */}
            {userTeamAlreadyRegistered && (
              <div className="flex items-center gap-3 px-5 py-4 rounded-2xl bg-green-500/8 border border-green-500/20 text-green-400 text-sm">
                <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Your team is registered in this tournament.</span>
                <a
                  href={`/tournaments/${tournament.id}/bracket`}
                  className="ml-auto text-xs font-medium text-green-300 hover:text-green-200 transition-colors"
                >
                  View Bracket →
                </a>
              </div>
            )}

            {isFull && !userTeamAlreadyRegistered && (
              <div className="flex items-center gap-3 px-5 py-4 rounded-2xl bg-red-500/8 border border-red-500/20 text-red-400 text-sm">
                <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                Tournament is full — registration is closed.
              </div>
            )}

            {/* Register form */}
            {isRegistrationOpen && eligibleTeams.length > 0 && !isFull && (
              <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-6 space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-violet-500/20 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h2 className="text-sm font-semibold text-white">Register Your Team</h2>
                </div>

                {registerError && (
                  <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                    <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                    {registerError}
                  </div>
                )}

                {registerSuccess && (
                  <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {registerSuccess}
                  </div>
                )}

                {/* Team selector */}
                {eligibleTeams.length > 1 ? (
                  <select
                    value={selectedTeamId}
                    onChange={(e) => setSelectedTeamId(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-gray-900 border border-white/10 text-white text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                  >
                    {eligibleTeams.map((t) => (
                      <option key={t.id} value={t.id}>{t.team_name}</option>
                    ))}
                  </select>
                ) : (
                  <div className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm">
                    {eligibleTeams[0]?.team_name}
                  </div>
                )}

                {/* Member picker */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500">
                      Select {requiredCount} player{requiredCount !== 1 ? "s" : ""} who will compete
                    </p>
                    <p className={`text-xs font-medium ${selectedMemberIds.length === requiredCount ? "text-green-400" : "text-gray-500"}`}>
                      {selectedMemberIds.length}/{requiredCount} selected
                    </p>
                  </div>

                  {teamMembersLoading ? (
                    <p className="text-xs text-gray-600 italic py-2">Loading members...</p>
                  ) : teamMembers.length === 0 ? (
                    <p className="text-xs text-gray-600 italic py-2">No members found.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {teamMembers.map((m) => {
                        const isChecked = selectedMemberIds.includes(m.user_id);
                        const canCheck = isChecked || selectedMemberIds.length < requiredCount;
                        return (
                          <label
                            key={m.user_id}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all duration-150 ${
                              isChecked
                                ? "bg-violet-500/10 border-violet-500/30 cursor-pointer"
                                : canCheck
                                ? "bg-white/3 border-white/8 hover:bg-white/5 cursor-pointer"
                                : "bg-white/3 border-white/8 opacity-40 cursor-not-allowed"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={!canCheck}
                              onChange={() => {
                                if (isChecked) {
                                  setSelectedMemberIds((prev) => prev.filter((id) => id !== m.user_id));
                                } else if (canCheck) {
                                  setSelectedMemberIds((prev) => [...prev, m.user_id]);
                                }
                              }}
                              className="w-3.5 h-3.5 rounded accent-violet-500 shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-white truncate">{m.profiles?.username ?? "Unknown"}</p>
                              {m.profiles?.activision_id ? (
                                <p className="text-xs text-gray-500 truncate">{m.profiles.activision_id}</p>
                              ) : (
                                <p className="text-xs text-red-400/70">No Activision ID</p>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                <button
                  onClick={handleRegister}
                  disabled={registering || selectedMemberIds.length !== requiredCount}
                  className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-all duration-200"
                >
                  {registering ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : `Register (${selectedMemberIds.length}/${requiredCount} selected)`}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ══ PARTICIPANTS TAB ══ */}
        {activeTab === "participants" && (
          <div className="space-y-5">
            {/* Search */}
            <div className="relative">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text"
                placeholder="Search teams..."
                value={participantSearch}
                onChange={(e) => setParticipantSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors"
              />
            </div>

            {filteredRegistrations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <svg className="w-10 h-10 text-gray-700" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                </svg>
                <p className="text-sm text-gray-600">
                  {participantSearch ? "No teams match your search." : "No teams registered yet."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredRegistrations.map((reg, index) => (
                  <div
                    key={reg.id}
                    className="flex items-center gap-4 px-4 py-3.5 rounded-2xl border border-white/8 bg-white/4 hover:bg-white/6 transition-colors duration-150"
                  >
                    {/* Seed number */}
                    <span className="text-xs text-gray-600 font-mono w-4 shrink-0">{index + 1}</span>

                    {/* Team logo / tag */}
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-indigo-600/20 border border-violet-500/20 flex items-center justify-center shrink-0">
                      {isSafeImageUrl(reg.teams?.logo_url) ? (
                        <img src={reg.teams!.logo_url!} alt={reg.teams!.team_name} className="w-full h-full object-cover rounded-xl" />
                      ) : (
                        <span className="text-xs font-bold text-violet-300">{reg.teams?.team_tag ?? "?"}</span>
                      )}
                    </div>

                    {/* Name + date */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{reg.teams?.team_name ?? "Unknown"}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{fmtDate(reg.registered_at)}</p>
                    </div>

                    {/* Registered badge */}
                    <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 border border-green-500/20 text-green-400">
                      Registered
                    </span>
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs text-gray-600 text-center">
              {registrations.length} / {tournament.max_teams} spots filled
            </p>
          </div>
        )}

      </main>
    </div>
  );
}
