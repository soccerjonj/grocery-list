"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useHouseholdContext } from "@/context/HouseholdContext";
import { useHouseholdMembers } from "@/hooks/useHouseholdMembers";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_COLOR, hexAlpha } from "@/lib/memberColors";
import ColorPicker from "@/components/ui/ColorPicker";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import StaplesManager from "@/components/recipes/StaplesManager";
import { useToast } from "@/context/ToastContext";
import { getErrorMessage } from "@/lib/utils";
import { renameHousehold, regenerateInviteCode, deleteHousehold } from "@/lib/householdAdmin";

// ─── Types ────────────────────────────────────────────────────────────────────

type Section = "household" | "staples" | "account";

// ─── Sidebar nav items ────────────────────────────────────────────────────────
// Profile + Preferences (theme) now live in the account hub (/settings);
// household settings is purely household-scoped.

const NAV_ITEMS: { id: Section; label: string; icon: React.ReactNode; description: string }[] = [
  {
    id: "household",
    label: "Household",
    description: "Members, invite link",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
      </svg>
    ),
  },
  {
    id: "staples",
    label: "Staples",
    description: "Always-have items, links",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 100-4 2 2 0 000 4zm0 0v8a2 2 0 002 2h10a2 2 0 002-2V8M9 12h6" />
      </svg>
    ),
  },
  {
    id: "account",
    label: "Account",
    description: "Sign out, leave household",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

// Your name + color, editable here in the household (as well as in the
// account hub) — it's the identity your household members see. Writes the
// global profile; keyed on the member row so it seeds once loaded.
function YourProfileCard({
  currentUserId,
  seedName,
  seedColor,
  takenColors,
}: {
  currentUserId: string | null;
  seedName: string;
  seedColor: string | null;
  takenColors: string[];
}) {
  const supabase = createClient();
  const { success, error: toastError } = useToast();
  const [name, setName] = useState(seedName);
  const [color, setColor] = useState<string | null>(seedColor);
  const [saving, setSaving] = useState(false);
  const changed = name.trim() !== seedName || color !== seedColor;

  async function save() {
    if (!currentUserId || !name.trim()) return;
    setSaving(true);
    try {
      await supabase.auth.updateUser({ data: { display_name: name.trim() } });
      const { error } = await supabase.from("profiles").update({ display_name: name.trim(), color }).eq("id", currentUserId);
      if (error) throw error;
      success("Profile saved");
    } catch (e) {
      toastError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm p-4 flex flex-col gap-3">
      <p className="text-xs font-medium text-gray-400 dark:text-gray-500">You in this household</p>
      <Input id="hh-display-name" label="Display name" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Your color</span>
        <ColorPicker value={color} onChange={setColor} takenColors={takenColors} />
      </div>
      <Button onClick={save} loading={saving} disabled={!changed} className="self-start">Save</Button>
    </div>
  );
}

function HouseholdSection({
  householdName,
  inviteCode,
  copied,
  members,
  currentUserId,
  currentUserRole,
  removing,
  regenerating,
  onCopyLink,
  onRemove,
  onRename,
  onRegenerate,
  onTransfer,
}: {
  householdName: string;
  inviteCode: string;
  copied: boolean;
  members: ReturnType<typeof useHouseholdMembers>["members"];
  currentUserId: string | null;
  currentUserRole: string | null;
  removing: string | null;
  regenerating: boolean;
  onCopyLink: () => void;
  onRemove: (id: string) => void;
  onRename: (name: string) => void;
  onRegenerate: () => void;
  onTransfer: (id: string, name: string) => void;
}) {
  const isOwner = currentUserRole === "owner";
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(householdName);
  useEffect(() => { if (!editingName) setNameDraft(householdName); }, [householdName, editingName]);

  const me = members.find((m) => m.user_id === currentUserId);
  const takenColors = members
    .filter((m) => m.user_id !== currentUserId && m.color)
    .map((m) => m.color!);

  function commitName() {
    setEditingName(false);
    onRename(nameDraft);
  }

  return (
    <div className="flex flex-col gap-5">
      {me && (
        <YourProfileCard
          key={me.user_id}
          currentUserId={currentUserId}
          seedName={me.display_name}
          seedColor={me.color ?? null}
          takenColors={takenColors}
        />
      )}

      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">Household</h2>
        {editingName ? (
          <div className="flex items-center gap-2 mt-1">
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") commitName(); if (e.key === "Escape") { setNameDraft(householdName); setEditingName(false); } }}
              className="flex-1 text-sm text-gray-900 dark:text-gray-50 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl px-3 py-2 outline-none focus:border-gray-400"
            />
            <button onClick={commitName} className="text-sm font-medium text-gray-900 dark:text-gray-50 px-2">Save</button>
          </div>
        ) : (
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-sm text-gray-400 dark:text-gray-500">{householdName}</p>
            {isOwner && (
              <button onClick={() => { setNameDraft(householdName); setEditingName(true); }} aria-label="Rename household" className="text-gray-300 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-300">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Invite */}
      <div className="bg-gray-50 dark:bg-zinc-800 rounded-2xl p-4 flex flex-col gap-3">
        <p className="text-xs font-medium text-gray-400 dark:text-gray-500">Invite someone</p>
        {inviteCode && (
          <div className="flex items-center justify-center bg-white dark:bg-zinc-700 border border-gray-200 dark:border-zinc-600 rounded-xl py-3">
            <span className="font-mono text-2xl tracking-[0.3em] font-bold text-gray-900 dark:text-gray-50 select-all">
              {inviteCode.toUpperCase()}
            </span>
          </div>
        )}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onCopyLink}
          disabled={!inviteCode}
          className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all ${
            copied
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
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
        {isOwner && (
          <button
            onClick={onRegenerate}
            disabled={regenerating}
            className="text-xs font-medium text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors self-center disabled:opacity-50"
          >
            {regenerating ? "Regenerating…" : "Regenerate code"}
          </button>
        )}
      </div>

      {/* Members */}
      <div>
        <p className="text-xs font-medium text-gray-400 dark:text-gray-500 mb-2">Members</p>
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 overflow-hidden">
          <AnimatePresence initial={false}>
            {members.map((member, index) => {
              const isMe = member.user_id === currentUserId;
              const canRemove = isOwner && !isMe;
              const displayColor = member.color ?? DEFAULT_COLOR;

              return (
                <motion.div
                  key={member.user_id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className={`flex items-center gap-3 px-4 py-3 ${index > 0 ? "border-t border-gray-50 dark:border-zinc-800" : ""}`}
                >
                  <motion.div
                    animate={{ backgroundColor: hexAlpha(displayColor, 0.15) }}
                    transition={{ duration: 0.2 }}
                    className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0"
                    style={{ color: displayColor }}
                  >
                    {member.initials}
                  </motion.div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-50 truncate">
                        {member.display_name}
                      </p>
                      {isMe && <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium flex-shrink-0">(you)</span>}
                    </div>
                    <p className={`text-xs font-medium mt-0.5 ${member.role === "owner" ? "text-violet-500" : "text-gray-400"}`}>
                      {member.role === "owner" ? "Owner" : "Member"}
                    </p>
                  </div>
                  {canRemove && (
                    <button
                      onClick={() => onTransfer(member.user_id, member.display_name)}
                      className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-xl text-gray-300 dark:text-gray-600 hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/30 transition-colors active:scale-90"
                      aria-label={`Make ${member.display_name} the owner`}
                      title="Make owner"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 5l3.5 4L12 4l3.5 5L19 5l-1.5 12h-11L5 5z" />
                      </svg>
                    </button>
                  )}
                  {canRemove && (
                    <button
                      onClick={() => onRemove(member.user_id)}
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
        </div>
      </div>
    </div>
  );
}

function AccountSection({
  householdName,
  canLeave,
  isOwner,
  confirmLeave,
  setConfirmLeave,
  onSignOut,
  onLeave,
  onDeleteHousehold,
}: {
  householdName: string;
  canLeave: boolean;
  isOwner: boolean;
  confirmLeave: boolean;
  setConfirmLeave: (v: boolean) => void;
  onSignOut: () => void;
  onLeave: () => void;
  onDeleteHousehold: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">Account</h2>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">Your profile, appearance, and password live in Account settings.</p>
      </div>

      <Link
        href="/settings"
        className="flex items-center justify-between bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 px-4 py-4 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors active:opacity-60"
      >
        <span className="flex items-center gap-3">
          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0" />
          </svg>
          Account settings
        </span>
        <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
      </Link>

      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 overflow-hidden">
        <button
          onClick={onSignOut}
          className="w-full flex items-center gap-3 px-4 py-4 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-50 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors active:opacity-60 text-left"
        >
          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sign out
        </button>

        {canLeave && (
          <button
            onClick={() => setConfirmLeave(true)}
            className="w-full flex items-center gap-3 px-4 py-4 text-sm text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 border-t border-gray-50 dark:border-zinc-800 transition-colors active:opacity-60 text-left"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
            </svg>
            Leave {householdName}
          </button>
        )}

        {isOwner && (
          <button
            onClick={onDeleteHousehold}
            className="w-full flex items-center gap-3 px-4 py-4 text-sm text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 border-t border-gray-50 dark:border-zinc-800 transition-colors active:opacity-60 text-left"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete household
          </button>
        )}
      </div>

      <AnimatePresence>
        {confirmLeave && (
          <motion.div
            key="confirm-leave"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
            className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-2xl p-4 flex flex-col gap-2"
          >
            <p className="text-sm font-semibold text-red-800 dark:text-red-200 text-center">Leave {householdName}?</p>
            <p className="text-xs text-red-400 dark:text-red-500 text-center mb-1">You&apos;ll need a new invite to rejoin.</p>
            <button
              onClick={onLeave}
              className="w-full py-2.5 bg-red-500 text-white text-sm font-medium rounded-xl active:scale-[0.97] transition-all"
            >
              Yes, leave
            </button>
            <button
              onClick={() => setConfirmLeave(false)}
              className="w-full py-2 text-sm text-gray-500 dark:text-gray-400 active:opacity-60"
            >
              Cancel
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { householdId, householdName } = useHouseholdContext();
  const { members, currentUserId, currentUserRole, loading, removeMember, transferOwnership, leave } =
    useHouseholdMembers(householdId);
  const { success, error: toastError } = useToast();

  // Section nav — null means "show list" on mobile; defaults to "household" on desktop
  const [activeSection, setActiveSection] = useState<Section | null>(null);

  // Household state
  const [inviteCode, setInviteCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  // Account state
  const [confirmLeave, setConfirmLeave] = useState(false);

  // Owner controls (migration 026 RPCs)
  const [hhName, setHhName] = useState(householdName);
  const [regenerating, setRegenerating] = useState(false);
  const [transferTarget, setTransferTarget] = useState<{ id: string; name: string } | null>(null);
  const [confirmDeleteHh, setConfirmDeleteHh] = useState(false);

  const supabase = createClient();
  const isOwner = currentUserRole === "owner";
  const ownerCount = members.filter((m) => m.role === "owner").length;
  const canLeave = !isOwner || ownerCount > 1;

  useEffect(() => {
    supabase
      .from("households")
      .select("invite_code")
      .eq("id", householdId)
      .single()
      .then(({ data }) => { if (data) setInviteCode(data.invite_code); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId]);

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
    try {
      await leave();
      window.location.href = "/dashboard";
    } catch (err) {
      console.error("leave household failed:", err);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/auth/login";
  }

  async function handleRename(name: string) {
    const trimmed = name.trim();
    if (!trimmed || trimmed === hhName) return;
    try {
      await renameHousehold(householdId, trimmed);
      setHhName(trimmed);
      success("Household renamed");
    } catch (err) {
      toastError(getErrorMessage(err));
    }
  }

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      const code = await regenerateInviteCode(householdId);
      setInviteCode(code);
      success("New invite code — old links stopped working");
    } catch (err) {
      toastError(getErrorMessage(err));
    } finally {
      setRegenerating(false);
    }
  }

  async function handleTransfer() {
    if (!transferTarget) return;
    try {
      await transferOwnership(transferTarget.id);
      success(`${transferTarget.name} is now the owner`);
    } catch (err) {
      toastError(getErrorMessage(err));
    } finally {
      setTransferTarget(null);
    }
  }

  async function handleDeleteHousehold() {
    try {
      await deleteHousehold(householdId);
      window.location.href = "/dashboard";
    } catch (err) {
      toastError(getErrorMessage(err));
    }
  }

  // Render active section content
  const displaySection = activeSection ?? "household";

  function renderContent(section: Section) {
    if (loading) {
      return (
        <div className="flex flex-col gap-4">
          {[100, 180, 140].map((h, i) => (
            <div key={i} className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 animate-pulse" style={{ height: h }} />
          ))}
        </div>
      );
    }
    switch (section) {
      case "household":
        return (
          <HouseholdSection
            householdName={hhName}
            inviteCode={inviteCode}
            copied={copied}
            members={members}
            currentUserId={currentUserId}
            currentUserRole={currentUserRole}
            removing={removing}
            regenerating={regenerating}
            onCopyLink={handleCopyLink}
            onRemove={handleRemove}
            onRename={handleRename}
            onRegenerate={handleRegenerate}
            onTransfer={(id, name) => setTransferTarget({ id, name })}
          />
        );
      case "staples":
        return <StaplesManager />;
      case "account":
        return (
          <AccountSection
            householdName={hhName}
            canLeave={canLeave}
            isOwner={isOwner}
            confirmLeave={confirmLeave}
            setConfirmLeave={setConfirmLeave}
            onSignOut={handleSignOut}
            onLeave={handleLeave}
            onDeleteHousehold={() => setConfirmDeleteHh(true)}
          />
        );
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-24">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        {/* Mobile: back to list when in a section; otherwise back to pantry */}
        <button
          type="button"
          onClick={() => {
            if (activeSection !== null) {
              setActiveSection(null);
            } else {
              window.history.back();
            }
          }}
          className="sm:hidden w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-900 dark:hover:text-gray-50 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors active:opacity-60 flex-shrink-0"
          aria-label="Back"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <Link
          href={`/household/${householdId}/pantry`}
          className="hidden sm:flex w-9 h-9 items-center justify-center rounded-xl text-gray-400 hover:text-gray-900 dark:hover:text-gray-50 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors active:opacity-60 flex-shrink-0"
          aria-label="Back"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <p className="text-xs text-gray-400 dark:text-gray-500 font-medium">{hhName}</p>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">
            {activeSection !== null
              ? NAV_ITEMS.find((n) => n.id === activeSection)?.label ?? "Settings"
              : "Settings"}
          </h1>
        </div>
      </div>

      {/* Layout: mobile = stacked list/detail, desktop = sidebar + content */}
      <div className="sm:grid sm:grid-cols-[200px_1fr] sm:gap-6 sm:items-start">

        {/* ── Sidebar nav ── */}
        <nav
          className={`flex flex-col gap-1 sm:block ${
            activeSection !== null ? "hidden" : "block"
          }`}
        >
          {/* Mobile section list */}
          <div className="sm:hidden flex flex-col gap-1.5">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveSection(item.id)}
                className="flex items-center gap-3 px-4 py-3.5 bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 text-left transition-colors active:scale-[0.98] active:opacity-80"
              >
                <span className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-zinc-800 flex items-center justify-center text-gray-500 dark:text-gray-400 flex-shrink-0">
                  {item.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-50">{item.label}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{item.description}</p>
                </div>
                <svg className="w-4 h-4 text-gray-300 dark:text-zinc-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ))}
          </div>

          {/* Desktop sidebar */}
          <div className="hidden sm:flex sm:flex-col sm:gap-1">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveSection(item.id)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-left transition-all w-full ${
                  displaySection === item.id
                    ? "bg-gray-100 dark:bg-zinc-800 text-gray-900 dark:text-gray-50"
                    : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-800/60 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
              >
                <span className={`flex-shrink-0 transition-colors ${
                  displaySection === item.id ? "text-gray-700 dark:text-gray-200" : "text-gray-400 dark:text-gray-500"
                }`}>
                  {item.icon}
                </span>
                {item.label}
              </button>
            ))}
          </div>
        </nav>

        {/* ── Content panel ── */}
        {/* Mobile: visible only when a section is selected */}
        {/* Desktop: always visible */}
        <div className={`${activeSection === null ? "hidden sm:block" : "block"}`}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={displaySection}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              {renderContent(displaySection)}
            </motion.div>
          </AnimatePresence>
        </div>

      </div>

      <ConfirmDialog
        open={!!transferTarget}
        onClose={() => setTransferTarget(null)}
        title="Make owner?"
        confirmLabel="Transfer ownership"
        requireTyped={hhName}
        body={<>Ownership of <span className="font-semibold">{hhName}</span> moves to {transferTarget?.name}, and you become a regular member. Type the household name to confirm.</>}
        onConfirm={handleTransfer}
      />

      <ConfirmDialog
        open={confirmDeleteHh}
        onClose={() => setConfirmDeleteHh(false)}
        title="Delete this household?"
        danger
        confirmLabel="Delete household"
        requireTyped={hhName}
        body={<>This permanently deletes <span className="font-semibold">{hhName}</span> and all of its pantry, shopping lists, and recipes for everyone in it. This can&apos;t be undone. Type the household name to confirm.</>}
        onConfirm={handleDeleteHousehold}
      />
    </div>
  );
}
