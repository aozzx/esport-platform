"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";
import BadgeList from "@/components/BadgeList";

function isSafeImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try { return new URL(url).protocol === "https:"; } catch { return false; }
}

type Team = {
  id: string;
  team_name: string;
  team_tag: string;
  logo_url: string | null;
  captain_id: string;
  created_at: string;
  badges: object[] | null;
};

type Member = {
  user_id: string;
  role: string;
  joined_at: string;
  profiles: {
    username: string;
    avatar_url: string | null;
  } | null;
};

export default function TeamPage() {
  const router = useRouter();
  const params = useParams();
  const teamId = params.id as string;
  const supabase = useMemo(() => createClient(), []);

  const [username, setUsername] = useState<string | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCaptain, setIsCaptain] = useState(false);

  const [inviteUsername, setInviteUsername] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [inviteCooldownUntil, setInviteCooldownUntil] = useState<number>(0);

  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState("");

  const [userId, setUserId] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState("");
  const [transferTargetId, setTransferTargetId] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!UUID_RE.test(teamId)) { router.push("/teams"); return; }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/sign-in");
        return;
      }

      setUserId(user.id);

      const [profileResult, teamResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("username")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("teams")
          .select("id, team_name, team_tag, logo_url, captain_id, created_at, badges")
          .eq("id", teamId)
          .maybeSingle(),
      ]);

      if (cancelled) return;
      if (!teamResult.data) { router.push("/teams"); return; }

      const { data: membersData } = await supabase
        .from("team_members")
        .select("user_id, role, joined_at, profiles(username, avatar_url)")
        .eq("team_id", teamId);

      if (cancelled) return;

      setUsername(profileResult.data?.username ?? null);
      setTeam(teamResult.data);
      setIsCaptain(teamResult.data.captain_id === user.id);
      setMembers((membersData ?? []) as unknown as Member[]);
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [teamId, supabase, router]);

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setLogoError("Only image files are allowed.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setLogoError("Image must be under 2 MB.");
      return;
    }
    setLogoUploading(true);
    setLogoError("");
    const ext = file.name.split(".").pop() ?? "png";
    const path = `${teamId}/logo.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("team-logos")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (uploadError) {
      setLogoError("Upload failed. Please try again.");
      setLogoUploading(false);
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from("team-logos").getPublicUrl(path);
    const { error: updateError } = await supabase
      .from("teams")
      .update({ logo_url: publicUrl })
      .eq("id", teamId);
    if (updateError) {
      setLogoError("Failed to save logo. Please try again.");
      setLogoUploading(false);
      return;
    }
    setTeam((prev) => prev ? { ...prev, logo_url: publicUrl } : prev);
    setLogoUploading(false);
    e.target.value = "";
  }

  async function handleInvite(e: React.SyntheticEvent) {
    e.preventDefault();
    setInviteError("");
    setInviteSuccess("");

    if (Date.now() < inviteCooldownUntil) {
      const secsLeft = Math.ceil((inviteCooldownUntil - Date.now()) / 1000);
      setInviteError(`Please wait ${secsLeft}s before sending another invite.`);
      return;
    }

    setInviting(true);

    const trimmed = inviteUsername.trim().toLowerCase();
    if (!trimmed) {
      setInviteError("Please enter a username.");
      setInviting(false);
      return;
    }

    const { data: targetProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", trimmed)
      .maybeSingle();

    if (!targetProfile) {
      setInviteError("User not found.");
      setInviting(false);
      return;
    }

    const alreadyMember = members.some((m) => m.user_id === targetProfile.id);
    if (alreadyMember) {
      setInviteError("This user is already a member of this team.");
      setInviting(false);
      return;
    }

    const { data: existingInvite } = await supabase
      .from("team_invitations")
      .select("id")
      .eq("team_id", teamId)
      .eq("user_id", targetProfile.id)
      .eq("status", "pending")
      .maybeSingle();

    if (existingInvite) {
      setInviteError("This user already has a pending invite.");
      setInviting(false);
      return;
    }

    const { data: { user: freshUser } } = await supabase.auth.getUser();
    if (!freshUser) { router.push("/sign-in"); setInviting(false); return; }

    const { data: freshTeam } = await supabase
      .from("teams")
      .select("id")
      .eq("id", teamId)
      .eq("captain_id", freshUser.id)
      .maybeSingle();

    if (!freshTeam) {
      setInviteError("You are no longer the team captain.");
      setInviting(false);
      return;
    }

    const { error } = await supabase.from("team_invitations").insert({
      team_id: teamId,
      user_id: targetProfile.id,
      status: "pending",
    });

    if (error) {
      setInviteError("Failed to send invite. Please try again.");
      setInviting(false);
      return;
    }

    setInviteSuccess("Invite sent to " + trimmed + ".");
    setInviteUsername("");
    setInviteCooldownUntil(Date.now() + 15_000);
    setInviting(false);
    setTimeout(() => setInviteSuccess(""), 3000);
  }

  async function handleRemove(userId: string, memberUsername: string) {
    if (!confirm(`Are you sure you want to remove ${memberUsername} from the team?`)) return;

    setRemovingId(userId);
    setRemoveError("");

    const { data: { user: freshUser } } = await supabase.auth.getUser();
    if (!freshUser) { router.push("/sign-in"); setRemovingId(null); return; }

    const { data: freshTeam } = await supabase
      .from("teams")
      .select("captain_id")
      .eq("id", teamId)
      .maybeSingle();

    if (freshTeam?.captain_id !== freshUser.id) {
      setRemoveError("You are no longer the team captain.");
      setRemovingId(null);
      return;
    }

    const { error } = await supabase
      .from("team_members")
      .delete()
      .eq("team_id", teamId)
      .eq("user_id", userId);

    if (error) {
      setRemoveError("Failed to remove member. Please try again.");
      setRemovingId(null);
      return;
    }

    setMembers((prev) => prev.filter((m) => m.user_id !== userId));
    setRemovingId(null);
  }

  async function handleLeave() {
    if (!confirm("Are you sure you want to leave this team?")) return;
    setLeaving(true);
    setLeaveError("");
    const { data: { user: freshUser } } = await supabase.auth.getUser();
    if (!freshUser) { router.push("/sign-in"); setLeaving(false); return; }
    const { error } = await supabase
      .from("team_members")
      .delete()
      .eq("team_id", teamId)
      .eq("user_id", freshUser.id);
    if (error) {
      setLeaveError("Failed to leave team. Please try again.");
      setLeaving(false);
      return;
    }
    router.push("/teams");
  }

  async function handleTransferCaptaincy() {
    const nonCaptains = members.filter((m) => m.user_id !== team?.captain_id);
    const target = transferTargetId || nonCaptains[0]?.user_id;
    if (!target) return;
    const targetName = members.find((m) => m.user_id === target)?.profiles?.username ?? "this member";
    if (!confirm(`Transfer captaincy to ${targetName}? You will become a regular member.`)) return;
    setTransferring(true);
    setTransferError("");
    const { error } = await supabase.rpc("transfer_captaincy", {
      p_team_id: teamId,
      p_new_captain_id: target,
    });
    if (error) {
      setTransferError("Transfer failed. Please try again.");
      setTransferring(false);
      return;
    }
    const prevCaptainId = team!.captain_id;
    setIsCaptain(false);
    setTeam((prev) => prev ? { ...prev, captain_id: target } : prev);
    setMembers((prev) => prev.map((m) => {
      if (m.user_id === target) return { ...m, role: "captain" };
      if (m.user_id === prevCaptainId) return { ...m, role: "member" };
      return m;
    }));
    setTransferring(false);
  }

  async function handleDeleteTeam() {
    if (!confirm(`Permanently delete "${team?.team_name}"? This cannot be undone.`)) return;
    setDeleting(true);
    setDeleteError("");
    const { error } = await supabase.rpc("delete_team", { p_team_id: teamId });
    if (error) {
      setDeleteError("Failed to delete team. Please try again.");
      setDeleting(false);
      return;
    }
    router.push("/teams");
  }

  function fmtDate(d: string) {
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
          <span className="text-sm text-gray-500">Loading team...</span>
        </div>
      </div>
    );
  }

  if (!team) return null;

  const otherMembers = members.filter((m) => m.user_id !== team.captain_id);
  const isOnlyMember = isCaptain && members.length <= 1;

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans">
      <Navbar username={username} />

      <main className="max-w-3xl mx-auto px-6 pt-28 pb-20 space-y-5">

        {/* Back */}
        <a
          href="/teams"
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-300 transition-colors duration-200"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back to Teams
        </a>

        {/* Team Header */}
        <div className="relative rounded-2xl border border-white/10 bg-white/5 p-6 overflow-hidden">
          <div className="absolute -top-16 -left-16 w-64 h-64 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative flex items-center gap-5">
            <div
              className={`relative w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/20 to-indigo-600/20 border border-violet-500/20 flex items-center justify-center shrink-0 overflow-hidden${isCaptain ? " cursor-pointer group/logo" : ""}`}
              onClick={isCaptain ? () => fileInputRef.current?.click() : undefined}
              title={isCaptain ? "Click to upload logo" : undefined}
            >
              {isSafeImageUrl(team.logo_url) ? (
                <img src={team.logo_url!} alt={team.team_name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-lg font-extrabold text-violet-300 tracking-wider">{team.team_tag}</span>
              )}
              {isCaptain && (
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/logo:opacity-100 transition-opacity duration-150 flex items-center justify-center">
                  {logoUploading ? (
                    <svg className="w-5 h-5 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                  )}
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLogoUpload}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-extrabold text-white tracking-tight">{team.team_name}</h1>
                <span className="px-2 py-0.5 rounded-full bg-gray-500/15 border border-gray-500/25 text-gray-400 text-xs font-medium">
                  {team.team_tag}
                </span>
                {isCaptain && (
                  <span className="px-2 py-0.5 rounded-full bg-violet-500/15 border border-violet-500/30 text-violet-300 text-xs font-medium">
                    Captain
                  </span>
                )}
              </div>
              <BadgeList badges={team.badges} />
              <p className="text-sm text-gray-500 mt-1">Created {fmtDate(team.created_at)}</p>
            </div>
          </div>
        </div>

        {logoError && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            {logoError}
          </div>
        )}

        {/* Members */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
            Members ({members.length})
          </h2>

          {removeError && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-4">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              {removeError}
            </div>
          )}

          {members.length === 0 ? (
            <p className="text-sm text-gray-600 italic text-center py-4">No members yet</p>
          ) : (
            <div className="space-y-2">
              {members.map((member) => (
                <div
                  key={member.user_id}
                  className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-white/3 border border-white/8"
                >
                  <div className="flex items-center gap-3">
                    {isSafeImageUrl(member.profiles?.avatar_url) ? (
                      <img
                        src={member.profiles!.avatar_url!}
                        alt="avatar"
                        className="w-9 h-9 rounded-xl object-cover"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500/30 to-indigo-600/30 flex items-center justify-center text-xs font-bold text-violet-300">
                        {(member.profiles?.username ?? "?").charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium text-white">
                          {member.profiles?.username ?? "Unknown"}
                        </p>
                        {member.user_id === userId && (
                          <span className="text-xs text-gray-600">(you)</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">Joined {fmtDate(member.joined_at)}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={
                      "px-2 py-0.5 rounded-full text-xs font-medium border " +
                      (member.role === "captain"
                        ? "bg-violet-500/15 border-violet-500/25 text-violet-300"
                        : "bg-white/5 border-white/10 text-gray-400")
                    }>
                      {member.role === "captain" ? "Captain" : "Member"}
                    </span>

                    {isCaptain && member.role !== "captain" && (
                      <button
                        onClick={() => handleRemove(member.user_id, member.profiles?.username ?? "this member")}
                        disabled={removingId === member.user_id}
                        className="flex items-center justify-center w-7 h-7 rounded-lg border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-all duration-200 disabled:opacity-50"
                      >
                        {removingId === member.user_id ? (
                          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : (
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Invite — captain only */}
        {isCaptain && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
              Invite Player
            </h2>

            {inviteSuccess && (
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm mb-4">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {inviteSuccess}
              </div>
            )}

            {inviteError && (
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-4">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                {inviteError}
              </div>
            )}

            <form onSubmit={handleInvite} className="flex items-center gap-3">
              <input
                type="text"
                value={inviteUsername}
                onChange={(e) => setInviteUsername(e.target.value)}
                placeholder="Enter username"
                className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors duration-200"
              />
              <button
                type="submit"
                disabled={inviting}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-all duration-200"
              >
                {inviting ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : "Send Invite"}
              </button>
            </form>
            <p className="text-xs text-gray-600 mt-2">Enter the exact username of the player</p>
          </div>
        )}

        {/* Transfer Captaincy — captain with other members */}
        {isCaptain && otherMembers.length > 0 && (
          <div className="rounded-2xl border border-orange-500/15 bg-orange-500/5 p-6 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <svg className="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                </svg>
                Transfer Captaincy
              </h2>
              <p className="text-xs text-gray-500 mt-1">Pass the captain role to another member. After transferring you can leave.</p>
            </div>

            {transferError && (
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                {transferError}
              </div>
            )}

            <div className="flex items-center gap-3">
              <select
                value={transferTargetId || otherMembers[0]?.user_id}
                onChange={(e) => setTransferTargetId(e.target.value)}
                className="flex-1 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors duration-200"
              >
                {otherMembers.map((m) => (
                  <option key={m.user_id} value={m.user_id} className="bg-gray-900 text-white">
                    {m.profiles?.username ?? m.user_id}
                  </option>
                ))}
              </select>
              <button
                onClick={handleTransferCaptaincy}
                disabled={transferring}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/20 disabled:opacity-50 disabled:cursor-not-allowed text-orange-300 text-sm font-medium transition-all duration-200 whitespace-nowrap"
              >
                {transferring ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : "Transfer"}
              </button>
            </div>
          </div>
        )}

        {/* Delete Team — captain is sole member */}
        {isOnlyMember && (
          <div className="rounded-2xl border border-red-500/15 bg-red-500/5 p-6 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
                Delete Team
              </h2>
              <p className="text-xs text-gray-500 mt-1">You are the only member. This permanently removes the team.</p>
            </div>

            {deleteError && (
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                {deleteError}
              </div>
            )}

            <button
              onClick={handleDeleteTeam}
              disabled={deleting}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed text-red-400 text-sm font-medium transition-all duration-200"
            >
              {deleting ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Deleting...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                  Delete Team
                </>
              )}
            </button>
          </div>
        )}

        {/* Leave Team — regular members only */}
        {!isCaptain && (
          <div className="rounded-2xl border border-red-500/15 bg-red-500/5 p-6 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-white">Leave Team</h2>
              <p className="text-xs text-gray-500 mt-1">You will be permanently removed from this team.</p>
            </div>

            {leaveError && (
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                {leaveError}
              </div>
            )}

            <button
              onClick={handleLeave}
              disabled={leaving}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed text-red-400 text-sm font-medium transition-all duration-200"
            >
              {leaving ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Leaving...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                  </svg>
                  Leave Team
                </>
              )}
            </button>
          </div>
        )}

      </main>
    </div>
  );
}