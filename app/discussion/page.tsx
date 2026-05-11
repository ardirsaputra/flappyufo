"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

const PIG_COLOR_HEX: Record<string, string> = {
  pink: "#ffc8d8",
  blue: "#a8d4ff",
  purple: "#d0a8ff",
  orange: "#ffd0a0",
  green: "#a8f0c0",
  yellow: "#fff0a0",
  red: "#ffb0a8",
  teal: "#a0e8e0",
  white: "#f4f4f4",
  brown: "#d4b090",
};

interface User {
  id: number;
  username: string;
  pigColor?: string;
}
interface DiscussionItem {
  id: number;
  user_id: number;
  username: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
  comment_count: number;
}
interface Comment {
  id: number;
  user_id: number;
  username: string;
  content: string;
  created_at: string;
  updated_at: string;
}

type View = "list" | "thread" | "create" | "edit_discussion" | "my";

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "baru saja";
  if (m < 60) return `${m} menit lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  const d = Math.floor(h / 24);
  return `${d} hari lalu`;
}

export default function DiscussionPage() {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<View>("list");
  const [discussions, setDiscussions] = useState<DiscussionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Thread view
  const [activeThread, setActiveThread] = useState<DiscussionItem | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentInput, setCommentInput] = useState("");
  const [editingComment, setEditingComment] = useState<Comment | null>(null);
  const [editCommentText, setEditCommentText] = useState("");
  const commentEndRef = useRef<HTMLDivElement>(null);

  // Create / edit discussion
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [editingDiscussion, setEditingDiscussion] =
    useState<DiscussionItem | null>(null);

  // My discussions
  const [myDiscussions, setMyDiscussions] = useState<DiscussionItem[]>([]);

  const router = useRouter();

  useEffect(() => {
    const stored = localStorage.getItem("fp_user");
    if (!stored) {
      router.push("/");
      return;
    }
    setUser(JSON.parse(stored));
  }, [router]);

  const loadDiscussions = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/discussion?page=${p}`);
      const data = await res.json();
      if (p === 1) setDiscussions(data.discussions || []);
      else setDiscussions((prev) => [...prev, ...(data.discussions || [])]);
      setTotal(data.total || 0);
      setPage(p);
    } catch {
      setError("Gagal memuat diskusi");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) loadDiscussions(1);
  }, [user, loadDiscussions]);

  async function loadThread(disc: DiscussionItem) {
    setLoading(true);
    try {
      const res = await fetch(`/api/discussion?id=${disc.id}`);
      const data = await res.json();
      setActiveThread(data.discussion);
      setComments(data.comments || []);
      setView("thread");
      setTimeout(
        () => commentEndRef.current?.scrollIntoView({ behavior: "smooth" }),
        100,
      );
    } catch {
      setError("Gagal memuat thread");
    } finally {
      setLoading(false);
    }
  }

  async function loadMyDiscussions() {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/discussion?my=1&userId=${user.id}`);
      const data = await res.json();
      setMyDiscussions(data.discussions || []);
      setView("my");
    } catch {
      setError("Gagal memuat diskusimu");
    } finally {
      setLoading(false);
    }
  }

  async function submitDiscussion() {
    if (!user) return;
    if (!formTitle.trim()) {
      setError("Judul tidak boleh kosong");
      return;
    }
    if (!formContent.trim()) {
      setError("Konten tidak boleh kosong");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/discussion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_discussion",
          userId: user.id,
          username: user.username,
          title: formTitle.trim(),
          content: formContent.trim(),
        }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }
      setFormTitle("");
      setFormContent("");
      await loadDiscussions(1);
      loadThread(data.discussion);
    } catch {
      setError("Gagal membuat diskusi");
    } finally {
      setLoading(false);
    }
  }

  async function submitEditDiscussion() {
    if (!user || !editingDiscussion) return;
    if (!formTitle.trim() && !formContent.trim()) {
      setError("Isi setidaknya satu field");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/discussion", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "edit_discussion",
          userId: user.id,
          username: user.username,
          id: editingDiscussion.id,
          title: formTitle.trim() || undefined,
          content: formContent.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }
      await loadDiscussions(1);
      loadThread({ ...editingDiscussion, ...data.discussion });
      setEditingDiscussion(null);
    } catch {
      setError("Gagal mengedit diskusi");
    } finally {
      setLoading(false);
    }
  }

  async function deleteDiscussion(id: number) {
    if (!user) return;
    if (!confirm("Hapus diskusi ini?")) return;
    setLoading(true);
    try {
      const res = await fetch("/api/discussion", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_discussion",
          userId: user.id,
          username: user.username,
          id,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }
      await loadDiscussions(1);
      if (view === "my") loadMyDiscussions();
      else setView("list");
    } catch {
      setError("Gagal menghapus");
    } finally {
      setLoading(false);
    }
  }

  async function submitComment() {
    if (!user || !activeThread) return;
    const text = commentInput.trim();
    if (!text) return;
    setLoading(true);
    try {
      const res = await fetch("/api/discussion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_comment",
          userId: user.id,
          username: user.username,
          discussionId: activeThread.id,
          content: text,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }
      setComments((prev) => [...prev, data.comment]);
      setCommentInput("");
      setTimeout(
        () => commentEndRef.current?.scrollIntoView({ behavior: "smooth" }),
        50,
      );
    } catch {
      setError("Gagal mengirim komentar");
    } finally {
      setLoading(false);
    }
  }

  async function submitEditComment() {
    if (!user || !editingComment) return;
    const text = editCommentText.trim();
    if (!text) return;
    setLoading(true);
    try {
      const res = await fetch("/api/discussion", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "edit_comment",
          userId: user.id,
          username: user.username,
          id: editingComment.id,
          content: text,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }
      setComments((prev) =>
        prev.map((c) =>
          c.id === editingComment.id ? { ...c, ...data.comment } : c,
        ),
      );
      setEditingComment(null);
    } catch {
      setError("Gagal mengedit komentar");
    } finally {
      setLoading(false);
    }
  }

  async function deleteComment(id: number) {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch("/api/discussion", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_comment",
          userId: user.id,
          username: user.username,
          id,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }
      setComments((prev) => prev.filter((c) => c.id !== id));
    } catch {
      setError("Gagal menghapus komentar");
    } finally {
      setLoading(false);
    }
  }

  if (!user) return null;

  const accentColor = PIG_COLOR_HEX[user.pigColor || "pink"];

  return (
    <div className="min-h-screen flex flex-col bg-linear-to-br from-[#9b7634] via-[#C4955A] to-[#8B5E3C]">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-black/30 backdrop-blur-md border-b border-white/10">
        <div className="flex items-center gap-2 px-4 py-2.5 max-w-lg mx-auto">
          <button
            onClick={() => {
              if (view === "thread" || view === "create" || view === "my")
                setView("list");
              else router.push("/lobby");
            }}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white transition shrink-0"
          >
            ‹
          </button>
          <h1 className="flex-1 text-white font-bold text-sm truncate">
            {view === "list" && "💬 Diskusi"}
            {view === "thread" && (activeThread?.title || "Thread")}
            {view === "create" && "📝 Buat Diskusi"}
            {view === "edit_discussion" && "✏️ Edit Diskusi"}
            {view === "my" && "📂 Diskusiku"}
          </h1>
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className="w-5 h-5 rounded-full border border-white/40 text-xs flex items-center justify-center"
              style={{ backgroundColor: accentColor }}
            >
              {user.username[0].toUpperCase()}
            </span>
            <span className="text-white/70 text-xs hidden sm:block">
              {user.username}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col max-w-lg mx-auto w-full px-3 py-3 gap-2">
        {/* Error toast */}
        {error && (
          <div className="bg-red-500/90 text-white text-xs font-bold px-3 py-2 rounded-xl flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={() => setError("")}
              className="ml-2 text-white/70 hover:text-white"
            >
              ✕
            </button>
          </div>
        )}

        {/* ── LIST VIEW ── */}
        {view === "list" && (
          <>
            {/* Action bar */}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setFormTitle("");
                  setFormContent("");
                  setError("");
                  setView("create");
                }}
                className="flex-1 py-2 bg-white/25 hover:bg-white/35 text-white font-bold text-sm rounded-xl transition active:scale-95 flex items-center justify-center gap-1.5"
              >
                <span>+</span> Buat Diskusi
              </button>
              <button
                onClick={loadMyDiscussions}
                className="px-4 py-2 bg-white/15 hover:bg-white/25 text-white/80 font-bold text-sm rounded-xl transition active:scale-95"
              >
                📂 Milikku
              </button>
            </div>

            {/* Discussion list */}
            {loading && discussions.length === 0 ? (
              <div className="text-center text-white/50 text-sm py-10">
                Memuat...
              </div>
            ) : discussions.length === 0 ? (
              <div className="text-center py-10">
                <div className="text-4xl mb-2">💬</div>
                <p className="text-white/60 text-sm">
                  Belum ada diskusi. Mulai yang pertama!
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {discussions.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => loadThread(d)}
                    className="w-full bg-white/15 hover:bg-white/25 backdrop-blur-sm rounded-2xl p-3 text-left transition active:scale-[0.98] border border-white/10"
                  >
                    <div className="flex items-start gap-2">
                      <div
                        className="w-8 h-8 rounded-full border-2 border-white/30 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
                        style={{
                          backgroundColor:
                            PIG_COLOR_HEX[d.username] || "#ffc8d8",
                        }}
                      >
                        {d.username[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-bold text-sm leading-snug line-clamp-2">
                          {d.title}
                        </p>
                        <p className="text-white/50 text-xs mt-0.5 line-clamp-1">
                          {d.content}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <span className="text-white/60 text-xs font-semibold">
                            {d.username}
                          </span>
                          <span className="text-white/30 text-xs">·</span>
                          <span className="text-white/40 text-xs">
                            {timeAgo(d.updated_at)}
                          </span>
                          <span className="text-white/30 text-xs">·</span>
                          <span className="text-white/50 text-xs">
                            💬 {d.comment_count}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
                {discussions.length < total && (
                  <button
                    onClick={() => loadDiscussions(page + 1)}
                    disabled={loading}
                    className="w-full py-2.5 bg-white/10 hover:bg-white/20 text-white/70 text-sm font-bold rounded-xl transition"
                  >
                    {loading ? "Memuat..." : "Muat lebih banyak"}
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {/* ── MY DISCUSSIONS ── */}
        {view === "my" && (
          <div className="flex flex-col gap-2">
            {loading && myDiscussions.length === 0 ? (
              <div className="text-center text-white/50 text-sm py-10">
                Memuat...
              </div>
            ) : myDiscussions.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-white/60 text-sm">
                  Kamu belum punya diskusi.
                </p>
                <button
                  onClick={() => {
                    setFormTitle("");
                    setFormContent("");
                    setError("");
                    setView("create");
                  }}
                  className="mt-3 px-4 py-2 bg-white/20 hover:bg-white/30 text-white font-bold text-sm rounded-xl transition"
                >
                  + Buat Diskusi
                </button>
              </div>
            ) : (
              myDiscussions.map((d) => (
                <div
                  key={d.id}
                  className="bg-white/15 backdrop-blur-sm rounded-2xl p-3 border border-white/10"
                >
                  <p className="text-white font-bold text-sm leading-snug line-clamp-2 mb-1">
                    {d.title}
                  </p>
                  <p className="text-white/50 text-xs mb-2 line-clamp-1">
                    {d.content}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white/40 text-xs">
                      {timeAgo(d.updated_at)}
                    </span>
                    <span className="text-white/30 text-xs">·</span>
                    <span className="text-white/50 text-xs">
                      💬 {d.comment_count}
                    </span>
                    <div className="ml-auto flex gap-1.5">
                      <button
                        onClick={() => loadThread(d)}
                        className="px-2.5 py-1 bg-white/20 hover:bg-white/30 text-white text-xs font-bold rounded-lg transition"
                      >
                        Lihat
                      </button>
                      <button
                        onClick={() => {
                          setEditingDiscussion(d);
                          setFormTitle(d.title);
                          setFormContent(d.content);
                          setError("");
                          setView("edit_discussion");
                        }}
                        className="px-2.5 py-1 bg-blue-500/60 hover:bg-blue-500/80 text-white text-xs font-bold rounded-lg transition"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteDiscussion(d.id)}
                        className="px-2.5 py-1 bg-red-500/60 hover:bg-red-500/80 text-white text-xs font-bold rounded-lg transition"
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── CREATE / EDIT DISCUSSION ── */}
        {(view === "create" || view === "edit_discussion") && (
          <div className="flex flex-col gap-3">
            <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-4 border border-white/10">
              <p className="text-white/60 text-xs mb-1.5 font-semibold">
                Judul *
              </p>
              <input
                type="text"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Apa yang ingin kamu diskusikan?"
                maxLength={200}
                className="w-full bg-black/20 text-white placeholder-white/30 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-white/30 border border-white/10"
              />
            </div>
            <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-4 border border-white/10">
              <p className="text-white/60 text-xs mb-1.5 font-semibold">
                Konten *
              </p>
              <textarea
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                placeholder="Tulis isi diskusimu di sini..."
                maxLength={5000}
                rows={6}
                className="w-full bg-black/20 text-white placeholder-white/30 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-white/30 border border-white/10 resize-none"
              />
              <p className="text-white/30 text-xs mt-1 text-right">
                {formContent.length}/5000
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setView(editingDiscussion ? "my" : "list");
                  setError("");
                }}
                className="flex-1 py-2.5 bg-white/10 hover:bg-white/20 text-white/70 font-bold text-sm rounded-xl transition"
              >
                Batal
              </button>
              <button
                onClick={
                  view === "edit_discussion"
                    ? submitEditDiscussion
                    : submitDiscussion
                }
                disabled={loading || !formTitle.trim() || !formContent.trim()}
                className="flex-1 py-2.5 bg-white/30 hover:bg-white/40 disabled:opacity-40 text-white font-bold text-sm rounded-xl transition active:scale-95"
              >
                {loading
                  ? "Menyimpan..."
                  : view === "edit_discussion"
                    ? "Simpan Perubahan"
                    : "Posting"}
              </button>
            </div>
          </div>
        )}

        {/* ── THREAD VIEW ── */}
        {view === "thread" && activeThread && (
          <div className="flex flex-col gap-2">
            {/* Post */}
            <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-4 border border-white/10">
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-7 h-7 rounded-full border-2 border-white/30 flex items-center justify-center text-xs font-bold shrink-0"
                  style={{
                    backgroundColor:
                      PIG_COLOR_HEX[activeThread.username] || "#ffc8d8",
                  }}
                >
                  {activeThread.username[0].toUpperCase()}
                </div>
                <div>
                  <span className="text-white font-bold text-xs">
                    {activeThread.username}
                  </span>
                  <span className="text-white/40 text-xs ml-2">
                    {timeAgo(activeThread.created_at)}
                  </span>
                </div>
                {user.id === activeThread.user_id && (
                  <div className="ml-auto flex gap-1.5">
                    <button
                      onClick={() => {
                        setEditingDiscussion(activeThread);
                        setFormTitle(activeThread.title);
                        setFormContent(activeThread.content);
                        setError("");
                        setView("edit_discussion");
                      }}
                      className="px-2 py-0.5 bg-blue-500/50 hover:bg-blue-500/70 text-white text-xs font-bold rounded-lg transition"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteDiscussion(activeThread.id)}
                      className="px-2 py-0.5 bg-red-500/50 hover:bg-red-500/70 text-white text-xs font-bold rounded-lg transition"
                    >
                      Hapus
                    </button>
                  </div>
                )}
              </div>
              <h2 className="text-white font-extrabold text-base leading-snug mb-2">
                {activeThread.title}
              </h2>
              <p className="text-white/85 text-sm leading-relaxed whitespace-pre-wrap">
                {activeThread.content}
              </p>
            </div>

            {/* Comments */}
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl border border-white/10 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-white/10">
                <span className="text-white/70 text-xs font-bold">
                  💬 {comments.length} Komentar
                </span>
              </div>
              <div className="px-4 py-2 flex flex-col gap-2.5 max-h-80 overflow-y-auto">
                {comments.length === 0 ? (
                  <p className="text-white/40 text-xs text-center py-3">
                    Belum ada komentar. Jadilah yang pertama!
                  </p>
                ) : (
                  comments.map((c) => (
                    <div key={c.id} className="flex gap-2 group">
                      <div
                        className="w-6 h-6 rounded-full border border-white/30 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5"
                        style={{
                          backgroundColor:
                            PIG_COLOR_HEX[c.username] || "#ffc8d8",
                        }}
                      >
                        {c.username[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        {editingComment?.id === c.id ? (
                          <div className="flex flex-col gap-1.5">
                            <textarea
                              value={editCommentText}
                              onChange={(e) =>
                                setEditCommentText(e.target.value)
                              }
                              rows={2}
                              maxLength={2000}
                              className="w-full bg-black/20 text-white text-xs rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-white/30 resize-none border border-white/10"
                            />
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => setEditingComment(null)}
                                className="px-2 py-1 bg-white/10 text-white/60 text-xs rounded-lg"
                              >
                                Batal
                              </button>
                              <button
                                onClick={submitEditComment}
                                disabled={loading}
                                className="px-2 py-1 bg-white/25 text-white text-xs font-bold rounded-lg disabled:opacity-40"
                              >
                                Simpan
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-baseline gap-1.5 flex-wrap">
                              <span
                                className={`text-xs font-bold ${c.username === user.username ? "text-yellow-300" : "text-white"}`}
                              >
                                {c.username}
                              </span>
                              <span className="text-white/30 text-[10px]">
                                {timeAgo(c.created_at)}
                              </span>
                              {c.updated_at !== c.created_at && (
                                <span className="text-white/20 text-[10px]">
                                  (diedit)
                                </span>
                              )}
                            </div>
                            <p className="text-white/85 text-xs leading-relaxed whitespace-pre-wrap mt-0.5">
                              {c.content}
                            </p>
                            {user.id === c.user_id && (
                              <div className="flex gap-1.5 mt-0.5 opacity-0 group-hover:opacity-100 transition">
                                <button
                                  onClick={() => {
                                    setEditingComment(c);
                                    setEditCommentText(c.content);
                                  }}
                                  className="text-blue-300/70 hover:text-blue-300 text-[10px] transition"
                                >
                                  edit
                                </button>
                                <button
                                  onClick={() => deleteComment(c.id)}
                                  className="text-red-300/70 hover:text-red-300 text-[10px] transition"
                                >
                                  hapus
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))
                )}
                <div ref={commentEndRef} />
              </div>
              {/* Comment input */}
              <div className="px-3 py-2.5 border-t border-white/10 bg-black/10">
                <div className="flex gap-2 items-end">
                  <textarea
                    value={commentInput}
                    onChange={(e) => setCommentInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        submitComment();
                      }
                    }}
                    placeholder="Tulis komentar... (Enter untuk kirim)"
                    maxLength={2000}
                    rows={2}
                    className="flex-1 bg-white/15 text-white placeholder-white/30 rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-white/20 resize-none border border-white/10 min-w-0"
                  />
                  <button
                    onClick={submitComment}
                    disabled={!commentInput.trim() || loading}
                    className="px-3 py-2 bg-white/25 hover:bg-white/35 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition active:scale-95 shrink-0"
                  >
                    Kirim
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
