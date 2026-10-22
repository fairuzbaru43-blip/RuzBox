export function authErrorInIndonesian(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials")) return "Email atau kata sandi tidak sesuai.";
  if (normalized.includes("user already registered")) return "Email ini sudah terdaftar. Silakan masuk.";
  if (normalized.includes("email not confirmed")) return "Konfirmasi alamat email Anda sebelum masuk.";
  if (normalized.includes("password should be at least") || normalized.includes("password must be at least")) return "Kata sandi harus terdiri dari minimal 8 karakter.";
  if (normalized.includes("failed to fetch")) return "Tidak dapat terhubung ke Supabase. Periksa koneksi dan konfigurasi, lalu coba lagi.";
  return message;
}
