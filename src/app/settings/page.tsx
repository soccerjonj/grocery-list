"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTheme } from "next-themes";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import ColorPicker from "@/components/ui/ColorPicker";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useToast } from "@/context/ToastContext";
import { getErrorMessage } from "@/lib/utils";
import { exportMyData } from "@/lib/exportData";
import { householdsBlockingAccountDeletion, type BlockingHousehold } from "@/lib/householdAdmin";
import { APP_VERSION, FEEDBACK_EMAIL } from "@/lib/appVersion";

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm p-5 flex flex-col gap-4">
      <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">{label}</h2>
      {children}
    </div>
  );
}

export default function AccountSettingsPage() {
  const router = useRouter();
  const supabase = createClient();
  const { success, error: toastError } = useToast();
  const { theme, setTheme } = useTheme();

  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [email, setEmail] = useState<string>("");

  const [displayName, setDisplayName] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [initialName, setInitialName] = useState("");
  const [initialColor, setInitialColor] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState("");

  const [exporting, setExporting] = useState(false);

  const [del1, setDel1] = useState(false);
  const [del2, setDel2] = useState(false);
  const [blocking, setBlocking] = useState<BlockingHousehold[] | null>(null);
  const [blockingOpen, setBlockingOpen] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.replace("/auth/login"); return; }
      setEmail(user.email ?? "");
      const { data: profile } = await supabase
        .from("profiles").select("display_name, color").eq("id", user.id).maybeSingle();
      const name = profile?.display_name || user.user_metadata?.display_name || "";
      setDisplayName(name); setInitialName(name);
      setColor(profile?.color ?? null); setInitialColor(profile?.color ?? null);
      setLoading(false);
    });
  }, [supabase, router]);

  const profileChanged = displayName.trim() !== initialName || color !== initialColor;

  async function saveProfile() {
    const name = displayName.trim();
    if (!name) { toastError("Enter a name"); return; }
    setSavingProfile(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      await supabase.auth.updateUser({ data: { display_name: name } });
      const { error } = await supabase.from("profiles").update({ display_name: name, color }).eq("id", user.id);
      if (error) throw error;
      setInitialName(name); setInitialColor(color);
      success("Profile saved");
    } catch (err) {
      toastError(getErrorMessage(err));
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError("");
    if (newPw.length < 8) { setPwError("New password must be at least 8 characters"); return; }
    setPwBusy(true);
    try {
      // Re-verify the current password before allowing the change.
      const { error: reauth } = await supabase.auth.signInWithPassword({ email, password: curPw });
      if (reauth) { setPwError("Current password is incorrect"); return; }
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) throw error;
      setCurPw(""); setNewPw("");
      success("Password changed");
    } catch (err) {
      setPwError(getErrorMessage(err));
    } finally {
      setPwBusy(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try { await exportMyData(); success("Export downloaded"); }
    catch (err) { toastError(getErrorMessage(err)); }
    finally { setExporting(false); }
  }

  async function startDelete() {
    try {
      const blockers = await householdsBlockingAccountDeletion();
      if (blockers.length > 0) { setBlocking(blockers); setBlockingOpen(true); return; }
      setDel1(true);
    } catch (err) {
      toastError(getErrorMessage(err));
    }
  }

  async function confirmDelete() {
    const res = await fetch("/api/account/delete", { method: "POST" });
    if (res.status === 409) {
      const body = await res.json();
      setDel2(false);
      setBlocking(body.blocking ?? []); setBlockingOpen(true);
      return;
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toastError(body.error || "Couldn't delete account");
      return;
    }
    await supabase.auth.signOut();
    window.location.href = "/auth/login";
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/auth/login";
  }

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-gray-50 dark:bg-zinc-950">
        <div className="w-5 h-5 border-2 border-gray-300 dark:border-zinc-700 border-t-gray-900 dark:border-t-zinc-300 rounded-full animate-spin" />
      </div>
    );
  }

  const themes: { id: string; label: string }[] = [
    { id: "system", label: "System" }, { id: "light", label: "Light" }, { id: "dark", label: "Dark" },
  ];

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-zinc-950">
      <div className="max-w-lg mx-auto px-4 pt-6 pb-24 flex flex-col gap-4">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={() => router.back()} aria-label="Back" className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors text-gray-500 dark:text-gray-400">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">Account</h1>
        </div>

        <Card label="Profile">
          <Input id="display-name" label="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Your color</span>
            <ColorPicker value={color} onChange={setColor} />
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 -mt-1">{email}</p>
          <Button onClick={saveProfile} loading={savingProfile} disabled={!profileChanged} className="self-start">Save profile</Button>
        </Card>

        <Card label="Appearance">
          <div className="flex gap-1 p-1 rounded-xl bg-gray-100 dark:bg-zinc-800">
            {themes.map((t) => {
              const active = mounted && theme === t.id;
              return (
                <button key={t.id} type="button" onClick={() => setTheme(t.id)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${active ? "bg-white dark:bg-zinc-900 text-gray-900 dark:text-gray-50 shadow-sm" : "text-gray-500 dark:text-gray-400"}`}>
                  {t.label}
                </button>
              );
            })}
          </div>
        </Card>

        <Card label="Security">
          <form onSubmit={changePassword} className="flex flex-col gap-3">
            <Input id="cur-pw" label="Current password" type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} autoComplete="current-password" />
            <Input id="new-pw" label="New password" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" />
            {pwError && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded-lg">{pwError}</p>}
            <Button type="submit" loading={pwBusy} disabled={!curPw || !newPw} className="self-start">Change password</Button>
          </form>
        </Card>

        <Card label="Privacy and data">
          <button onClick={handleExport} disabled={exporting} className="flex items-center justify-between text-left text-sm text-gray-700 dark:text-gray-200 active:opacity-60">
            <span className="flex items-center gap-2"><svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" /></svg>{exporting ? "Preparing…" : "Download my data"}</span>
          </button>
          <div className="flex flex-col divide-y divide-gray-50 dark:divide-zinc-800 -mb-1">
            <Link href="/privacy" className="flex items-center justify-between py-2.5 text-sm text-gray-700 dark:text-gray-200 active:opacity-60">Privacy policy <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg></Link>
            <Link href="/terms" className="flex items-center justify-between py-2.5 text-sm text-gray-700 dark:text-gray-200 active:opacity-60">Terms of service <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg></Link>
            <a href={`mailto:${FEEDBACK_EMAIL}`} className="flex items-center justify-between py-2.5 text-sm text-gray-700 dark:text-gray-200 active:opacity-60">Send feedback <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l9 6 9-6M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg></a>
            <div className="flex items-center justify-between py-2.5 text-sm text-gray-400 dark:text-gray-500">Version <span className="tabular-nums">{APP_VERSION}</span></div>
          </div>
        </Card>

        <button onClick={handleSignOut} className="text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-50 py-2 self-center transition-colors">Sign out</button>

        <Card label="Danger zone">
          <p className="text-xs text-gray-400 dark:text-gray-500 -mt-1">Permanently delete your account, profile, and household memberships. This can&apos;t be undone.</p>
          <button onClick={startDelete} className="self-start text-sm font-medium text-red-500 hover:text-red-600 transition-colors">Delete account</button>
        </Card>
      </div>

      <ConfirmDialog
        open={del1} onClose={() => setDel1(false)}
        title="Delete your account?" danger confirmLabel="Continue"
        body={<>This permanently removes your profile, your household memberships, and any household you&apos;re the only member of. Shared households you belong to stay for their other members. You&apos;ll confirm once more on the next step.</>}
        onConfirm={() => { setDel1(false); setDel2(true); }}
      />

      <ConfirmDialog
        open={del2} onClose={() => setDel2(false)}
        title="This is permanent" danger confirmLabel="Delete account" requireTyped="DELETE"
        body={<>There&apos;s no undo. Type <span className="font-semibold">DELETE</span> to confirm you want to permanently delete your account.</>}
        onConfirm={confirmDelete}
      />

      <ConfirmDialog
        open={blockingOpen} onClose={() => setBlockingOpen(false)}
        title="Transfer or delete these first" confirmLabel="Got it" cancelLabel="Close"
        body={
          <div className="flex flex-col gap-2">
            <span>You&apos;re the only owner of {blocking?.length === 1 ? "a household" : "these households"} with other members. Hand ownership to someone else, or delete the household, before deleting your account.</span>
            <ul className="flex flex-col gap-1 mt-1">
              {(blocking ?? []).map((h) => (
                <li key={h.id}>
                  <Link href={`/household/${h.id}/settings`} className="text-sm font-medium text-gray-900 dark:text-gray-50 underline underline-offset-2">{h.name}</Link>
                </li>
              ))}
            </ul>
          </div>
        }
        onConfirm={() => setBlockingOpen(false)}
      />
    </div>
  );
}
