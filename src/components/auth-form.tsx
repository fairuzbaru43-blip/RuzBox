"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LockKeyhole, Mail, Moon, ShieldCheck, Sun } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { RuzBoxMark } from "@/components/ruzbox-mark";

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const isRegister = mode === "register";

  useEffect(() => { const saved = localStorage.getItem("ruzbox-theme"); const selected = saved === "light" ? "light" : "dark"; setTheme(selected); document.documentElement.dataset.theme = selected; }, []);
  function toggleTheme() { const next = theme === "dark" ? "light" : "dark"; setTheme(next); document.documentElement.dataset.theme = next; localStorage.setItem("ruzbox-theme", next); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage("");
    const supabase = getSupabaseBrowser();
    if (!supabase) { setError("Supabase belum dikonfigurasi. Isi URL dan publishable key di file .env.local."); return; }
    setBusy(true);
    try {
      if (isRegister) {
        const { data, error: authError } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } });
        if (authError) throw authError;
        if (!data.session) setMessage("Akun dibuat. Buka tautan konfirmasi yang dikirim ke email Anda, lalu masuk ke RuzBox.");
        else router.push("/");
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
        router.push("/"); router.refresh();
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Autentikasi gagal."); }
    finally { setBusy(false); }
  }

  async function resetPassword() {
    setError(""); setMessage("");
    const supabase = getSupabaseBrowser();
    if (!supabase) { setError("Supabase belum dikonfigurasi."); return; }
    if (!email) { setError("Masukkan email Anda terlebih dahulu."); return; }
    setBusy(true);
    const { error: authError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback?next=%2Freset-password` });
    setBusy(false);
    if (authError) setError(authError.message); else setMessage("Tautan pemulihan dikirim jika email tersebut terdaftar.");
  }

  return <main className="app-bg relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-12">
    <div className="glow-orbit left-[calc(50%-300px)] top-[calc(50%-300px)] h-[600px] w-[600px]" />
    <div className="glow-orbit left-[calc(50%-220px)] top-[calc(50%-220px)] h-[440px] w-[440px] opacity-70" />
    <div className="absolute left-[8%] top-[22%] h-2 w-2 rounded-full bg-blue-400 shadow-[0_0_18px_5px_rgba(54,119,255,.55)]" />
    <div className="absolute bottom-[22%] right-[9%] h-1.5 w-1.5 rounded-full bg-fuchsia-400 shadow-[0_0_16px_5px_rgba(183,65,255,.65)]" />
    <button type="button" onClick={toggleTheme} aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} className="focus-ring absolute right-5 top-5 z-20 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-2.5 text-[var(--muted)] hover:text-[var(--text)]">{theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}</button>
    <section className="glass soft-shadow fade-up relative z-10 w-full max-w-[440px] rounded-[28px] p-7 sm:p-9">
      <div className="mb-8 flex justify-center"><RuzBoxMark /></div>
      <div className="mb-7 text-center"><h1 className="text-2xl font-semibold tracking-tight">{isRegister ? "Buat akun RuzBox" : "Selamat datang kembali"}</h1><p className="mt-2 text-sm text-[var(--muted)]">{isRegister ? "Mulai kelola file cloud Anda dengan aman." : "Masuk untuk melanjutkan ke workspace Anda."}</p></div>
      <form onSubmit={submit} className="space-y-4">
        <label className="relative block"><Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" /><input type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} placeholder="Email" className="auth-field h-12 w-full rounded-xl pl-11 pr-4 text-sm placeholder:text-[var(--subtle)]" /></label>
        <label className="relative block"><LockKeyhole className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" /><input type={showPassword ? "text" : "password"} autoComplete={isRegister ? "new-password" : "current-password"} required minLength={8} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} placeholder="Password (min. 8 karakter)" className="auth-field h-12 w-full rounded-xl pl-11 pr-12 text-sm placeholder:text-[var(--subtle)]" /><button type="button" aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"} onClick={() => setShowPassword(value => !value)} className="focus-ring absolute right-3 top-1/2 rounded-md p-1.5 text-[var(--muted)] hover:text-[var(--text)]">{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></label>
        {!isRegister && <div className="flex justify-end"><button type="button" disabled={busy} onClick={resetPassword} className="text-xs text-blue-400 hover:text-cyan-300">Lupa password?</button></div>}
        {error && <div role="alert" className="rounded-xl border border-rose-400/25 bg-rose-400/10 px-3.5 py-3 text-sm text-rose-300">{error}</div>}
        {message && <div role="status" className="rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-3.5 py-3 text-sm text-emerald-300">{message}</div>}
        <button disabled={busy} className="brand-glow focus-ring flex h-12 w-full items-center justify-center rounded-xl font-semibold text-white transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60">{busy ? "Memproses…" : isRegister ? "Buat akun" : "Masuk"}</button>
      </form>
      <div className="mt-6 text-center text-sm text-[var(--muted)]">{isRegister ? "Sudah punya akun?" : "Belum punya akun?"} <Link className="font-medium text-cyan-400 hover:text-cyan-300" href={isRegister ? "/login" : "/register"}>{isRegister ? "Masuk" : "Daftar"}</Link></div>
      <div className="mt-7 flex items-center justify-center gap-2 border-t border-[var(--line)] pt-5 text-[11px] text-[var(--subtle)]"><ShieldCheck size={14} /> Koneksi aman. Token TeraBox tersimpan terenkripsi.</div>
      <Link href="/" className="mt-5 block text-center text-xs text-[var(--subtle)] hover:text-[var(--muted)]">Kembali ke workspace</Link>
    </section>
  </main>;
}
