"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useHouseholdContext } from "@/context/HouseholdContext";
import { useHouseholdMembers } from "@/hooks/useHouseholdMembers";
import { createClient } from "@/lib/supabase/client";

// Deterministic color from initials
function getInitialsColor(initials: string): string {
  const colors = [
    "bg-blue-100 text-blue-700",
    "bg-purple-100 text-purple-700",
    "bg-green-100 text-green-700",
    "bg-rose-100 text-rose-700",
    "bg-amber-100 text-amber-700",
    "bg-cyan-100 text-cyan-700",
  ];
  const idx = (initials.charCodeAt(0) + (initials.charCodeAt(1) || 0)) % colors.length;
  return colors[idx];
}

export default function MembersPage() {
  const { householdId, householdName } = useHouseholdContext();
  const { members, currentUserId, currentUserRole, loading, removeMember } =
    useHouseholdMembers(householdId);
  const [inviteCode, setInviteCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("households")
      .select("invite_code")
      .eq("id", householdId)
      .single()
      .then(({ data }) => {
        if (data) setInviteCode(data.invite_code);
      });
  }, [householdId]);

  const isOwner = currentUserRole === "owner";
  const ownerCount = members.filter((m) => m.role === "owner").length;

  async function handleCopyLink() {
    const link = `${window.location.origin}/household/join?code=${inviteCode}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      await navigator.clipboard.writeText(inviteCode);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleRemove(userId: string) {
    setRemoving(userId);
    await removeMember(userId);
    setRemoving(null);
  }

  async function handleLeave() {
    if (!currentUserId) return;
    await removeMember(currentUserId);
    window.location.href = "/dashboard";
  }

  const canLeave = !isOwner || ownerCount > 1;

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-10">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-8">
        <Link
          href={`/household/${householdId}/pantry`}
          className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors active:opacity-60"
          aria-label="Back to pantry"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <p className="text-xs text-gray-400 font-medium uppercase tracking-widest">{householdName}</p>
          <h1 className="text-2xl font-semibold text-gray-900">Members</h1>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <svg className="animate-spin w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : (
        <div className="flex flex-col gap-5">

          {/* ── Member list ─────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <AnimatePresence initial={false}>
              {members.map((member, index) => {
                const isMe = member.user_id === currentUserId;
                const canRemoveThis = isOwner && !isMe;
                const colorClass = getInitialsColor(member.initials);

                return (
                  <motion.div
                    key={member.user_id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className={`flex items-center gap-3 px-4 py-3.5 ${index > 0 ? "border-t border-gray-50" : ""}`}
                  >
                    {/* Avatar */}
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 ${colorClass}`}
                    >
                      {member.initials}
                    </div>

                    {/* Name + role */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-medium text-gray-900 truncate">{member.display_name}</p>
                        {isMe && (
                          <span className="text-[10px] text-gray-400 font-medium flex-shrink-0">(you)</span>
                        )}
                      </div>
                      <p className={`text-xs font-medium mt-0.5 ${member.role === "owner" ? "text-indigo-500" : "text-gray-400"}`}>
                        {member.role === "owner" ? "Owner" : "Member"}
                      </p>
                    </div>

                    {/* Remove button */}
                    {canRemoveThis && (
                      <button
                        onClick={() => handleRemove(member.user_id)}
                        disabled={removing === member.user_id}
                        className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-xl text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors active:scale-90 disabled:opacity-40"
                        aria-label={`Remove ${member.display_name}`}
                      >
                        {removing === member.user_id ? (
                          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        )}
                      </button>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {/* ── Invite section ──────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 flex flex-col gap-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Invite someone</p>

            {inviteCode && (
              <div className="flex items-center justify-center bg-gray-50 rounded-xl py-3.5">
                <span className="font-mono text-2xl tracking-[0.3em] font-bold text-gray-900 select-all">
                  {inviteCode.toUpperCase()}
                </span>
              </div>
            )}

            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleCopyLink}
              disabled={!inviteCode}
              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all ${
                copied
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : "bg-gray-900 text-white hover:bg-gray-700"
              } disabled:opacity-40`}
            >
              <AnimatePresence mode="wait" initial={false}>
                {copied ? (
                  <motion.span
                    key="copied"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Copied!
                  </motion.span>
                ) : (
                  <motion.span
                    key="copy"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copy invite link
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          </div>

          {/* ── Leave household ─────────────────────────────── */}
          {canLeave && (
            <AnimatePresence mode="wait">
              {confirmLeave ? (
                <motion.div
                  key="confirm"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.18 }}
                  className="bg-red-50 border border-red-200 rounded-2xl p-4 flex flex-col gap-2"
                >
                  <p className="text-sm font-semibold text-red-800 text-center">
                    Leave {householdName}?
                  </p>
                  <p className="text-xs text-red-400 text-center mb-1">
                    You'll need a new invite to rejoin.
                  </p>
                  <button
                    onClick={handleLeave}
                    className="w-full py-2.5 bg-red-500 text-white text-sm font-medium rounded-xl hover:bg-red-600 active:scale-[0.97] transition-all"
                  >
                    Leave household
                  </button>
                  <button
                    onClick={() => setConfirmLeave(false)}
                    className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors active:opacity-60"
                  >
                    Cancel
                  </button>
                </motion.div>
              ) : (
                <motion.button
                  key="leave-btn"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setConfirmLeave(true)}
                  className="w-full py-2.5 text-sm text-red-400 hover:text-red-600 transition-colors active:opacity-60"
                >
                  Leave household
                </motion.button>
              )}
            </AnimatePresence>
          )}
        </div>
      )}
    </div>
  );
}
