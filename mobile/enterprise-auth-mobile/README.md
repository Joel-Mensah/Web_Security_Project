# 📱 Enterprise Auth Mobile

Cross-platform mobile app for the Enterprise Authentication & RBAC System, built with **React + Vite + Capacitor**. It reuses the exact same backend modules as the web frontend — no separate API is needed.

## 📁 Module structure

```
mobile/enterprise-auth-mobile/
├── src/
│   ├── main.tsx                 # App entry point
│   ├── App.tsx                  # Router + AuthProvider
│   ├── services/
│   │   ├── api.ts               # HTTP client → reuses backend routes
│   │   │                        #   (/auth/login, /auth/verify-2fa,
│   │                        #    /incidents, /users, ...)
│   │   └── supabase.ts          # Supabase client for local-first data
│   ├── hooks/
│   │   └── useAuth.tsx          # Auth state (login, logout, role, session)
│   ├── pages/
│   │   ├── LoginPage.tsx        # Sign-in screen
│   │   └── DashboardPage.tsx    # Incidents overview + role info
│   └── styles/
│       └── global.css           # Tailwind + shared UI classes
├── android/                     # Native Android project (Capacitor)
├── capacitor.config.json        # Capacitor configuration
├── vite.config.ts               # Vite build + /api dev proxy
├── tailwind.config.js
└── postcss.config.js
```

## 🔗 How it connects to the existing project

| Layer | Reuses |
|---|---|
| API | Same Express backend (`backend/`), endpoints under `/api/*` |
| Auth | Same JWT + Argon2id + TOTP/Email OTP flow |
| Database | Same Supabase PostgreSQL project |
| UI style | Same Tailwind + glass-card design language as `frontend/` |

**API base URL logic** (`src/services/api.ts`):
- **Web development**: Vite proxies `/api` → `http://localhost:5000` (see `vite.config.ts`)
- **Native builds**: set `VITE_API_URL` at build time to the absolute URL, e.g.
  `VITE_API_URL=https://<cloudfront-domain>.cloudfront.net/api npm run build`

## 🚀 Getting started

```powershell
# Install dependencies
npm install

# Run in the browser (proxied to the local backend)
npm run dev

# Production build (tsc + vite + tailwind)
npm run build
```

## 🤖 Build the Android app

Prerequisites: [Android Studio](https://developer.android.com/studio) with Android SDK.

```powershell
npm run build          # build web assets into dist/
npx cap sync android   # copy dist/ into the native project
npx cap open android   # open in Android Studio → Build APK / Run
```

`npm run cap:android` creates the platform from scratch (already done — the `android/` folder is committed).

For iOS (macOS only): `npx cap add ios && npx cap sync ios`.

## 📌 Notes

- The app ships with the same **security posture** as the web app: never embed AWS keys,
  Supabase service-role keys, or `SECRET_PEPPER` in the mobile bundle. Only public URLs
  and the Supabase anon key belong here.
- Update `src/services/supabase.ts` with your Supabase project URL and anon (publishable) key.
- The 2FA verification step (TOTP/Email OTP) uses the same backend endpoints as the web app;
  wire it into the login flow when you enable 2FA accounts.
