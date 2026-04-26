"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";

type Reply = {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  profiles: { username: string; role: string } | null;
};

type Report = {
  id: string;
  type: "complaint" | "suggestion";
  title: string;
  description: string;
  evidence_url: string | null;
  status: "pending" | "under_review" | "resolved";
  created_at: string;
  replies: Reply[];
};

export default function MyReportsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [username, setUsername] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replyBodies, setReplyBodies] = useState<Record<string, string>>({});
  const [postingReplyFor, setPostingReplyFor] = useState<string | null>(null);
  const [replyError, setReplyError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/sign-in"); return; }

      const [{ data: profile }, { data: reportsData }] = await Promise.all([
        supabase.from("profiles").select("username").eq("id", user.id).maybeSingle(),
        supabase
          .from("reports")
          .select("id, type, title, description, evidence_url, status, created_at, report_replies(id, user_id, body, created_at, profiles(username, role))")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
      ]);

      if (cancelled) return;

      setUsername(profile?.username ?? null);
      setUserId(user.id);
      setReports(
        (reportsData ?? []).map((r: Record<string, unknown>) => ({
          ...(r as Omit<Report, "replies">),
          replies: ((r.report_replies as Reply[]) ?? []).sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          ),
        }))
      );
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [supabase, router]);

  async function handleReply(reportId: string) {
    const body = replyBodies[reportId]?.trim();
    if (!body) return;
    setPostingReplyFor(reportId);
    setReplyError("");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/sign-in"); return; }

    const { data: newReply, error } = await supabase
      .from("report_replies")
      .insert({ report_id: reportId, user_id: user.id, body })
      .select("id, user_id, body, created_at, profiles(username, role)")
      .single();

    if (error) {
      setReplyError("Failed to post reply. Please try again.");
      setPostingReplyFor(null);
      return;
    }

    setReports((prev) =>
      prev.map((r) =>
        r.id === reportId
          ? { ...r, replies: [...r.replies, newReply as unknown as Reply] }
          : r
      )
    );
    setReplyBodies((prev) => ({ ...prev, [reportId]: "" }));
    setPostingReplyFor(null);
  }

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString("en-US", {
      year: "numeric", month: "short", day: "numeric",
    });
  }

  function statusBadge(status: Report["status"]) {
    switch (status) {
      case "pending":      return "bg-yellow-500/15 border-yellow-500/30 text-yellow-400";
      case "under_review": return "bg-violet-500/15 border-violet-500/30 text-violet-400";
      case "resolved":     return "bg-green-500/15 border-green-500/30 text-green-400";
    }
  }

  function statusLabel(status: string) {
    switch (status) {
      case "pending":      return "Pending";
      case "under_review": return "Under Review";
      case "resolved":     return "Resolved";
      default:             return status;
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <svg className="w-8 h-8 animate-spin text-violet-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm text-gray-500">Loading reports...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans">
      <Navbar username={username} />

      <main className="max-w-3xl mx-auto px-6 pt-28 pb-20">

        <div className="mb-8">
          <h1 className="text-2xl font-extrabold text-white tracking-tight">My Reports</h1>
          <p className="text-sm text-gray-500 mt-1">
            {reports.length > 0
              ? reports.length + " submitted report" + (reports.length > 1 ? "s" : "")
              : "Your submitted complaints and suggestions"}
          </p>
        </div>

        {replyError && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-6">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            {replyError}
          </div>
        )}

        {reports.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-12 flex flex-col items-center justify-center text-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <svg className="w-7 h-7 text-gray-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
              </svg>
            </div>
            <div>
              <p className="text-white font-semibold">No reports yet</p>
              <p className="text-gray-500 text-sm mt-1">
                Use the support button to submit a complaint or suggestion
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {reports.map((report) => {
              const isExpanded = expandedId === report.id;
              const adminReplies = report.replies.filter(
                (r) => r.profiles?.role === "admin" || r.profiles?.role === "owner"
              );
              const userReplied = report.replies.some(
                (r) => r.user_id === userId && r.profiles?.role !== "admin" && r.profiles?.role !== "owner"
              );
              const canReply = adminReplies.length > 0 && !userReplied;

              return (
                <div
                  key={report.id}
                  className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden"
                >
                  {/* Header row */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : report.id)}
                    className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex flex-col gap-1 shrink-0">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border capitalize ${report.type === "complaint" ? "bg-red-500/15 border-red-500/30 text-red-400" : "bg-blue-500/15 border-blue-500/30 text-blue-400"}`}>
                          {report.type}
                        </span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusBadge(report.status)}`}>
                          {statusLabel(report.status)}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{report.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{fmtDate(report.created_at)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {report.replies.length > 0 && (
                        <span className="text-xs text-gray-500">
                          {report.replies.length} repl{report.replies.length === 1 ? "y" : "ies"}
                        </span>
                      )}
                      {canReply && (
                        <span className="w-2 h-2 rounded-full bg-violet-400 shrink-0" title="Admin replied — you can now respond" />
                      )}
                      <svg
                        className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                        fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                      </svg>
                    </div>
                  </button>

                  {/* Expanded section */}
                  {isExpanded && (
                    <div className="px-5 pb-5 border-t border-white/8 pt-4 space-y-4">
                      <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{report.description}</p>

                      {report.evidence_url && (() => { try { return new URL(report.evidence_url!).protocol === "https:"; } catch { return false; } })() && (
                        <a
                          href={report.evidence_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors duration-200"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                          </svg>
                          View Evidence
                        </a>
                      )}

                      {/* Reply thread */}
                      {report.replies.length > 0 && (
                        <div className="space-y-2 border-t border-white/8 pt-3">
                          {report.replies.map((reply) => {
                            const isAdminReply = reply.profiles?.role === "admin" || reply.profiles?.role === "owner";
                            return (
                              <div key={reply.id} className={`flex ${isAdminReply ? "" : "justify-end"}`}>
                                <div className={`max-w-[85%] rounded-xl px-3 py-2.5 text-sm ${isAdminReply ? "bg-violet-500/10 border border-violet-500/20" : "bg-white/5 border border-white/10"}`}>
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-semibold text-white">{reply.profiles?.username ?? "Unknown"}</span>
                                    {isAdminReply && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-400 border border-violet-500/30">Admin</span>
                                    )}
                                    <span className="text-[10px] text-gray-600">{fmtDate(reply.created_at)}</span>
                                  </div>
                                  <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">{reply.body}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Reply input */}
                      {canReply ? (
                        <div className="flex gap-2 pt-1">
                          <textarea
                            value={replyBodies[report.id] ?? ""}
                            onChange={(e) => setReplyBodies((prev) => ({ ...prev, [report.id]: e.target.value }))}
                            placeholder="Write a reply..."
                            rows={2}
                            maxLength={2000}
                            className="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 resize-none transition-colors duration-200"
                          />
                          <button
                            onClick={() => handleReply(report.id)}
                            disabled={!replyBodies[report.id]?.trim() || postingReplyFor === report.id}
                            className="self-end px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-all duration-200"
                          >
                            {postingReplyFor === report.id ? (
                              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                            ) : "Reply"}
                          </button>
                        </div>
                      ) : userReplied ? (
                        <p className="text-xs text-gray-600 italic pt-1">You have already replied to this report.</p>
                      ) : adminReplies.length === 0 ? (
                        <p className="text-xs text-gray-600 italic pt-1">Awaiting admin response...</p>
                      ) : null}
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
