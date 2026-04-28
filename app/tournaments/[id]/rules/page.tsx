"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";

// ── Rules text parser ─────────────────────────────────────────────────────────
// Format:
//   # Section Title          → collapsible top-level section
//   ## Subsection Title      → colored sub-heading inside section
//   **Category Name**        → bold category label
//   Setting Name - Value     → formatted key-value row
//   Plain text               → paragraph

type RuleBlock =
  | { type: "text"; content: string }
  | { type: "subsection"; title: string }
  | { type: "category"; title: string }
  | { type: "setting"; key: string; value: string };

type RuleSection = {
  title: string;
  blocks: RuleBlock[];
};

function parseRules(text: string): RuleSection[] {
  if (!text.trim()) return [];
  const lines = text.split("\n");
  const sections: RuleSection[] = [];
  let current: RuleSection | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (line.startsWith("# ")) {
      if (current) sections.push(current);
      current = { title: line.slice(2).trim(), blocks: [] };
    } else if (current) {
      if (line.startsWith("## ")) {
        current.blocks.push({ type: "subsection", title: line.slice(3).trim() });
      } else if (trimmed.startsWith("**") && trimmed.endsWith("**") && trimmed.length > 4) {
        current.blocks.push({ type: "category", title: trimmed.slice(2, -2) });
      } else if (trimmed.includes(" - ") && !trimmed.startsWith("**")) {
        const dashIdx = trimmed.indexOf(" - ");
        current.blocks.push({
          type: "setting",
          key: trimmed.slice(0, dashIdx).trim(),
          value: trimmed.slice(dashIdx + 3).trim(),
        });
      } else if (trimmed) {
        const last = current.blocks[current.blocks.length - 1];
        if (last && last.type === "text") {
          last.content += "\n" + trimmed;
        } else {
          current.blocks.push({ type: "text", content: trimmed });
        }
      }
    }
  }
  if (current) sections.push(current);

  // Fallback: no # headers — wrap all as single section
  if (!sections.length && text.trim()) {
    return [{ title: "", blocks: [{ type: "text", content: text.trim() }] }];
  }

  return sections;
}

const FORMAT_HINT = `# Recent Rule Changes
Brief summary of any updates...

# Game Settings
## Search and Destroy
**Game**
Round Time Limit - 1:30
Match Start Time - 20 seconds
Input Swap Allowed - Off
Allow Callout Pings - Off

**Advanced**
Defuse Time - 7.5 Seconds
Silent Plant - On

**Player**
Weapon Mounting - Off

**Team**
Team Assignment - On
Friendly Fire - On`;

export default function TournamentRulesPage() {
  const router = useRouter();
  const params = useParams();
  const tournamentId = params.id as string;
  const supabase = useMemo(() => createClient(), []);

  const [username, setUsername] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tournamentName, setTournamentName] = useState<string | null>(null);
  const [rules, setRules] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState(false);
  const [rulesInput, setRulesInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [showHint, setShowHint] = useState(false);

  // Track which accordion sections are open (by index)
  const [openSections, setOpenSections] = useState<Set<number>>(new Set([0]));

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!UUID_RE.test(tournamentId)) { router.push("/tournaments"); return; }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/sign-in"); return; }

      const [profileResult, tournamentResult] = await Promise.all([
        supabase.from("profiles").select("username, is_admin, role").eq("id", user.id).maybeSingle(),
        supabase.from("tournaments").select("name, rules").eq("id", tournamentId).maybeSingle(),
      ]);

      if (cancelled) return;

      setUsername(profileResult.data?.username ?? null);
      setIsAdmin(!!(profileResult.data?.is_admin || profileResult.data?.role === "owner" || profileResult.data?.role === "admin"));

      if (tournamentResult.error) { setLoading(false); return; }
      if (!tournamentResult.data) { router.push("/tournaments"); return; }

      const loadedRules = tournamentResult.data.rules ?? null;
      setTournamentName(tournamentResult.data.name);
      setRules(loadedRules);
      setRulesInput(loadedRules ?? "");
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [tournamentId, supabase, router]);

  async function handleSaveRules() {
    if (rulesInput.trim().length > 8000) return;
    setSaving(true);
    const { error } = await supabase
      .from("tournaments")
      .update({ rules: rulesInput.trim() || null })
      .eq("id", tournamentId);
    if (!error) {
      setRules(rulesInput.trim() || null);
      setEditing(false);
      setShowHint(false);
      // Reset accordion: open first section
      setOpenSections(new Set([0]));
    }
    setSaving(false);
  }

  function toggleSection(idx: number) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  const sections = useMemo(() => parseRules(rules ?? ""), [rules]);

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

      {/* Tab nav */}
      <div className="border-b border-white/8 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10 mt-16">
        <div className="max-w-5xl mx-auto px-6">
          <nav className="flex items-center gap-0 -mb-px">
            <a href={`/tournaments/${tournamentId}`} className="px-4 py-3.5 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-600 transition-all duration-150">Overview</a>
            <a href={`/tournaments/${tournamentId}`} className="px-4 py-3.5 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-600 transition-all duration-150">Participants</a>
            <a href={`/tournaments/${tournamentId}/bracket`} className="px-4 py-3.5 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-600 transition-all duration-150">Bracket</a>
            <span className="px-4 py-3.5 text-sm font-medium border-b-2 border-violet-500 text-violet-400">Rules</span>
          </nav>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-4">

        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
              <svg className="w-4.5 h-4.5 text-violet-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Rules</p>
              <h1 className="text-base font-bold text-white leading-tight">{tournamentName ?? "Tournament"}</h1>
            </div>
          </div>
          {isAdmin && !editing && (
            <button
              onClick={() => { setRulesInput(rules ?? ""); setEditing(true); }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 bg-white/5 text-gray-300 text-sm font-medium hover:bg-white/10 transition-all duration-200"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
              </svg>
              Edit Rules
            </button>
          )}
        </div>

        {/* ── Editor ─────────────────────────────────────────────────────────── */}
        {editing ? (
          <div className="space-y-3">
            {/* Format hint toggle */}
            <button
              onClick={() => setShowHint((v) => !v)}
              className="flex items-center gap-2 text-xs text-violet-400 hover:text-violet-300 transition-colors"
            >
              <svg className={`w-3.5 h-3.5 transition-transform ${showHint ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
              Format guide
            </button>

            {showHint && (
              <div className="rounded-xl border border-violet-500/15 bg-violet-500/5 p-4 space-y-2">
                <p className="text-[10px] font-semibold text-violet-400 uppercase tracking-wider mb-3">Syntax</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                  <code className="text-violet-300 font-mono"># Section Title</code>
                  <span className="text-gray-400">Collapsible section</span>
                  <code className="text-violet-300 font-mono">## Subsection</code>
                  <span className="text-gray-400">Sub-heading inside section</span>
                  <code className="text-violet-300 font-mono">**Category**</code>
                  <span className="text-gray-400">Bold category label</span>
                  <code className="text-violet-300 font-mono">Setting - Value</code>
                  <span className="text-gray-400">Formatted key-value row</span>
                </div>
                <div className="mt-3 pt-3 border-t border-white/8">
                  <p className="text-[10px] text-gray-500 mb-2">Example:</p>
                  <pre className="text-[10px] text-gray-400 font-mono leading-relaxed whitespace-pre-wrap">{FORMAT_HINT}</pre>
                </div>
              </div>
            )}

            <textarea
              value={rulesInput}
              onChange={(e) => setRulesInput(e.target.value)}
              rows={16}
              maxLength={8000}
              placeholder={FORMAT_HINT}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors duration-200 resize-none font-mono"
            />
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-600">{rulesInput.length} / 8000</span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setEditing(false); setRulesInput(rules ?? ""); setShowHint(false); }}
                  disabled={saving}
                  className="px-4 py-2 rounded-xl border border-white/10 bg-white/5 text-gray-300 text-sm font-medium hover:bg-white/10 disabled:opacity-50 transition-all duration-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveRules}
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-all duration-200"
                >
                  {saving ? (
                    <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>Saving...</>
                  ) : "Save Rules"}
                </button>
              </div>
            </div>
          </div>

        ) : sections.length === 0 ? (
          /* ── Empty state ────────────────────────────────────────────────── */
          <div className="rounded-2xl border border-white/8 bg-white/4 p-12 flex flex-col items-center justify-center text-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/8 flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <p className="text-white font-semibold">No rules yet</p>
            <p className="text-gray-500 text-sm">
              {isAdmin ? "Click Edit Rules to add tournament rules" : "No rules have been set for this tournament."}
            </p>
          </div>

        ) : (
          /* ── Accordion sections ─────────────────────────────────────────── */
          <div className="space-y-2">
            {sections.map((section, sIdx) => {
              const isOpen = openSections.has(sIdx);
              const hasTitle = !!section.title;

              // If no title, render as plain card (no accordion)
              if (!hasTitle) {
                return (
                  <div key={sIdx} className="rounded-2xl border border-white/8 bg-white/4 p-5">
                    {section.blocks.map((block, bIdx) => renderBlock(block, bIdx))}
                  </div>
                );
              }

              return (
                <div key={sIdx} className="rounded-2xl border border-white/8 bg-white/4 overflow-hidden">
                  {/* Accordion header */}
                  <button
                    onClick={() => toggleSection(sIdx)}
                    className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/4 transition-colors duration-150"
                  >
                    <span className="text-sm font-semibold text-white">{section.title}</span>
                    <svg
                      className={`w-4 h-4 text-gray-500 transition-transform duration-200 shrink-0 ${isOpen ? "rotate-180" : ""}`}
                      fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>

                  {/* Accordion body */}
                  {isOpen && (
                    <div className="px-5 pb-5 pt-1 border-t border-white/6 space-y-1">
                      {section.blocks.map((block, bIdx) => renderBlock(block, bIdx))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

// ── Block renderer ─────────────────────────────────────────────────────────────
function renderBlock(block: RuleBlock, key: number) {
  switch (block.type) {
    case "subsection":
      return (
        <div key={key} className="mt-4 mb-2 first:mt-2">
          <p className="text-sm font-bold text-violet-400">{block.title}</p>
        </div>
      );

    case "category":
      return (
        <div key={key} className="mt-3 mb-1 first:mt-0">
          <p className="text-xs font-semibold text-gray-300 uppercase tracking-wide">{block.title}</p>
        </div>
      );

    case "setting":
      return (
        <div key={key} className="flex items-baseline gap-2 py-0.5 pl-1">
          <span className="text-sm text-gray-300 min-w-0 flex-1">{block.key}</span>
          <span className="text-xs text-gray-500 shrink-0">—</span>
          <span className="text-sm font-medium text-white shrink-0">{block.value}</span>
        </div>
      );

    case "text":
      return (
        <p key={key} className="text-sm text-gray-400 leading-relaxed whitespace-pre-wrap mt-2">
          {block.content}
        </p>
      );

    default:
      return null;
  }
}
