"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "next-themes";
import { useHouseholdContext } from "@/context/HouseholdContext";
import { useHouseholdMembers } from "@/hooks/useHouseholdMembers";
import { createClient } from "@/lib/supabase/client";
import { MEMBER_COLORS, DEFAULT_COLOR, hexAlpha } from "@/lib/memberColors";

// ── Inline color swatch ────────────────────────────────────────────
function ColorSwatch({
  color,
  selected,
  taken,
  onClick,
}: {
  color: { id: string; hex: string; label: string };
  selected: boolean;
  taken: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      whileTap={taken ? {} : { scale: 0.88 }}
      onClick={taken ? undefined : onClick}
      title={taken ? `${color.label} (taken)` : color.label}
      className="relative w-10 h-10 rounded-full focus-visible:outline-none transition-opacity"
      style={{
        backgroundColor: taken ? hexAlpha(color.hex, 0.25) : color.hex,
        cursor: taken ? "not-allowed" : "pointer",
        boxShadow: selected ? `0 0 0 3px white, 0 0 0 5px ${color.hex}` : "none",
      }}
    >
      <AnimatePresence>
        {selected && (
          <motion.span
            key="check"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <svg className="w-5 h-5 text-white drop-shadow-sm" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </motion.span>
        )}
        {taken && !selected && (
          <span className="absolute inset-0 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

export default function SettingsPage() {
  const { householdId, householdName } = useHouseholdContext();
  const { members, currentUserId, currentUserRole, loading, removeMember } =
    useHouseholdMembers(householdId);
  const { theme, setTheme } = useTheme();

  // ── Profile state ─────────────────────────────────────────────────
  const [displayName, setDisplayName] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [profileSeeded, setProfileSeeded] = useState(false);

  // ── Household state ───────────────────────────────────────────────
  const [inviteCode, setInviteCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const supabase = createClient();
  const me = members.find((m) => m.user_id === currentUserId);
  const isOwner = currentUserRole === "owner";
  const ownerCount = members.filter((m) => m.role === "owner").length;
  const canLeave = !isOwner || ownerCount > 1;
  const takenColors = members
    .filter((m) => m.user_id !== currentUserId && m.color)
    .map((m) => m.color!);
  const profileChanged =
    me && (displayName.trim() !== me.display_name || color !== (me.color ?? null));
  const needsColor = !color;

  // Seed from member data once loaded
  useEffect(() => {
    if (me && !profileSeeded) {
      setDisplayName(me.display_name);
      setColor(me.color ?? null);
      setProfileSeeded(true);
    }
  }, [me, profileSeeded]);

  // Fetch invite code
  useEffect(() => {
    supabase
      .from("households")
      .select("invite_code")
      .eq("id", householdId)
      .single()
      .then(({ data }) => { if (data) setInviteCode(data.invite_code); });
  }, [householdId]);

  // Compute live initials preview
  const initials = displayName.trim()
    ? displayName.trim().split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()
    : me?.initials ?? "?";
  const avatarColor = color ?? DEFAULT_COLOR;

  async function handleSaveProfile() {
    if (!currentUserId || !displayName.trim()) return;
    setSaving(true);
    await supabase
      .from("profiles")
      .update({ display_name: displayName.trim(), color })
      .eq("id", currentUserId);
    setSaving(false);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  }

  async function handleCopyLink() {
    const link = `${window.location.origin}/household/join?code=${inviteCode}`;
    try { await navigator.clipboard.writeText(link); }
    catch { await navigator.clipboard.writeText(inviteCode); }
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
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

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/auth/login";
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-24">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-7">
        <Link
          href={`/household/${householdId}/pantry`}
          className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-900 dark:hover:text-gray-50 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors active:opacity-60 flex-shrink-0"
          aria-label="Back"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <p className="text-xs text-gray-400 dark:text-gray-500 font-medium">{householdName}</p>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">Settings</h1>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col gap-4">
          {[120, 200, 160].map((h, i) => (
            <div key={i} className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 animate-pulse" style={{ height: h }} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4">

          {/* ── Appearance card ───────────────────────────────────── */}
          <section>
            <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Appearance</p>
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3.5">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Theme</p>
                <div className="flex items-center gap-1 bg-gray-100 dark:bg-zinc-800 rounded-xl p-1">
                  {(["system", "light", "dark"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTheme(t)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-all capitalize ${
                        theme === t
                          ? "bg-white dark:bg-zinc-700 text-gray-900 dark:text-white shadow-sm"
                          : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ── Profile card ──────────────────────────────────────── */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm overflow-hidden">
            <div className="px-5 pt-5 pb-1">
              <p className="text-xs font-medium text-gray-400 dark:text-gray-500 mb-4">Your profile</p>

              {/* Avatar + name */}
              <div className="flex items-center gap-4 mb-4">
                <motion.div
                  animate={{ backgroundColor: hexAlpha(avatarColor, 0.15) }}
                  transition={{ duration: 0.2 }}
                  className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold flex-shrink-0"
                  style={{ color: avatarColor }}
                >
                  {initials}
                </motion.div>
                <div className="flex-1">
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSaveProfile()}
                    placeholder="Your name"
                    className="w-full text-sm text-gray-900 dark:text-gray-50 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 outline-none focus:border-gray-400 dark:focus:border-zinc-500 transition-colors"
                  />
                </div>
              </div>

              {/* Color picker */}
              <div className={`mb-4 rounded-xl p-3 transition-colors ${needsColor ? "bg-amber-50 border border-amber-200" : "bg-gray-50 dark:bg-zinc-800"}`}>
                {needsColor && (
                  <div className="flex items-center gap-1.5 mb-2.5">
                    <svg className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
                    </svg>
                    <p className="text-xs font-medium text-amber-700">Choose a color so your household can identify you</p>
                  </div>
                )}
                {!needsColor && <p className="text-xs font-medium text-gray-400 dark:text-gray-500 mb-2.5">Your color</p>}
                <div className="flex gap-2.5 flex-wrap">
                  {MEMBER_COLORS.map((c) => (
                    <ColorSwatch
                      key={c.id}
                      color={c}
                      selected={color === c.hex}
                      taken={takenColors.includes(c.hex)}
                      onClick={() => setColor(c.hex)}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Save button */}
            <div className="px-5 pb-5">
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={handleSaveProfile}
                disabled={saving || (!profileChanged && !needsColor)}
                animate={{
                  backgroundColor: savedFlash ? "#f0fdf4" : (profileChanged || needsColor) ? "#111827" : "#f3f4f6",
                }}
                transition={{ duration: 0.2 }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-colors disabled:cursor-default"
                style={{ color: savedFlash ? "#15803d" : (profileChanged || needsColor) ? "#fff" : "#9ca3af" }}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {savedFlash ? (
                    <motion.span key="saved" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      Saved!
                    </motion.span>
                  ) : (
                    <motion.span key="save" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                      {saving ? "Saving…" : "Save profile"}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            </div>
          </div>

          {/* ── Household card ─────────────────────────────────────── */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm overflow-hidden">

            {/* Invite section */}
            <div className="px-5 pt-5 pb-4 border-b border-gray-50 dark:border-zinc-800">
              <p className="text-xs font-medium text-gray-400 dark:text-gray-500 mb-3">Invite someone</p>
              {inviteCode && (
                <div className="flex items-center justify-center bg-gray-50 dark:bg-zinc-800 rounded-xl py-3 mb-3">
                  <span className="font-mono text-2xl tracking-[0.3em] font-bold text-gray-900 dark:text-gray-50 select-all">
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
                    : "bg-gray-900 text-white"
                } disabled:opacity-40`}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {copied ? (
                    <motion.span key="copied" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      Copied!
                    </motion.span>
                  ) : (
                    <motion.span key="copy" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Copy invite link
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            </div>

            {/* Member list */}
            <div>
              <p className="text-xs font-medium text-gray-400 dark:text-gray-500 px-5 pt-4 pb-2">Members</p>
              <AnimatePresence initial={false}>
                {members.map((member, index) => {
                  const isMe = member.user_id === currentUserId;
                  const canRemove = isOwner && !isMe;
                  const displayColor = isMe ? (color ?? DEFAULT_COLOR) : (member.color ?? DEFAULT_COLOR);

                  return (
                    <motion.div
                      key={member.user_id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className={`flex items-center gap-3 px-5 py-3 ${index > 0 ? "border-t border-gray-50 dark:border-zinc-800" : ""}`}
                    >
                      <motion.div
                        animate={{ backgroundColor: hexAlpha(displayColor, 0.15) }}
                        transition={{ duration: 0.2 }}
                        className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0"
                        style={{ color: displayColor }}
                      >
                        {isMe && initials ? initials : member.initials}
                      </motion.div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-50 truncate">
                            {isMe && displayName.trim() ? displayName.trim() : member.display_name}
                          </p>
                          {isMe && <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium flex-shrink-0">(you)</span>}
                        </div>
                        <p className={`text-xs font-medium mt-0.5 ${member.role === "owner" ? "text-violet-500" : "text-gray-400"}`}>
                          {member.role === "owner" ? "Owner" : "Member"}
                        </p>
                      </div>

                      {canRemove && (
                        <button
                          onClick={() => handleRemove(member.user_id)}
                          disabled={removing === member.user_id}
                          className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-xl text-gray-300 dark:text-gray-600 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors active:scale-90 disabled:opacity-40"
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
              <div className="pb-2" />
            </div>
          </div>

          {/* ── Account card ──────────────────────────────────────── */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm overflow-hidden">
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-5 py-4 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-50 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors active:opacity-60 text-left"
            >
              <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign out
            </button>
            {canLeave && (
              <button
                onClick={() => setConfirmLeave(true)}
                className="w-full flex items-center gap-3 px-5 py-4 text-sm text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 border-t border-gray-50 dark:border-zinc-800 transition-colors active:opacity-60 text-left"
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Leave {householdName}
              </button>
            )}
          </div>

          {/* ── Leave confirmation ────────────────────────────────── */}
          <AnimatePresence>
            {confirmLeave && (
              <motion.div
                key="confirm-leave"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.2 }}
                className="bg-red-50 border border-red-200 rounded-2xl p-4 flex flex-col gap-2"
              >
                <p className="text-sm font-semibold text-red-800 text-center">Leave {householdName}?</p>
                <p className="text-xs text-red-400 text-center mb-1">You&apos;ll need a new invite to rejoin.</p>
                <button
                  onClick={handleLeave}
                  className="w-full py-2.5 bg-red-500 text-white text-sm font-medium rounded-xl active:scale-[0.97] transition-all"
                >
                  Yes, leave
                </button>
                <button
                  onClick={() => setConfirmLeave(false)}
                  className="w-full py-2 text-sm text-gray-500 active:opacity-60"
                >
                  Cancel
                </button>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      )}
    </div>
  );
}
