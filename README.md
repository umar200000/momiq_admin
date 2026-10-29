# Momiq admin panel

Backendni ishga tushiring va http://127.0.0.1:8080/admin/ ni oching.
Panel shu serverdan xizmat qilinadi; alohida npm install talab qilinmaydi.
Login: backend/data/admin-login.txt. Bu faylni Gitga yubormang.

## Clone from GitHub

Clone the repositories into sibling folders. Keep the admin folder named `momiq_admin_panel` because the backend serves assets from that path.

```sh
git clone https://github.com/umar200000/momiq_backend.git
git clone https://github.com/umar200000/momiq_admin.git momiq_admin_panel
cd momiq_backend
python server.py
```

Open http://127.0.0.1:8080/admin/ . Local credentials are generated on the first start.

## Deployment

Live admin: https://admin.momiq.net . Push to main runs JS checks and deploys the exact commit via GitHub Actions. Credentials are generated on the server in /var/lib/momiq/admin-login.txt (read via sudo); they are not committed. Backend operations and SSL instructions are in the backend DEPLOYMENT.md.

## Users and listings
Mijozlar and Enagalar filter durable role memberships; dual-role accounts appear in both. E’lonlar displays real server listings and owner profiles. Listing decisions require the current revision and a reason. Run `node --test test_admin.cjs` for navigation and listing rendering checks.


Chat reports: the Chat shikoyatlari section lists paginated incoming-message reports. Evidence and image access are explicit and audited; the operator sees only the reported message, not the entire conversation. A decision requires the loaded revision and a reason. Hide preserves original evidence while removing participant text/image access; dismiss leaves the message visible. Stale/parallel review cannot overwrite another decision. Schema24 separates support, moderation, finance and administrator access. The panel requests the server-owned operator identity before loading any private index; only granted sections appear. Run `node --test test_admin.cjs test_revision.cjs test_wallet.cjs test_chat.cjs`.


Booking details now open daily video reports with a date filter. Same-origin HttpOnly admin cookies authorize poster/playback requests; no token appears in URLs. Every access is audited by the server, and expired media has no player. This does not add generic upload, deletion, refund or status mutation. Full booking/care/video oversight is limited to administrators; MFA and real operator acceptance remain M092 release gates.


Named operators are provisioned using the backend `manage_operators.py` command from a trusted console with a current administrator password. Support handles private tickets; moderation handles listings/reviews/reported chat evidence; finance handles top-up decisions and corrections. Account profiles, disputes and commission/QR configuration remain administrator-only. Role changes and disable revoke old sessions, and every API route enforces the role independently of the visible menu. The backend DEPLOYMENT.md describes provisioning and audit. MFA is still unfinished; this is not a completed production access rollout. Run `node --test test_*.cjs` on shells that expand file globs, or pass the explicit file list on Windows.


Ko‘rsatkichlar loads only server-authorized aggregates. Finance sees wallet/receipt summaries; administrators also see booking, support and dispute counts and timing. The CSV link uses the HttpOnly cookie and a separate server authorization check, with fixed aggregate columns and no personal/evidence/message rows. Amounts use exact integer minor-unit strings/BigInt. A failed report offers retry, and late responses cannot overwrite another panel. Counts cover all recorded time/current statuses; open-ticket age and first-response mean are labelled explicitly. They are not provider transfer outcomes, a service-payment ledger, a fiscal statement or an SLA guarantee.
