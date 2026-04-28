"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";

// ── Types ─────────────────────────────────────────────────────────────────────

type RuleSection = {
  title: string;
  content: string;
};

function parseSections(raw: string): RuleSection[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as RuleSection[];
  } catch { /* not JSON — try legacy plain text */ }
  // Legacy fallback: treat the whole thing as one unnamed section
  if (raw.trim()) return [{ title: "Rules", content: raw.trim() }];
  return [];
}

function serializeSections(sections: RuleSection[]): string {
  return JSON.stringify(sections);
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function RulesPage() {
  const router = useRouter();
  const params = useParams();
  const tournamentId = params.id as string;
  const supabase = useMemo(() => createClient(), []);

  const [username, setUsername] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [rulesRaw, setRulesRaw] = useState<string>("");
  const [sections, setSections] = useState<RuleSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Accordion open state
  const [openIdx, setOpenIdx] = useState<Set<number>>(new Set([0]));

  // Edit mode state
  const [editMode, setEditMode] = useState(false);
  const [editSections, setEditSections] = useState<RuleSection[]>([]);

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

      const { data: tournament } = await supabase
        .from("tournaments")
        .select("rules")
        .eq("id", tournamentId)
        .maybeSingle();

      const raw = (tournament?.rules as string) ?? "";
      setRulesRaw(raw);
      setSections(parseSections(raw));
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId, supabase, router]);

  function toggleSection(idx: number) {
    setOpenIdx((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  // ── Editor helpers ────────────────────────────────────────────────────────

  function startEditing() {
    setEditSections(sections.length > 0 ? sections.map((s) => ({ ...s })) : [{ title: "", content: "" }]);
    setEditMode(true);
    setSaveError("");
  }

  function cancelEditing() {
    setEditMode(false);
    setSaveError("");
  }

  function addSection() {
    setEditSections((prev) => [...prev, { title: "", content: "" }]);
  }

  function removeSection(idx: number) {
    setEditSections((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateSection(idx: number, field: keyof RuleSection, value: string) {
    setEditSections((prev) => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  }

  function moveSection(idx: number, dir: -1 | 1) {
    const next = [...editSections];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setEditSections(next);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError("");
    const trimmed = editSections
      .map((s) => ({ title: s.title.trim(), content: s.content.trim() }))
      .filter((s) => s.title || s.content);

    const payload = serializeSections(trimmed);

    const { error } = await supabase
      .from("tournaments")
      .update({ rules: payload })
      .eq("id", tournamentId);

    if (error) {
      setSaveError("Failed to save rules. Please try again.");
      setSaving(false);
      return;
    }

    setRulesRaw(payload);
    setSections(trimmed);
    setEditMode(false);
    setSaving(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <svg className="w-8 h-8 animate-spin text-violet-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm text-gray-500">Loading rules...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans">
      <Navbar username={username} />

      {/* ── Tab nav ────────────────────────────────────────────── */}
      <div className="border-b border-white/8 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10 mt-16">
        <div className="max-w-3xl mx-auto px-6">
          <nav className="flex items-center gap-0 -mb-px">
            <a href={`/tournaments/${tournamentId}`} className="px-4 py-3.5 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-600 transition-all duration-150">Overview</a>
            <a href={`/tournaments/${tournamentId}`} className="px-4 py-3.5 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-600 transition-all duration-150">Participants</a>
            <a href={`/tournaments/${tournamentId}/bracket`} className="px-4 py-3.5 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-600 transition-all duration-150">Bracket</a>
            <span className="px-4 py-3.5 text-sm font-medium border-b-2 border-violet-500 text-violet-400">Rules</span>
          </nav>
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-extrabold text-white tracking-tight">Rules</h1>
            <p className="text-xs text-gray-500 mt-0.5">{sections.length} section{sections.length !== 1 ? "s" : ""}</p>
          </div>
          {isAdmin && !editMode && (
            <button
              onClick={startEditing}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/8 hover:bg-white/12 border border-white/10 text-gray-300 text-sm font-medium transition-all duration-200"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
              </svg>
              Edit Rules
            </button>
          )}
        </div>

        {/* Success toast */}
        {saveSuccess && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Rules saved successfully.
          </div>
        )}

        {/* ── Edit mode ──────────────────────────────────────── */}
        {editMode && (
          <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 overflow-hidden">
            <div className="px-6 py-4 border-b border-white/8 flex items-center justify-between">
              <p className="text-sm font-semibold text-violet-300">Editing Rules</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={cancelEditing}
                  className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white border border-white/10 hover:border-white/20 transition-all duration-150"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white transition-all duration-150"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {editSections.map((section, idx) => (
                <div key={idx} className="rounded-xl border border-white/10 bg-white/3 overflow-hidden">
                  {/* Section toolbar */}
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/8 bg-white/3">
                    <span className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider w-5 text-center">{idx + 1}</span>
                    <input
                      type="text"
                      value={section.title}
                      onChange={(e) => updateSection(idx, "title", e.target.value)}
                      placeholder="Section title..."
                      className="flex-1 bg-transparent text-sm font-semibold text-white placeholder-gray-600 focus:outline-none"
                    />
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => moveSection(idx, -1)}
                        disabled={idx === 0}
                        className="p-1 rounded text-gray-600 hover:text-gray-300 disabled:opacity-30 transition-colors"
                        title="Move up"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                        </svg>
                      </button>
                      <button
                        onClick={() => moveSection(idx, 1)}
                        disabled={idx === editSections.length - 1}
                        className="p-1 rounded text-gray-600 hover:text-gray-300 disabled:opacity-30 transition-colors"
                        title="Move down"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                        </svg>
                      </button>
                      <button
                        onClick={() => removeSection(idx)}
                        className="p-1 rounded text-gray-600 hover:text-red-400 transition-colors ml-1"
                        title="Remove section"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  {/* Content area */}
                  <textarea
                    value={section.content}
                    onChange={(e) => updateSection(idx, "content", e.target.value)}
                    placeholder="Write the section content here..."
                    rows={5}
                    className="w-full px-4 py-3 bg-transparent text-sm text-gray-300 placeholder-gray-700 focus:outline-none resize-y leading-relaxed"
                  />
                </div>
              ))}

              {/* Add section */}
              <button
                onClick={addSection}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-dashed border-white/15 text-gray-500 hover:text-violet-400 hover:border-violet-500/30 text-sm font-medium transition-all duration-200"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Add Section
              </button>

              {saveError && (
                <p className="text-xs text-red-400 text-center">{saveError}</p>
              )}
            </div>
          </div>
        )}

        {/* ── View mode: accordion ──────────────────────────── */}
        {!editMode && (
          sections.length === 0 ? (
            <div className="rounded-2xl border border-white/8 bg-white/4 p-16 flex flex-col items-center justify-center text-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/8 flex items-center justify-center">
                <svg className="w-7 h-7 text-gray-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                </svg>
              </div>
              <div>
                <p className="text-white font-semibold">No rules posted yet</p>
                <p className="text-gray-500 text-sm mt-1">
                  {isAdmin ? "Click Edit Rules to add tournament rules" : "Rules will appear when the admin adds them"}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {sections.map((section, idx) => {
                const isOpen = openIdx.has(idx);
                return (
                  <div key={idx} className="rounded-2xl border border-white/8 bg-white/4 overflow-hidden">
                    {/* Accordion header */}
                    <button
                      onClick={() => toggleSection(idx)}
                      className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-white/3 transition-colors duration-150"
                    >
                      <span className="text-sm font-semibold text-white">{section.title || `Section ${idx + 1}`}</span>
                      <svg
                        className={`w-4 h-4 text-gray-500 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                        fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                      </svg>
                    </button>

                    {/* Accordion body */}
                    {isOpen && section.content && (
                      <div className="px-5 pb-5 border-t border-white/8 pt-4">
                        <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{section.content}</p>
                      </div>
                    )}
                    {isOpen && !section.content && (
                      <div className="px-5 pb-4 border-t border-white/8 pt-4">
                        <p className="text-xs text-gray-600 italic">No content for this section.</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}

      </main>
    </div>
  );
}
