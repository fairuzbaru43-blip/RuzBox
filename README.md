# RuzBox — Your Files, Your Cloud

RuzBox is an independent file manager built with Next.js, TypeScript, Supabase Auth/PostgreSQL, and the official TeraBox Open Platform. It is not an official TeraBox or Supabase product.

## What works

- Email/password registration, login, email confirmation callback, password reset, and logout through Supabase Auth.
- One shared TeraBox account connected and disconnected only by the RuzBox administrator; its account ID is not exposed to users.
- Authenticated folder browsing and recursive folder search. Files are not displayed in the RuzBox interface.
- Administrator-only hide/restore controls that hide selected folders from every RuzBox user without deleting them from TeraBox.
- Supabase row-level security for user account data, encrypted shared TeraBox credentials, and activity history.
- Responsive folder list/grid views, light/dark theme, starred folders, and recently modified folders.

Folder creation is not implemented. The Indonesian TeraBox Open Platform documentation available during implementation does not describe a folder-creation endpoint. RuzBox will not guess an endpoint. File operations stay within the TeraBox-assigned RuzBox application folder.

The Vercel upload endpoint is intentionally capped at 4 MiB because serverless request bodies have a small limit. The included `transfer-service/` handles larger uploads and downloads when separately deployed to a Node host with streaming request support and enough temporary disk space. It uses 8 MiB parts and short-lived AES-GCM tickets; upload tickets are one-use, while download tickets can be reused for range requests until expiry. The service keeps tokens in memory only while handling a request.

## Requirements

- Node.js 20.9 or newer
- A Supabase project
- A TeraBox Open Platform app approved by TeraBox, including `client_id`, `client_secret`, `private_secret`, and its assigned application folder
- A 32-byte token-encryption key

TeraBox app credentials are external prerequisites. RuzBox cannot authorize a TeraBox account until TeraBox issues the app credentials and assigns the application namespace.

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Create a Supabase project and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the project's Connect panel or API Keys settings. Older projects may use `NEXT_PUBLIC_SUPABASE_ANON_KEY` instead. The app supports either key name; prefer the publishable key.
3. Run `supabase/migrations/001_initial_schema.sql`, `supabase/migrations/002_hidden_folders.sql`, and `supabase/migrations/003_shared_terabox.sql` in the Supabase SQL editor or through the Supabase CLI. Migration 003 does not import old per-user TeraBox connections; the RuzBox administrator must authorize the shared account once.
4. Register the intended admin account in RuzBox. In the Supabase SQL editor, promote only that account by replacing the email below and running:

   ```sql
   update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"ruzbox_role":"admin"}'::jsonb
   where lower(email) = lower('admin@example.com');
   ```

   Sign out and back in so the admin role is refreshed in the session. Admin status is read from trusted Supabase `app_metadata`; users cannot assign it to themselves. The administrator connects one shared TeraBox account, and authenticated RuzBox users browse its assigned folder. Admin-hidden folders disappear from the shared view for everyone.
5. Generate a token encryption key:

   ```sh
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```

6. Set the TeraBox client credentials and the exact `TERABOX_ROOT_PATH` assigned to the app. Set `NEXT_PUBLIC_TERABOX_CLIENT_ID` to the same app ID; the client ID is public, while the client and private secrets must remain server-only.
7. Set the Supabase secret key in `SUPABASE_SECRET_KEY` in local `.env.local` and the Vercel server environment. The legacy `SUPABASE_SERVICE_ROLE_KEY` is also accepted. Server routes use this key to access the encrypted shared connection and hidden-folder list. Never add a `NEXT_PUBLIC_` prefix or commit it.
8. For large-file uploads/downloads, deploy `transfer-service/` on a Node 20.9+ host. Copy `transfer-service/.env.example`, set `TRANSFER_SERVICE_SECRET` to the same random 32+ character value in the web app and worker, set worker `ALLOWED_ORIGIN` to the exact RuzBox origin (for local testing: `http://localhost:3000`), and set the web app's `NEXT_PUBLIC_TRANSFER_SERVICE_URL` to the worker's HTTPS origin. Keep the worker single-instance so its in-memory one-use upload-ticket guard is shared across requests. Locally, run `npm start` from `transfer-service/` after setting its environment variables.
9. Install packages and run the development server:

   ```sh
   npm install
   npm run dev
   ```

Open `http://localhost:3000`, register, confirm the email if Supabase email confirmation is enabled. Sign in with the configured RuzBox administrator account to connect or disconnect the one shared TeraBox account from Settings. Other authenticated users see folders from that shared drive; the account ID is not returned to the browser.

## Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser/server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser/server | Preferred public key; RLS is mandatory |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser/server | Legacy public key fallback for older projects; RLS is mandatory |
| `SUPABASE_SECRET_KEY` | Server only | Preferred elevated key for the shared encrypted TeraBox connection and hidden-folder list; never expose in browser |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Legacy fallback key for the same server-only access |
| `TERABOX_CLIENT_ID` | Server only | Approved TeraBox application ID |
| `NEXT_PUBLIC_TERABOX_CLIENT_ID` | Browser | App ID used to open TeraBox’s authorization page |
| `TERABOX_CLIENT_SECRET` | Server only | TeraBox app secret |
| `TERABOX_PRIVATE_SECRET` | Server only | TeraBox signing secret |
| `TERABOX_ROOT_PATH` | Server only | Exact application folder assigned by TeraBox |
| `TOKEN_ENCRYPTION_KEY` | Server only | Base64-encoded 32-byte AES-256-GCM key |
| `NEXT_PUBLIC_TRANSFER_SERVICE_URL` | Browser/server | Public HTTPS origin for the optional transfer worker |
| `TRANSFER_SERVICE_SECRET` | Server and worker | Shared secret (32+ characters) for short-lived encrypted upload tickets |

Never commit `.env.local`, service-role keys, or TeraBox credentials. The shared TeraBox access and refresh tokens are encrypted with AES-256-GCM before they are stored in a service-role-only Postgres table, and are only decrypted inside server routes or the transfer worker. Large-transfer tickets are AES-GCM encrypted, expire after three minutes, and contain a per-transfer nonce.

## Architecture

- `src/app/api/integrations/terabox/*`: authorization, status, and disconnect operations.
- `src/app/api/files/*`: authenticated folder-only listing and shared-drive operations.
- `src/app/api/admin/hidden-folders/route.ts`: admin-only hide/restore management; hidden folders disappear from the shared view for every user.
- `transfer-service/server.mjs`: optional streaming upload worker for large files; deploy separately from Vercel.
- `src/lib/terabox/client.ts`: admin-owned shared TeraBox OAuth connection, token rotation, domain validation, API requests, and metadata sync.
- `src/lib/crypto.ts`: authenticated encryption for token bundles.
- `src/lib/supabase/*`: Supabase SSR/browser clients.
- `supabase/migrations/001_initial_schema.sql`, `002_hidden_folders.sql`, and `003_shared_terabox.sql`: schema, indexes, RLS, and service-role-only shared connection storage.

TeraBox returns account-specific API domains from `/oauth/tokeninfo`; RuzBox validates and refreshes those domains every 50 minutes, within the docs' recommended one-hour cache window. Token refresh follows the documented single-use rotating refresh-token flow and stores the new token bundle after refresh.

## Deployment to Vercel

1. Push the `ruzbox` directory to a private Git repository or import it as the Vercel project root.
2. Add the environment variables above in Vercel Project Settings for each environment.
3. Set Supabase Auth's allowed redirect URLs to `https://<your-domain>/auth/callback` (and the local callback for development).
4. Apply both SQL migrations to the Supabase project. Promote the intended admin account through `app_metadata` as described in Local setup.
5. Deploy. Confirm registration, sign-in, TeraBox authorization, listing, and a small-file upload using an approved TeraBox app. Deploy the optional transfer service separately for files above 4 MiB.

## Checks

```sh
npm run typecheck
npm run build
```

Live TeraBox operations require approved credentials and an authorized account, so they cannot be validated until those are supplied.

## Verified TeraBox integration notes

The implementation is based on [TeraBox Open Platform integration docs (Indonesian)](https://www.terabox.com/integrations/docs/indonesian). The docs require an application to be registered separately, describe web authorization at `/wap/outside/login`, server-side exchange at `/oauth/gettoken`, domain discovery through `/oauth/tokeninfo`, and token refresh at `/oauth/refreshtoken`. They document listing, search, multipart upload, download, and rename/move/copy/delete operations. The docs state that API file operations use the app-specific namespace assigned by TeraBox.

The docs do not currently describe a folder-creation endpoint. That capability needs further official API confirmation.
