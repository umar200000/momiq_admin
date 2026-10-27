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
Mijozlar and Enagalar filter durable role memberships; dual-role accounts appear in both. E’lonlar displays real server listings and owner profiles. Listings are read-only here. Run `node --test test_admin.cjs` for navigation and listing rendering checks.


Chat reports: the Chat shikoyatlari section lists paginated incoming-message reports. Evidence and image access are explicit and audited; the operator sees only the reported message, not the entire conversation. A decision requires the loaded revision and a reason. Hide preserves original evidence while removing participant text/image access; dismiss leaves the message visible. Stale/parallel review cannot overwrite another decision. Current admin sessions still share existing administrator access; separate moderator/finance/support permissions remain a production gate. Run `node --test test_admin.cjs test_revision.cjs test_wallet.cjs test_chat.cjs`.
