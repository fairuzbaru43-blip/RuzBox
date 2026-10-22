"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { authErrorInIndonesian } from "@/lib/auth-error";
import { RuzBoxMark } from "@/components/ruzbox-mark";

export default function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => { const selected = localStorage.getItem("ruzbox-theme") === "light" ? "light" : "dark"; setTheme(selected); document.documentElement.dataset.theme = selected; }, []);
  function toggleTheme() { const next = theme === "dark" ? "light" : "dark"; setTheme(next); document.documentElement.dataset.theme = next; localStorage.setItem("ruzbox-theme", next); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const supabase = getSupabaseBrowser();
    if (!supabase) { setError("Supabase belum dikonfigurasi."); setBusy(false); return; }
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) setError(authErrorInIndonesian(updateError.message));
    else { setMessage("Kata sandi berhasil diperbarui."); window.setTimeout(() => router.push("/login"), 1200); }
  }
  return <main className="app-bg relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-12"><div className="glow-orbit left-[calc(50%-300px)] top-[calc(50%-300px)] h-[600px] w-[600px]" /><button type="button" onClick={toggleTheme} aria-label="Ganti tema" className="focus-ring absolute right-5 top-5 z-20 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--muted)]">{theme === "dark" ? "Tema terang" : "Tema gelap"}</button><section className="glass soft-shadow fade-up relative z-10 w-full max-w-[440px] rounded-[28px] p-7 sm:p-9"><div className="mb-8 flex justify-center"><RuzBoxMark /></div><h1 className="text-center text-2xl font-semibold">Atur kata sandi baru</h1><p className="mb-6 mt-2 text-center text-sm text-[var(--muted)]">Buat kata sandi baru untuk akun RuzBox Anda.</p><form onSubmit={submit} className="space-y-4"><input type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} placeholder="Kata sandi baru (min. 8 karakter)" className="auth-field h-12 w-full rounded-xl px-4 text-sm placeholder:text-[var(--subtle)]" />{error && <p role="alert" className="rounded-xl border border-rose-400/25 bg-rose-400/10 px-3.5 py-3 text-sm text-rose-300">{error}</p>}{message && <p role="status" className="rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-3.5 py-3 text-sm text-emerald-300">{message}</p>}<button disabled={busy} className="brand-glow focus-ring flex h-12 w-full items-center justify-center rounded-xl font-semibold text-white disabled:opacity-60">{busy ? "Menyimpan..." : "Perbarui kata sandi"}</button></form><Link href="/login" className="mt-6 block text-center text-xs text-[var(--muted)] hover:text-[var(--text)]">Kembali ke halaman masuk</Link></section></main>;
}
