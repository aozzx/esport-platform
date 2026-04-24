"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";

export default function SeasonRulesPage() {
  const router = useRouter();
  const params = useParams();
  const seasonId = params.id as string;
  const supabase = useMemo(() => createClient(), []);

  const [username, setUsername] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [seasonName, setSeasonName] = useState<string | null>(null);
  const [rules, setRules] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState(false);
  const [rulesInput, setRulesInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!UUID_RE.test(seasonId)) { router.push("/seasons"); return; }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/sign-in"); return; }

      const [profileResult, seasonResult] = await Promise.all([
        supabase.from("profiles").select("username, is_admin, role").eq("id", user.id).maybeSingle(),
        supabase.from("seasons").select("name, rules").eq("id", seasonId).maybeSingle(),
      ]);

      if (cancelled) return;

      setUsername(profileResult.data?.username ?? null);
      setIsAdmin(!!(profileResult.data?.is_admin || profileResult.data?.role === "owner" || profileResult.data?.role === "admin"));

      if (seasonResult.error) {
        setLoading(false);
        return;
      }
      if (!seasonResult.data) {
        router.push("/seasons");
        return;
      }

      const loadedRules = seasonResult.data.rules ?? null;
      setSeasonName(seasonResult.data.name);
      setRules(loadedRules);
      setRulesInput(loadedRules ?? "");
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [seasonId, supabase, router]);

  async function handleSaveRules() {
    if (rulesInput.trim().length > 5000) return;
    setSaving(true);
    const { error } = await supabase
      .from("seasons")
      .update({ rules: rulesInput.trim() || null })
      .eq("id", seasonId);
    if (!error) {
      setRules(rulesInput.trim() || null);
      setEditing(false);
    }
    setSaving(false);
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
    <div className="min-h-screen bg-gray-950 text-white font-sans">
      <Navbar username={username} />

      <main className="max-w-3xl mx-auto px-6 pt-28 pb-20 space-y-5">

        <a
          href="/seasons"
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-300 transition-colors duration-200"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back to Seasons
        </a>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-8">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Rules</p>
                <h1 className="text-lg font-bold text-white">{seasonName ?? "Season"}</h1>
              </div>
            </div>
            {isAdmin && !editing && (
              <button
                onClick={() => { setRulesInput(rules ?? ""); setEditing(true); }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 bg-white/5 text-gray-300 text-sm font-medium hover:bg-white/10 transition-all duration-200 shrink-0"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                </svg>
                Edit Rules
              </button>
            )}
          </div>

          {editing ? (
            <div className="space-y-3">
              <textarea
                value={rulesInput}
                onChange={(e) => setRulesInput(e.target.value)}
                rows={10}
                maxLength={5000}
                placeholder="Enter season rules..."
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors duration-200 resize-none"
              />
              <div className="flex items-center gap-3 justify-end">
                <button
                  onClick={() => { setEditing(false); setRulesInput(rules ?? ""); }}
                  disabled={saving}
                  className="px-4 py-2 rounded-xl border border-white/10 bg-white/5 text-gray-300 text-sm font-medium hover:bg-white/10 disabled:opacity-50 transition-all duration-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveRules}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-all duration-200"
                >
                  {saving ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Saving...
                    </>
                  ) : "Save"}
                </button>
              </div>
            </div>
          ) : rules ? (
            <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{rules}</p>
          ) : (
            <p className="text-sm text-gray-600 italic">No rules have been set for this season.</p>
          )}
        </div>

      </main>
    </div>
  );
}
