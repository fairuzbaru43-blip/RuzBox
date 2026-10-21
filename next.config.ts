import type { NextConfig } from "next";

const transferOrigin = (() => {
  try { return process.env.NEXT_PUBLIC_TRANSFER_SERVICE_URL ? new URL(process.env.NEXT_PUBLIC_TRANSFER_SERVICE_URL).origin : ""; }
  catch { return ""; }
})();
const scriptSrc = process.env.NODE_ENV === "development"
  ? "'self' 'unsafe-inline' 'unsafe-eval'"
  : "'self' 'unsafe-inline'";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "Content-Security-Policy", value: `default-src 'self'; script-src ${scriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self' https://*.terabox.com https://*.supabase.co wss://*.supabase.co ${transferOrigin}; frame-src https://www.terabox.com ${transferOrigin}; object-src 'none'; base-uri 'self'; form-action 'self' https://www.terabox.com; frame-ancestors 'none'` },
      ],
    }];
  },
};

export default nextConfig;
