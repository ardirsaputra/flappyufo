"use client";
import { useState, useEffect, useRef } from "react";
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

interface Discussion {
  id: number;
  user_id: number;
  username: string;
  pig_color: string;
  content: string;
  parent_id: number | null;
  created_at: string;
  reply_count?: number;
}

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

function Avatar({ color, username }: { color: string; username: string }) {
  return (
    <div
      className="w-8 h-8 rounded-full border-2 border-white/60 flex items-center justify-center text-xs font-bold shrink-0"
      style={{ backgroundColor: PIG_COLOR_HEX[color] || "#ffc8d8" }}
    >
      {username.charAt(0).toUpperCase()}
    </div>
  );
}

function ReplyThread({
  parentId,
  user,
  onReplyPosted,
}: {
  parentId: number;
  user: User;
  onReplyPosted: () => void;
}) {
  const [replies, setReplies] = useState<Discussion[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    fetch(`/api/discussion?parent_id=${parentId}`)
      .then((r) => r.json())
      .then((d) => setReplies(d.replies || []))
      .finally(() => setLoading(false));
  }, [parentId]);

  async function postReply() {
    const trimmed = text.trim();
    if (!trimmed || posting) return;
    setPosting(true);
    const res = await fetch("/api/discussion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: user.id,
        username: user.username,
        pig_color: user.pigColor || "pink",
        content: trimmed,
        parent_id: parentId,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setReplies((prev) => [...prev, data.discussion]);
      setText("");
      onReplyPosted();
    }
    setPosting(false);
  }

  return (
    <div className="ml-10 mt-2 border-l-2 border-white/20 pl-3 space-y-2">
      {loading ? (
        <p className="text-white/40 text-xs py-1">Memuat balasan...</p>
      ) : replies.length === 0 ? (
        <p className="text-white/40 text-xs py-1">Belum ada balasan.</p>
      ) : (
        replies.map((r) => (
          <div key={r.id} className="flex gap-2">
            <Avatar color={r.pig_color} username={r.username} />
            <div className="flex-1 min-w-0 bg-white/10 rounded-xl px-3 py-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-white font-bold text-xs">{r.username}</span>
                <span className="text-white/40 text-[10px]">{timeAgo(r.created_at)}</span>
              </div>
              <p className="text-white/90 text-sm mt-1 break-words">{r.content}</p>
            </div>
          </div>
        ))
      )}
      {/* Reply input */}
      <div className="flex gap-2 mt-2">
        <Avatar color={user.pigColor || "pink"} username={user.username} />
        <div className="flex-1 flex gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                postReply();
              }
            }}
            placeholder="Tulis balasan..."
            maxLength={500}
            rows={1}
            className="flex-1 bg-white/20 text-white placeholder-white/40 rounded-xl px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-pink-300 resize-none"
          />
          <button
            onClick={postReply}
            disabled={!text.trim() || posting}
            className="px-3 py-1.5 bg-pink-500 hover:bg-pink-400 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition active:scale-95 shrink-0"
          >
            Kirim
          </button>
        </div>
      </div>
    </div>
  );
}

function DiscussionCard({
  discussion,
  user,
  onDeleted,
}: {
  discussion: Discussion;
  user: User;
  onDeleted: (id: number) => void;
}) {
  const [showReplies, setShowReplies] = useState(false);
  const [replyCount, setReplyCount] = useState(discussion.reply_count ?? 0);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm("Hapus diskusi ini?")) return;
    setDeleting(true);
    const res = await fetch("/api/discussion", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: discussion.id, user_id: user.id }),
    });
    if (res.ok) onDeleted(discussion.id);
    else setDeleting(false);
  }

  return (
    <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-4 shadow-lg">
      <div className="flex gap-3">
        <Avatar color={discussion.pig_color} username={discussion.username} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-white font-bold text-sm">{discussion.username}</span>
            <span className="text-white/40 text-xs">{timeAgo(discussion.created_at)}</span>
            {discussion.user_id === user.id && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="ml-auto text-white/30 hover:text-red-400 text-xs transition"
              >
                Hapus
              </button>
            )}
          </div>
          <p className="text-white/90 text-sm leading-relaxed break-words">
            {discussion.content}
          </p>
          <button
            onClick={() => setShowReplies((v) => !v)}
            className="mt-2 text-white/50 hover:text-white text-xs font-semibold transition flex items-center gap-1"
          >
            💬 {replyCount > 0 ? `${replyCount} balasan` : "Balas"}
            <span className="text-white/30">{showReplies ? "▲" : "▼"}</span>
          </button>
        </div>
      </div>
      {showReplies && (
        <ReplyThread
          parentId={discussion.id}
          user={user}
          onReplyPosted={() => setReplyCount((n) => n + 1)}
        />
      )}
    </div>
  );
}

export default function DiscussionPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPost, setNewPost] = useState("");
  const [posting, setPosting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem("fp_user");
    if (!stored) {
      router.push("/");
      return;
    }
    setUser(JSON.parse(stored));
  }, [router]);

  useEffect(() => {
    fetch("/api/discussion")
      .then((r) => r.json())
      .then((d) => setDiscussions(d.discussions || []))
      .finally(() => setLoading(false));
  }, []);

  async function submitPost() {
    if (!user || !newPost.trim() || posting) return;
    setPosting(true);
    const res = await fetch("/api/discussion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: user.id,
        username: user.username,
        pig_color: user.pigColor || "pink",
        content: newPost.trim(),
        parent_id: null,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setDiscussions((prev) => [{ ...data.discussion, reply_count: 0 }, ...prev]);
      setNewPost("");
    }
    setPosting(false);
  }

  if (!user) return null;

  return (
    <div className="min-h-screen flex flex-col items-center bg-gradient-to-br from-[#1a1040] via-[#2d1b69] to-[#1a1040] p-3 pb-8">
      <div className="w-full max-w-md space-y-3">
        {/* Header */}
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={() => router.push("/lobby")}
            className="text-white/60 hover:text-white text-sm underline transition shrink-0"
          >
            ← Lobby
          </button>
          <h1 className="text-white font-extrabold text-lg flex-1 text-center">
            💬 Forum Diskusi
          </h1>
          <div className="w-12" />
        </div>

        {/* Info banner */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl px-4 py-3 text-center">
          <p className="text-white/80 text-xs leading-relaxed">
            Tempat berbagi ide, saran, dan masukan untuk pengembangan game ini.
            Semua pemain bisa ikut berdiskusi!
          </p>
        </div>

        {/* New post box */}
        <div className="bg-white/15 backdrop-blur-md rounded-2xl p-4 shadow-xl">
          <div className="flex gap-3">
            <Avatar color={user.pigColor || "pink"} username={user.username} />
            <div className="flex-1 space-y-2">
              <textarea
                ref={textareaRef}
                value={newPost}
                onChange={(e) => setNewPost(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.ctrlKey) {
                    e.preventDefault();
                    submitPost();
                  }
                }}
                placeholder="Tulis ide, saran, atau pertanyaanmu... (Ctrl+Enter untuk kirim)"
                maxLength={1000}
                rows={3}
                className="w-full bg-white/20 text-white placeholder-white/40 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-400 resize-none"
              />
              <div className="flex items-center justify-between">
                <span className="text-white/30 text-xs">{newPost.length}/1000</span>
                <button
                  onClick={submitPost}
                  disabled={!newPost.trim() || posting}
                  className="px-5 py-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 disabled:opacity-40 text-white font-bold text-sm rounded-xl transition active:scale-95"
                >
                  {posting ? "Mengirim..." : "Posting"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Discussion list */}
        <div className="space-y-3">
          {loading ? (
            <div className="text-center py-10">
              <p className="text-white/50 animate-pulse">Memuat diskusi...</p>
            </div>
          ) : discussions.length === 0 ? (
            <div className="bg-white/10 rounded-2xl py-10 text-center">
              <p className="text-4xl mb-2">💬</p>
              <p className="text-white/60 font-semibold">Belum ada diskusi</p>
              <p className="text-white/40 text-xs mt-1">Jadilah yang pertama memulai!</p>
            </div>
          ) : (
            discussions.map((d) => (
              <DiscussionCard
                key={d.id}
                discussion={d}
                user={user}
                onDeleted={(id) =>
                  setDiscussions((prev) => prev.filter((x) => x.id !== id))
                }
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
