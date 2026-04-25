"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";
import BadgeList from "@/components/BadgeList";
import { FaTwitch, FaYoutube, FaTiktok, FaXTwitter } from "react-icons/fa6";

type Profile = {
  id: string;
  username: string;
  activision_id: string | null;
  created_at: string;
  avatar_url: string | null;
  role: string | null;
  badges: object[] | null;
  twitch_url: string | null;
  youtube_url: string | null;
  x_url: string | null;
  tiktok_url: string | null;
};

type TeamWithRole = {
  id: string;
  team_name: string;
  team_tag: string;
  created_at: string;
  isCaptain: boolean;
};

type Tab = "overview" | "teams";

type LockReason = {
  kind: "tournament" | "season";
  name: string;
  teamName: string;
} | null;

function roleBadgeInfo(role: string | null | undefined): { label: string; classes: string } {
  if (role === "owner") return { label: "Owner", classes: "bg-yellow-500/15 border-yellow-500/30 text-yellow-300" };
  if (role === "admin") return { label: "Admin", classes: "bg-blue-500/15 border-blue-500/30 text-blue-300" };
  return { label: "Player", classes: "bg-violet-500/15 border-violet-500/30 text-violet-300" };
}

const SOCIAL_DOMAINS: Record<string, string[]> = {
  twitch_url:  ["twitch.tv", "www.twitch.tv"],
  youtube_url: ["youtube.com", "www.youtube.com", "youtu.be"],
  x_url:       ["x.com", "www.x.com", "twitter.com", "www.twitter.com"],
  tiktok_url:  ["tiktok.com", "www.tiktok.com"],
};

function validateSocialUrl(field: string, url: string): string | null {
  if (!url.trim()) return null;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "https:") return "Must be an https:// link.";
    if (!(SOCIAL_DOMAINS[field] ?? []).includes(parsed.hostname)) return "Invalid domain.";
    return null;
  } catch {
    return "Invalid URL.";
  }
}

export default function ProfilePage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [teams, setTeams] = useState<TeamWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [lockReason, setLockReason] = useState<LockReason>(null);
  const [stats, setStats] = useState({ matches: 0, wins: 0, winRate: 0 });

  const [editMode, setEditMode] = useState(false);
  const [activisionInput, setActivisionInput] = useState("");
  const [twitchInput, setTwitchInput] = useState("");
  const [youtubeInput, setYoutubeInput] = useState("");
  const [xInput, setXInput] = useState("");
  const [tiktokInput, setTiktokInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState("");
  const [saveError, setSaveError] = useState("");

  const tournamentLocked = lockReason !== null;

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [avatarCacheBuster, setAvatarCacheBuster] = useState(0);

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

      // Round 1: profile + team memberships in parallel
      const [profileResult, memberResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, username, activision_id, created_at, avatar_url, role, badges, twitch_url, youtube_url, x_url, tiktok_url")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("team_members")
          .select("team_id, teams(id, team_name, team_tag, created_at, captain_id)")
          .eq("user_id", user.id),
      ]);

      if (cancelled) return;
      if (!profileResult.data) {
        router.push("/");
        return;
      }

      type MemberRow = {
        team_id: string;
        teams: {
          id: string;
          team_name: string;
          team_tag: string;
          created_at: string;
          captain_id: string;
        } | null;
      };

      const memberRows = (memberResult.data ?? []) as unknown as MemberRow[];
      const teamIds = memberRows.map((r) => r.team_id);

      const allTeams: TeamWithRole[] = memberRows
        .filter((r) => r.teams !== null)
        .map((r) => ({
          id: r.teams!.id,
          team_name: r.teams!.team_name,
          team_tag: r.teams!.team_tag,
          created_at: r.teams!.created_at,
          isCaptain: r.teams!.captain_id === user.id,
        }))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      type TourLockRow = { team_id: string; tournaments: { name: string } | null };
      type SeasonLockRow = { team_id: string; seasons: { name: string } | null };

      // Round 2 (if user has teams): lock checks + stats in parallel
      let computedLockReason: LockReason = null;
      let totalWins = 0;
      let totalLosses = 0;

      if (teamIds.length > 0) {
        const [{ data: tourLock }, { data: seasonLock }, { data: standingsData }] =
          await Promise.all([
            supabase
              .from("tournament_registrations")
              .select("team_id, tournaments!inner(name, status)")
              .in("team_id", teamIds)
              .filter("tournaments.status", "in", `("open","in_progress")`)
              .limit(1),
            supabase
              .from("season_standings")
              .select("team_id, seasons!inner(name, status)")
              .in("team_id", teamIds)
              .filter("seasons.status", "eq", "active")
              .limit(1),
            supabase
              .from("season_standings")
              .select("wins, losses")
              .in("team_id", teamIds),
          ]);

        if (cancelled) return;

        const tourRows = (tourLock ?? []) as unknown as TourLockRow[];
        const seasonRows = (seasonLock ?? []) as unknown as SeasonLockRow[];

        if (tourRows.length > 0) {
          const row = tourRows[0];
          const team = allTeams.find((t) => t.id === row.team_id);
          computedLockReason = {
            kind: "tournament",
            name: row.tournaments?.name ?? "a tournament",
            teamName: team?.team_name ?? "your team",
          };
        } else if (seasonRows.length > 0) {
          const row = seasonRows[0];
          const team = allTeams.find((t) => t.id === row.team_id);
          computedLockReason = {
            kind: "season",
            name: row.seasons?.name ?? "an active season",
            teamName: team?.team_name ?? "your team",
          };
        }

        const standings = (standingsData ?? []) as { wins: number; losses: number }[];
        totalWins = standings.reduce((sum, s) => sum + (s.wins ?? 0), 0);
        totalLosses = standings.reduce((sum, s) => sum + (s.losses ?? 0), 0);
      }

      const totalMatches = totalWins + totalLosses;
      const winRate = totalMatches > 0 ? Math.round((totalWins / totalMatches) * 100) : 0;

      setProfile(profileResult.data);
      setActivisionInput(profileResult.data.activision_id ?? "");
      setTwitchInput(profileResult.data.twitch_url ?? "");
      setYoutubeInput(profileResult.data.youtube_url ?? "");
      setXInput(profileResult.data.x_url ?? "");
      setTiktokInput(profileResult.data.tiktok_url ?? "");
      setTeams(allTeams);
      setLockReason(computedLockReason);
      setStats({ matches: totalMatches, wins: totalWins, winRate });
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, router]);

  async function handleSave() {
    if (!profile || tournamentLocked) return;
    setSaving(true);
    setSaveError("");
    setSaveSuccess("");

    const socialFields: [string, string, string][] = [
      ["twitch_url",  "Twitch",  twitchInput],
      ["youtube_url", "YouTube", youtubeInput],
      ["x_url",       "X",       xInput],
      ["tiktok_url",  "TikTok",  tiktokInput],
    ];
    for (const [key, label, value] of socialFields) {
      const err = validateSocialUrl(key, value);
      if (err) { setSaveError(`${label}: ${err}`); setSaving(false); return; }
    }

    const { data: { user: freshUser } } = await supabase.auth.getUser();
    if (!freshUser) { router.push("/sign-in"); setSaving(false); return; }
    if (freshUser.id !== profile.id) { setSaveError("Session mismatch. Please sign in again."); setSaving(false); return; }

    const trimmed = activisionInput.trim();

    const { error } = await supabase
      .from("profiles")
      .update({
        activision_id: trimmed || null,
        twitch_url:    twitchInput.trim()  || null,
        youtube_url:   youtubeInput.trim() || null,
        x_url:         xInput.trim()       || null,
        tiktok_url:    tiktokInput.trim()  || null,
      })
      .eq("id", freshUser.id);

    if (error) {
      setSaveError("Failed to save. Please try again.");
      setSaving(false);
      return;
    }

    setProfile({
      ...profile,
      activision_id: trimmed || null,
      twitch_url:    twitchInput.trim()  || null,
      youtube_url:   youtubeInput.trim() || null,
      x_url:         xInput.trim()       || null,
      tiktok_url:    tiktokInput.trim()  || null,
    });
    setSaveSuccess("Profile updated successfully.");
    setEditMode(false);
    setSaving(false);
    setTimeout(() => setSaveSuccess(""), 3000);
  }

  function handleCancelEdit() {
    setEditMode(false);
    setActivisionInput(profile?.activision_id ?? "");
    setTwitchInput(profile?.twitch_url ?? "");
    setYoutubeInput(profile?.youtube_url ?? "");
    setXInput(profile?.x_url ?? "");
    setTiktokInput(profile?.tiktok_url ?? "");
    setSaveError("");
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setAvatarError("Only JPG, PNG, or WEBP images are allowed.");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setAvatarError("Image must be under 2MB.");
      return;
    }

    setAvatarUploading(true);
    setAvatarError("");

    const { data: { user: freshUser } } = await supabase.auth.getUser();
    if (!freshUser) { router.push("/sign-in"); setAvatarUploading(false); return; }
    if (freshUser.id !== profile.id) { setAvatarError("Session mismatch. Please sign in again."); setAvatarUploading(false); return; }

    const rawExt = file.name.split(".").pop()?.toLowerCase() ?? "";
    const allowedExts = ["jpg", "jpeg", "png", "webp"];
    if (!allowedExts.includes(rawExt)) {
      setAvatarError("Invalid file type. Use JPG, PNG, or WEBP.");
      setAvatarUploading(false);
      return;
    }
    const ext = rawExt;
    const path = "avatars/" + freshUser.id + "." + ext;

    const { error: uploadErr } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true });

    if (uploadErr) {
      setAvatarError("Upload failed. Check that the avatars bucket exists.");
      setAvatarUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);

    // Store clean URL without timestamp; cache-bust only at render time
    const publicUrl = urlData.publicUrl;

    await supabase
      .from("profiles")
      .update({ avatar_url: publicUrl })
      .eq("id", freshUser.id);

    setProfile({ ...profile, avatar_url: publicUrl });
    setAvatarCacheBuster(Date.now());
    setAvatarUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function formatLong(d: string) {
    return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long" });
  }

  function formatShort(d: string) {
    return new Date(d).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <svg className="w-8 h-8 animate-spin text-violet-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm text-gray-500">Loading profile...</span>
        </div>
      </div>
    );
  }

  if (!profile) return null;

  const initial = profile.username.charAt(0).toUpperCase();
  const { label: roleLabel, classes: roleClasses } = roleBadgeInfo(profile.role);
  const isCaptainOfATeam = teams.some((t) => t.isCaptain);
  // Strip any stored query string so cache-busting is controlled entirely by avatarCacheBuster
  const cleanAvatarUrl = profile.avatar_url?.split("?")[0] ?? null;
  const avatarSrc = cleanAvatarUrl
    ? cleanAvatarUrl + (avatarCacheBuster ? `?t=${avatarCacheBuster}` : "")
    : null;

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans">
      <Navbar username={profile.username} />

      <main className="max-w-3xl mx-auto px-6 pt-28 pb-20 space-y-5">

        {saveSuccess && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {saveSuccess}
          </div>
        )}

        {/* Header Card */}
        <div className="relative rounded-2xl border border-white/10 bg-white/5 p-6 overflow-hidden">
          <div className="absolute -top-16 -left-16 w-64 h-64 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative flex items-center gap-5">

            {/* Avatar */}
            <div className="relative shrink-0 group">
              <button
                type="button"
                title="Change avatar"
                disabled={avatarUploading}
                onClick={() => fileInputRef.current?.click()}
                className="relative w-20 h-20 rounded-2xl overflow-hidden focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-gray-950"
              >
                {avatarSrc ? (
                  <img src={avatarSrc} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-2xl font-extrabold text-white">
                    {initial}
                  </div>
                )}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                  {avatarUploading ? (
                    <svg className="w-5 h-5 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                    </svg>
                  )}
                </div>
              </button>
              <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-green-400 border-2 border-gray-950 z-10" />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-extrabold text-white tracking-tight">
                  {profile.username}
                </h1>
                <span className={`px-2 py-0.5 rounded-full border text-xs font-medium ${roleClasses}`}>
                  {roleLabel}
                </span>
              </div>
              <BadgeList badges={profile.badges} />
              <p className="text-sm text-gray-500 mt-1">
                Member since {formatLong(profile.created_at)}
              </p>
              {!editMode && (profile.twitch_url || profile.youtube_url || profile.x_url || profile.tiktok_url) && (
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {profile.twitch_url && (
                    <a href={profile.twitch_url} target="_blank" rel="noopener noreferrer" aria-label="Twitch"
                      className="flex items-center justify-center w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-300 hover:bg-purple-500/20 transition-colors duration-150">
                      <FaTwitch className="w-3.5 h-3.5" />
                    </a>
                  )}
                  {profile.youtube_url && (
                    <a href={profile.youtube_url} target="_blank" rel="noopener noreferrer" aria-label="YouTube"
                      className="flex items-center justify-center w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 hover:bg-red-500/20 transition-colors duration-150">
                      <FaYoutube className="w-3.5 h-3.5" />
                    </a>
                  )}
                  {profile.x_url && (
                    <a href={profile.x_url} target="_blank" rel="noopener noreferrer" aria-label="X"
                      className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 transition-colors duration-150">
                      <FaXTwitter className="w-3.5 h-3.5" />
                    </a>
                  )}
                  {profile.tiktok_url && (
                    <a href={profile.tiktok_url} target="_blank" rel="noopener noreferrer" aria-label="TikTok"
                      className="flex items-center justify-center w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 hover:bg-cyan-500/20 transition-colors duration-150">
                      <FaTiktok className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              )}
              {avatarError && (
                <p className="text-xs text-red-400 mt-1">{avatarError}</p>
              )}
            </div>

            {/* Edit Profile button — hidden when locked */}
            {!tournamentLocked && (
              <button
                type="button"
                onClick={() => {
                  setEditMode((prev) => !prev);
                  setSaveError("");
                }}
                className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-sm text-gray-300 hover:text-white transition-all duration-200 shrink-0"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                </svg>
                {editMode ? "Cancel Edit" : "Edit Profile"}
              </button>
            )}
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Matches", value: String(stats.matches) },
            { label: "Wins", value: String(stats.wins) },
            { label: "Win Rate", value: stats.winRate + "%" },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="rounded-2xl border border-white/10 bg-white/5 p-5 flex flex-col items-center gap-1 hover:border-violet-500/30 transition-colors duration-300"
            >
              <span className="text-2xl font-extrabold text-white">{value}</span>
              <span className="text-xs text-gray-500 font-medium">{label}</span>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-white/10">
          {(["overview", "teams"] as Tab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={
                "px-5 py-3 text-sm font-medium capitalize transition-all duration-200 border-b-2 -mb-px " +
                (activeTab === tab
                  ? "border-violet-500 text-white"
                  : "border-transparent text-gray-500 hover:text-gray-300")
              }
            >
              {tab}
              {tab === "teams" && teams.length > 0 && (
                <span className="ml-2 px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 text-xs">
                  {teams.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === "overview" && (
          <div className="space-y-5">

            {/* Titles */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                <h2 className="text-sm font-semibold text-white">Titles</h2>
              </div>
              <div className="flex items-center justify-center py-6">
                <p className="text-sm text-gray-600 italic">
                  You have not earned any titles yet
                </p>
              </div>
            </div>

            {/* Activision ID */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-orange-500/15 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-orange-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-white">Activision ID</h2>
                    <p className="text-xs text-gray-500">Your Call of Duty account</p>
                  </div>
                </div>

                {tournamentLocked ? (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-400 text-xs font-medium">
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                    </svg>
                    Locked
                  </div>
                ) : (
                  !editMode && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditMode(true);
                        setSaveError("");
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-xs text-gray-300 hover:text-white transition-all duration-200"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
                      </svg>
                      {profile.activision_id ? "Edit" : "Add"}
                    </button>
                  )
                )}
              </div>

              {lockReason && (
                <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-300 text-sm mb-4">
                  <svg className="w-4 h-4 mt-0.5 shrink-0 text-amber-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  <p>
                    You are registered in{" "}
                    <span className="font-semibold text-amber-200">{lockReason.name}</span>
                    {" "}with team{" "}
                    <span className="font-semibold text-amber-200">{lockReason.teamName}</span>.
                    {" "}Your Activision ID cannot be changed during active participation.
                  </p>
                </div>
              )}

              {saveError && (
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-4">
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  {saveError}
                </div>
              )}

              {!tournamentLocked && editMode ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={activisionInput}
                    onChange={(e) => setActivisionInput(e.target.value)}
                    autoFocus
                    placeholder="YourName#1234"
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors duration-200"
                  />

                  <div className="pt-3 border-t border-white/8 space-y-2">
                    <p className="text-xs text-gray-500 font-medium">Social Links <span className="text-gray-700">— https:// only</span></p>
                    {([
                      { key: "twitch",  icon: <FaTwitch  className="w-3.5 h-3.5 text-purple-400" />, label: "Twitch",  value: twitchInput,  set: setTwitchInput,  placeholder: "https://twitch.tv/yourname"      },
                      { key: "youtube", icon: <FaYoutube  className="w-3.5 h-3.5 text-red-400"    />, label: "YouTube", value: youtubeInput, set: setYoutubeInput, placeholder: "https://youtube.com/@yourchannel"  },
                      { key: "x",       icon: <FaXTwitter className="w-3.5 h-3.5 text-white"      />, label: "X",       value: xInput,       set: setXInput,       placeholder: "https://x.com/yourhandle"        },
                      { key: "tiktok",  icon: <FaTiktok   className="w-3.5 h-3.5 text-cyan-400"   />, label: "TikTok",  value: tiktokInput,  set: setTiktokInput,  placeholder: "https://tiktok.com/@yourname"    },
                    ] as { key: string; icon: React.ReactNode; label: string; value: string; set: (v: string) => void; placeholder: string }[]).map(({ key, icon, label, value, set, placeholder }) => (
                      <div key={key} className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">{icon}</div>
                        <input
                          type="url"
                          value={value}
                          onChange={(e) => set(e.target.value)}
                          placeholder={placeholder}
                          aria-label={label}
                          className="flex-1 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors duration-200"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-all duration-200"
                    >
                      {saving ? (
                        <>
                          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Saving...
                        </>
                      ) : (
                        "Save"
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="px-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-sm text-gray-400 hover:text-white transition-all duration-200"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className={
                    "flex items-center gap-3 px-4 py-3 rounded-xl border " +
                    (tournamentLocked
                      ? "border-white/5 bg-white/3 opacity-75"
                      : "border-white/8 bg-white/3")
                  }
                >
                  {profile.activision_id ? (
                    <>
                      <span
                        className={
                          "w-2 h-2 rounded-full shrink-0 " +
                          (tournamentLocked ? "bg-amber-400" : "bg-orange-400")
                        }
                      />
                      <span className="text-sm text-white font-medium">
                        {profile.activision_id}
                      </span>
                    </>
                  ) : (
                    <span className="text-sm text-gray-600 italic">
                      {tournamentLocked
                        ? "No Activision ID set"
                        : "Not set — add your Activision ID"}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Teams Tab */}
        {activeTab === "teams" && (
          <div className="space-y-4">
            {teams.length > 0 ? (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500">
                    {teams.length} team{teams.length !== 1 ? "s" : ""}
                  </p>
                  {!isCaptainOfATeam && (
                    <a
                      href="/create-team"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-xs text-gray-300 hover:text-white transition-all duration-200"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                      Create Team
                    </a>
                  )}
                </div>

                {teams.map((team) => (
                  <a
                    key={team.id}
                    href={"/team/" + team.id}
                    className="group relative flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 hover:border-violet-500/30 p-5 transition-all duration-200 overflow-hidden"
                  >
                    <div className="absolute -top-8 -right-8 w-32 h-32 bg-violet-600/10 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                    <div className="relative flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500/20 to-indigo-600/20 border border-violet-500/20 flex items-center justify-center shrink-0">
                        <span className="text-sm font-extrabold text-violet-300 tracking-wider">
                          {team.team_tag}
                        </span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="text-base font-bold text-white">
                            {team.team_name}
                          </h2>
                          <span className={`px-2 py-0.5 rounded-full border text-xs font-medium ${
                            team.isCaptain
                              ? "bg-violet-500/15 border-violet-500/25 text-violet-300"
                              : "bg-white/5 border-white/15 text-gray-400"
                          }`}>
                            {team.isCaptain ? "Captain" : "Member"}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Created {formatShort(team.created_at)}
                        </p>
                      </div>
                    </div>
                    <svg
                      className="relative w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors shrink-0"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </a>
                ))}
              </>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-12 flex flex-col items-center justify-center text-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                  <svg className="w-7 h-7 text-gray-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-white font-semibold">You are not part of any team yet</p>
                  <p className="text-gray-500 text-sm mt-1">Create or join a team to start competing</p>
                </div>
                <a
                  href="/create-team"
                  className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-all duration-200 shadow-lg shadow-violet-900/40"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Create Team
                </a>
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  );
}
