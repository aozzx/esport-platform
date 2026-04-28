"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Tab = "complaint" | "suggestion" | "my_reports";

type MyReport = {
  id: string;
  type: string;
  title: string;
  description: string;
  status: string | null;
  created_at: string;
};

export default function SupportButton() {
  const supabase = useMemo(() => createClient(), []);

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("complaint");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  // My Reports state
  const [myReports, setMyReports] = useState<MyReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);

  useEffect(() => {
    if (tab !== "my_reports" || !open) return;
    setLoadingReports(true);
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setLoadingReports(false); return; }
      supabase
        .from("reports")
        .select("id, type, title, description, status, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20)
        .then(({ data }) => {
          setMyReports((data ?? []) as MyReport[]);
          setLoadingReports(false);
        });
    });
  }, [tab, open, supabase]);

  function resetForm() {
    setTitle("");
    setDescription("");
    setEvidenceUrl("");
    setError("");
    setSuccess("");
  }

  function handleTabChange(newTab: Tab) {
    setTab(newTab);
    resetForm();
  }

  function handleClose() {
    setOpen(false);
    setTimeout(() => {
      resetForm();
      setTab("complaint");
    }, 200);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!title.trim()) { setError("Title is required."); return; }
    if (!description.trim()) { setError("Description is required."); return; }

    if (tab === "complaint" && evidenceUrl.trim()) {
      try {
        if (new URL(evidenceUrl.trim()).protocol !== "https:") {
          setError("Evidence URL must use HTTPS (https://).");
          return;
        }
      } catch {
        setError("Evidence URL is not a valid URL.");
        return;
      }
    }

    setSubmitting(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("You must be logged in to submit.");
      setSubmitting(false);
      return;
    }

    const { error: insertError } = await supabase.from("reports").insert({
      user_id: user.id,
      type: tab,
      title: title.trim(),
      description: description.trim(),
      evidence_url: tab === "complaint" && evidenceUrl.trim() ? evidenceUrl.trim() : null,
    });

    if (insertError) {
      setError("Failed to submit. Please try again.");
      setSubmitting(false);
      return;
    }

    setSuccess(tab === "complaint" ? "Complaint submitted successfully." : "Suggestion submitted successfully.");
    setTitle("");
    setDescription("");
    setEvidenceUrl("");
    setSubmitting(false);
    setTimeout(() => handleClose(), 1500);
  }

  return (
    <>
      {/* Floating trigger */}
      <button
        onClick={() => setOpen(true)}
        title="Support"
        className="fixed bottom-6 right-6 z-40 flex items-center justify-center w-12 h-12 rounded-full bg-violet-600 hover:bg-violet-500 shadow-lg shadow-violet-900/50 text-white transition-all duration-200 hover:scale-105"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
        </svg>
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={handleClose}
          />
          <div className="relative w-full max-w-md bg-gray-900 border border-white/10 rounded-2xl shadow-2xl p-6">

            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-white">Support</h2>
              <button
                onClick={handleClose}
                className="flex items-center justify-center w-7 h-7 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors duration-200"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 border-b border-white/10 mb-5">
              {(["complaint", "suggestion", "my_reports"] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => handleTabChange(t)}
                  className={
                    "px-3 py-2.5 text-sm font-medium transition-all duration-200 border-b-2 -mb-px " +
                    (tab === t
                      ? "border-violet-500 text-white"
                      : "border-transparent text-gray-500 hover:text-gray-300")
                  }
                >
                  {t === "my_reports" ? "My Reports" : t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>

            {/* My Reports panel */}
            {tab === "my_reports" ? (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {loadingReports ? (
                  <div className="flex justify-center py-6">
                    <svg className="w-5 h-5 animate-spin text-violet-500" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  </div>
                ) : myReports.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-6">No reports submitted yet.</p>
                ) : (
                  myReports.map((r) => (
                    <div key={r.id} className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-white truncate">{r.title}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${
                          r.status === "resolved"
                            ? "bg-green-500/15 border-green-500/25 text-green-400"
                            : r.status === "rejected"
                            ? "bg-red-500/15 border-red-500/25 text-red-400"
                            : "bg-yellow-500/15 border-yellow-500/25 text-yellow-400"
                        }`}>
                          {r.status ?? "pending"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 capitalize">{r.type}</span>
                        <span className="text-gray-700">·</span>
                        <span className="text-xs text-gray-600">
                          {new Date(r.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 line-clamp-2">{r.description}</p>
                    </div>
                  ))
                )}
              </div>
            ) : (

            /* Form */
            <form onSubmit={handleSubmit} className="space-y-3">

              {success && (
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {success}
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  {error}
                </div>
              )}

              <div>
                <input
                  type="text"
                  placeholder="Title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors duration-200"
                />
              </div>

              <div>
                <textarea
                  placeholder={tab === "complaint" ? "Describe the issue in detail" : "Describe your suggestion"}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  maxLength={2000}
                  className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors duration-200 resize-none"
                />
              </div>

              {tab === "complaint" && (
                <div>
                  <input
                    type="url"
                    placeholder="Evidence URL (optional — screenshot, video link)"
                    value={evidenceUrl}
                    onChange={(e) => setEvidenceUrl(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors duration-200"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-all duration-200"
              >
                {submitting ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : "Submit"}
              </button>

            </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
