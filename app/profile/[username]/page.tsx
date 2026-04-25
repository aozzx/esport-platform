"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";
import BadgeList from "@/components/BadgeList";

function isSafeImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try { return new URL(url).protocol === "https:"; } catch { return false; }
}

function roleBadgeInfo(role: string | null | undefined): { label: string; classes: string } {
  if (role === "owner") return { label: "Owner", classes: "bg-yellow-500/15 border-yellow-500/30 text-yellow-300" };
  if (role === "admin") return { label: "Admin", classes: "bg-blue-500/15 border-blue-500/30 text-blue-300" };
  return { label: "Player", classes: "bg-violet-500/15 border-violet-500/30 text-violet-300" };
}

type Profile = {
  id: string;
  username: string;
  activision_id: string | null;
  avatar_url: string | null;
  role: string | null;
  badges: object[] | null;
};

type TeamInfo = {
  team_id: string;
  is_captain: boolean;
  teams: {
    team_name: string;
    team_tag: string;
    logo_url: string | null;
  } | null;
};

type RawMembership = {
  team_id: string;
  teams: { team_name: unknown; team_tag: unknown; logo_url: unknown; captain_id: unknown } | null;
};

export default function PublicProfilePage() {
  const router = useRouter();
  const params = useParams();
  const targetUsername = params.username as string;
  const supabase = useMemo(() => createClient(), []);

  const [viewerUsername, setViewerUsername] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [teamInfo, setTeamInfo] = useState<TeamInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/sign-in"); return; }

      const { data: viewerProfile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .maybeSingle();
      setViewerUsername(viewerProfile?.username ?? null);

      const { data: targetProfile } = await supabase
        .from("profiles")
        .select("id, username, activision_id, avatar_url, role, badges")
        .eq("username", targetUsername)
        .maybeSingle();

      if (!targetProfile) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setProfile(targetProfile as Profile);

      const { data: membership } = await supabase
        .from("team_members")
        .select("team_id, teams(team_name, team_tag, logo_url, captain_id)")
        .eq("user_id", targetProfile.id)
        .maybeSingle();

      if (membership) {
        const raw = membership as unknown as RawMembership;
        setTeamInfo({
          team_id: raw.team_id,
          is_captain: raw.teams?.captain_id === targetProfile.id,
          teams: raw.teams ? {
            team_name: String(raw.teams.team_name ?? ""),
            team_tag: String(raw.teams.team_tag ?? ""),
            logo_url: raw.teams.logo_url != null ? String(raw.teams.logo_url) : null,
          } : null,
        });
      }

      setLoading(false);
    }
    load();
  }, [targetUsername, supabase, router]);

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

  if (notFound) {
    return (
      <div className="min-h-screen bg-gray-950 text-white font-sans">
        <Navbar username={viewerUsername} />
        <main className="max-w-2xl mx-auto px-6 pt-28 pb-20 text-center space-y-4">
          <p className="text-gray-400 font-medium">Player not found.</p>
          <p className="text-sm text-gray-600">No account exists with the username &ldquo;{targetUsername}&rdquo;.</p>
          <button
            onClick={() => router.back()}
            className="text-sm text-violet-400 hover:text-violet-300 transition-colors duration-200"
          >
            ← Go back
          </button>
        </main>
      </div>
    );
  }

  const roleBadge = roleBadgeInfo(profile!.role);

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans">
      <Navbar username={viewerUsername} />

      <main className="max-w-2xl mx-auto px-6 pt-28 pb-20 space-y-5">

        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-300 transition-colors duration-200"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back
        </button>

        {/* Profile card */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-center gap-5">
            <div className="w-20 h-20 rounded-2xl overflow-hidden shrink-0 bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
              {isSafeImageUrl(profile!.avatar_url) ? (
                <img src={profile!.avatar_url!} alt={profile!.username} className="w-full h-full object-cover" />
              ) : (
                <span className="text-3xl font-bold text-white">
                  {profile!.username.charAt(0).toUpperCase()}
                </span>
              )}
            </div>

            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-extrabold text-white tracking-tight truncate">
                  {profile!.username}
                </h1>
                <BadgeList badges={profile!.badges} />
              </div>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${roleBadge.classes}`}>
                {roleBadge.label}
              </span>
            </div>
          </div>

          {/* Activision ID */}
          <div className="mt-5 pt-5 border-t border-white/8">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1.5">Activision ID</p>
            {profile!.activision_id ? (
              <p className="text-sm font-medium text-white font-mono">{profile!.activision_id}</p>
            ) : (
              <p className="text-sm text-gray-600 italic">Not set</p>
            )}
          </div>
        </div>

        {/* Team */}
        {teamInfo?.teams && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-3">Team</p>
            <a
              href={`/teams/${teamInfo.team_id}`}
              className="flex items-center gap-3 group"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-indigo-600/20 border border-violet-500/20 flex items-center justify-center shrink-0">
                {isSafeImageUrl(teamInfo.teams.logo_url) ? (
                  <img src={teamInfo.teams.logo_url!} alt={teamInfo.teams.team_name} className="w-full h-full object-cover rounded-xl" />
                ) : (
                  <span className="text-xs font-bold text-violet-300">{teamInfo.teams.team_tag}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white group-hover:text-violet-300 transition-colors duration-150 truncate">
                  {teamInfo.teams.team_name}
                </p>
                {teamInfo.is_captain && (
                  <p className="text-xs text-yellow-400 mt-0.5">Captain</p>
                )}
              </div>
              <svg className="w-4 h-4 text-gray-600 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </a>
          </div>
        )}

      </main>
    </div>
  );
}
