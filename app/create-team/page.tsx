"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";

export default function CreateTeamPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [username, setUsername] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const [teamName, setTeamName] = useState("");
  const [teamTag, setTeamTag] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/sign-in");
        return;
      }

      setUserId(user.id);

      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .maybeSingle();

      setUsername(profile?.username ?? null);

      setLoadingUser(false);
    }

    loadUser();
  }, [supabase, router]);

  function handleTagInput(value: string) {
    const cleaned = value
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 5);
    setTeamTag(cleaned);
  }

  function validate(): string | null {
    if (!teamName.trim()) return "Team name is required.";
    if (!teamTag.trim()) return "Team tag is required.";
    if (teamTag.length < 2) return "Team tag must be at least 2 characters.";
    if (teamTag.length > 5) return "Team tag must be at most 5 characters.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    if (!userId) {
      setError("You must be logged in to create a team.");
      return;
    }

    setSubmitting(true);

    // Check team_name uniqueness
    const { data: existingName } = await supabase
      .from("teams")
      .select("id")
      .ilike("team_name", teamName.trim())
      .maybeSingle();

    if (existingName) {
      setError("A team with this name already exists.");
      setSubmitting(false);
      return;
    }

    // Check team_tag uniqueness
    const { data: existingTag, error: tagCheckError } = await supabase
      .from("teams")
      .select("id")
      .ilike("team_tag", teamTag.trim())
      .maybeSingle();

    console.log("[create-team] tag check:", { existingTag, tagCheckError, tag: teamTag.trim() });

    if (existingTag) {
      setError("A team with this tag already exists.");
      setSubmitting(false);
      return;
    }

    const trimmedLogoUrl = logoUrl.trim() || null;
    if (trimmedLogoUrl) {
      try {
        if (new URL(trimmedLogoUrl).protocol !== "https:") {
          setError("Logo URL must use HTTPS.");
          setSubmitting(false);
          return;
        }
      } catch {
        setError("Logo URL is not a valid URL.");
        setSubmitting(false);
        return;
      }
    }

    // Insert into teams — trigger will auto-insert captain into team_members
    const { error: teamInsertError } = await supabase
      .from("teams")
      .insert({
        team_name: teamName.trim(),
        team_tag: teamTag.trim(),
        logo_url: trimmedLogoUrl,
        captain_id: userId,
      });

    if (teamInsertError) {
      console.error("[create-team] insert error:", teamInsertError.code, teamInsertError.message, teamInsertError.details, teamInsertError.hint);
      const msg = teamInsertError.message.toLowerCase();
      if (msg.includes("team_name") || msg.includes("uq_teams_team_name")) {
        setError("A team with this name already exists.");
      } else if (msg.includes("team_tag") || msg.includes("uq_teams_team_tag") || msg.includes("uq_teams_team_tag_ci")) {
        setError("A team with this tag already exists.");
      } else if (msg.includes("unique")) {
        setError("Team name or tag is already taken.");
      } else {
        setError(`Failed to create team: ${teamInsertError.message}`);
      }
      setSubmitting(false);
      return;
    }

    router.push("/teams");
  }

  if (loadingUser) {
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
          <div className="absolute top-1/3 left-1/4 w-[250px] h-[250px] bg-indigo-600/10 rounded-full blur-3xl" />
          <div className="absolute bottom-1/3 right-1/4 w-[250px] h-[250px] bg-fuchsia-600/10 rounded-full blur-3xl" />
        </div>

        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />

        <div className="relative w-full max-w-md">

          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 text-xs font-medium tracking-wide uppercase mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
              New Team
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white">
              Create Team
            </h1>
            <p className="mt-2 text-sm text-gray-400">
              Build your squad and start competing
            </p>
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
                <label htmlFor="teamName" className="block text-sm font-medium text-gray-300">
                  Team Name
                </label>
                <input
                  id="teamName"
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors duration-200"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="teamTag" className="block text-sm font-medium text-gray-300">
                  Team Tag
                  <span className="ml-2 text-xs text-gray-600 font-normal">
                    2–5 characters, letters and numbers only
                  </span>
                </label>
                <input
                  id="teamTag"
                  type="text"
                  value={teamTag}
                  onChange={(e) => handleTagInput(e.target.value)}
                  maxLength={5}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm font-mono tracking-widest focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors duration-200"
                />
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-600">Saved exactly as typed</p>
                  <p className="text-xs text-gray-600">{teamTag.length}/5</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="logoUrl" className="block text-sm font-medium text-gray-300">
                  Logo URL
                  <span className="ml-2 text-xs text-gray-600 font-normal">Optional</span>
                </label>
                <input
                  id="logoUrl"
                  type="url"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors duration-200"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="group w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm transition-all duration-200 shadow-lg shadow-violet-900/40 hover:shadow-violet-800/60"
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
                    Create Team
                    <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform duration-200" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </>
                )}
              </button>

            </form>
          </div>

          <p className="text-center text-sm text-gray-600 mt-6">
            Changed your mind?{" "}
            <a href="/teams" className="text-violet-400 hover:text-violet-300 transition-colors duration-200 font-medium">
              Back to Teams
            </a>
          </p>

        </div>
      </main>
    </div>
  );
}