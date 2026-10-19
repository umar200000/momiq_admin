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
