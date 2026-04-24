"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";

function isSafeImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try { return new URL(url).protocol === "https:"; } catch { return false; }
}

type Invite = {
  id: string;
  team_id: string;
  status: string;
  sent_at: string;
  teams: {
    team_name: string;
    team_tag: string;
    logo_url: string | null;
  } | null;
};

export default function InvitesPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const userIdRef = useRef<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

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

      userIdRef.current = user.id;

      const [profileResult, invitesResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("username")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("team_invitations")
          .select("id, team_id, status, sent_at, teams(team_name, team_tag, logo_url)")
          .eq("user_id", user.id)
          .eq("status", "pending")
          .order("sent_at", { ascending: false }),
      ]);

      if (cancelled) return;

      setUsername(profileResult.data?.username ?? null);
      setInvites((invitesResult.data ?? []) as unknown as Invite[]);
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [supabase, router]);

  async function handleAccept(invite: Invite) {
    setActingOn(invite.id);
    setActionError("");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/sign-in"); return; }

    const { data: existing } = await supabase
      .from("team_members")
      .select("user_id")
      .eq("team_id", invite.team_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      setActionError("You are already a member of this team.");
      setActingOn(null);
      return;
    }

    const { error: memberError } = await supabase
      .from("team_members")
      .insert({
        team_id: invite.team_id,
        user_id: user.id,
        role: "member",
      });

    if (memberError) {
      setActionError("Failed to accept invite. Please try again.");
      setActingOn(null);
      return;
    }

    await supabase
      .from("team_invitations")
      .update({ status: "accepted", responded_at: new Date().toISOString() })
      .eq("id", invite.id)
      .eq("user_id", user.id);

    setInvites((prev) => prev.filter((i) => i.id !== invite.id));
    setActingOn(null);
  }

  async function handleDecline(inviteId: string) {
    setActingOn(inviteId);
    setActionError("");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/sign-in"); return; }

    const { error } = await supabase
      .from("team_invitations")
      .update({ status: "declined", responded_at: new Date().toISOString() })
      .eq("id", inviteId)
      .eq("user_id", user.id);

    if (error) {
      setActionError("Failed to decline invite. Please try again.");
      setActingOn(null);
      return;
    }

    setInvites((prev) => prev.filter((i) => i.id !== inviteId));
    setActingOn(null);
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
          <span className="text-sm text-gray-500">Loading invites...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans">
      <Navbar username={username} />

      <main className="max-w-3xl mx-auto px-6 pt-28 pb-20">

        {actionError && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-6">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            {actionError}
          </div>
        )}

        <div className="mb-8">
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Invites</h1>
          <p className="text-sm text-gray-500 mt-1">
            {invites.length > 0
              ? invites.length + " pending invite" + (invites.length > 1 ? "s" : "")
              : "Team invitations sent to you"}
          </p>
        </div>

        {invites.length > 0 ? (
          <div className="space-y-4">
            {invites.map((invite) => (
              <div
                key={invite.id}
                className="rounded-2xl border border-white/10 bg-white/5 p-5"
              >
                <div className="flex items-center justify-between gap-4">

                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500/20 to-indigo-600/20 border border-violet-500/20 flex items-center justify-center shrink-0 overflow-hidden">
                      {isSafeImageUrl(invite.teams?.logo_url) ? (
                        <img
                          src={invite.teams!.logo_url!}
                          alt={invite.teams!.team_name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-sm font-extrabold text-violet-300 tracking-wider">
                          {invite.teams?.team_tag ?? "?"}
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="text-base font-bold text-white">
                        {invite.teams?.team_name ?? "Unknown Team"}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Invited {fmtDate(invite.sent_at)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleAccept(invite)}
                      disabled={actingOn === invite.id}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-all duration-200"
                    >
                      {actingOn === invite.id ? (
                        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : "Accept"}
                    </button>
                    <button
                      onClick={() => handleDecline(invite.id)}
                      disabled={actingOn === invite.id}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed text-gray-400 hover:text-white text-sm font-medium transition-all duration-200"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-12 flex flex-col items-center justify-center text-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <svg className="w-7 h-7 text-gray-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            </div>
            <div>
              <p className="text-white font-semibold">No invites yet</p>
              <p className="text-gray-500 text-sm mt-1">
                When a captain invites you to a team, it will appear here
              </p>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}