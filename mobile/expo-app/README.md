# Enterprise Auth — Expo app (Expo Go for Android)

This is a **new Expo app** alongside the existing Capacitor app in
`mobile/enterprise-auth-mobile`. It uses the **same Express backend** and the
same auth flow as the web frontend:

credentials -> QR setup (first time) | TOTP (primary) | Email OTP (backup) ->
dashboard + incident reports.

## 1. Start the backend (on your PC)

```powershell
cd backend
npm install
npm run dev
```

The API listens on `http://localhost:5000` (see `backend/.env` `PORT`).

## 2. Install + start the Expo app

```powershell
cd mobile/expo-app
npm install
npx expo start
```

Scan the QR code with **Expo Go on your Android phone**.

## 3. Same Wi-Fi is required

Expo Go cannot reach `localhost`. The app defaults to:

```text
http://10.96.5.84:5000/api
```

That is your PC LAN IP from `ipconfig` (Wi-Fi adapter). Phone + PC must be on
the same Wi-Fi network.

If your IP changes, either update `src/api/client.js` or set:

```powershell
$env:EXPO_PUBLIC_API_URL = "http://YOUR_PC_LAN_IP:5000/api"
npx expo start -c
```

## 4. Windows Firewall

If the phone cannot reach the backend, allow Node through the firewall or open
TCP port 5000 for private networks.

## Screens

- `/login` — username/password, QR setup, TOTP, email OTP fallback, recovery
- `/(tabs)/dashboard` — summary counts + 5 most recent reports
- `/(tabs)/incidents` — search + status/severity filters + detail links
- `/(tabs)/report` — create an incident report (title 5+, description 20+)
- `/incident/[id]` — full report, timeline, public/private follow-ups
- `/(tabs)/account` — profile, role, MFA state, sign out

Tokens are stored with `expo-secure-store` (same JWT scheme as the web app).
