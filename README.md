# FormPilot AI 🤖

> **AI-Powered Chrome Extension** that auto-detects forms on any website, extracts all fields, generates smart answers using Gemini AI, and fills them instantly — using your profile data.

[![Node.js](https://img.shields.io/badge/Node.js-18+-green)](https://nodejs.org)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-green)](https://mongodb.com/atlas)
[![Gemini AI](https://img.shields.io/badge/Gemini-2.0%20Flash-blue)](https://ai.google.dev)
[![MV3](https://img.shields.io/badge/Manifest-V3-orange)](https://developer.chrome.com/docs/extensions/mv3/)

---

## ✨ Features

| Feature | Description |
|---|---|
| 🔍 **Auto Form Detection** | Detects forms on any website using role/aria selectors + MutationObserver |
| 🤖 **AI Fill (Gemini)** | Generates accurate answers using Gemini 2.0 Flash |
| 👤 **Multiple Profiles** | Create, edit, duplicate, export/import JSON profiles |
| 📋 **All Field Types** | Text, Email, Phone, Radio, Checkbox, Dropdown, Date, Textarea |
| 📜 **Form History** | Searchable history of all filled forms with status |
| 📊 **Analytics Dashboard** | Success rate, AI usage, monthly stats |
| 🔐 **JWT + Refresh Tokens** | Secure auth with auto token rotation |
| 🌙 **Dark / Light Mode** | Instant theme toggle, persisted preference |
| 📱 **Job App Assistant** | Specialized AI for job/internship applications |
| 🎓 **Scholarship Assistant** | Tailored for scholarship form filling |

---

## 🏗️ Architecture

```
FormPilot AI
├── extension/              # Chrome Extension (MV3)
│   ├── manifest.json
│   ├── background/
│   │   └── background.js   # Service Worker
│   ├── content/
│   │   └── content.js      # Form detection & filling engine
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.css
│   │   └── popup.js
│   └── utils/
│       ├── config.js       # Environment-based URL config
│       ├── storage.js      # Secure chrome.storage wrapper
│       └── api.js          # API client with auto token refresh
│
└── backend/                # Node.js + Express API
    ├── server.js
    ├── app.js
    ├── config/
    │   └── database.js
    ├── controllers/
    │   ├── authController.js
    │   ├── profileController.js
    │   ├── aiController.js
    │   └── formHistoryController.js
    ├── middleware/
    │   ├── auth.js          # JWT protect + authorize
    │   ├── rateLimiter.js
    │   └── validate.js
    ├── models/
    │   ├── User.js
    │   ├── Profile.js
    │   ├── FormHistory.js
    │   └── UsageLog.js
    ├── routes/
    │   ├── auth.routes.js
    │   ├── profile.routes.js
    │   ├── ai.routes.js
    │   └── forms.routes.js
    ├── services/
    │   ├── geminiService.js  # Gemini AI integration
    │   └── tokenService.js   # JWT + Refresh token management
    └── utils/
        ├── logger.js
        └── apiResponse.js
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- MongoDB Atlas account (free tier works)
- Google AI Studio API key (Gemini)
- Chrome browser

---

## 📦 Backend Setup

### 1. Install dependencies
```bash
cd backend
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
```

Edit `.env`:
```env
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/formpilot
JWT_SECRET=your_super_secret_key_min_32_chars
JWT_REFRESH_SECRET=your_refresh_secret_min_32_chars
GEMINI_API_KEY=your_gemini_api_key
ALLOWED_ORIGINS=http://localhost:3000,chrome-extension://YOUR_EXTENSION_ID
```

### 3. Start development server
```bash
npm run dev
```

Backend will start at `http://localhost:5000`

### 4. Verify health
```
GET http://localhost:5000/health
```

---

## 🔧 Chrome Extension Setup

### 1. Open Chrome Extensions
Go to: `chrome://extensions/`

### 2. Enable Developer Mode
Toggle "Developer mode" in the top right corner.

### 3. Load the extension
- Click "Load unpacked"
- Select the `extension/` folder from this project

### 4. Configure backend URL (Development)
The extension defaults to the **production** Render URL.

For local development:
- Open the extension popup
- The extension will use `http://localhost:5000` when you set the environment

OR directly in `extension/utils/config.js`:
```js
API_URLS: {
  development: 'http://localhost:5000',
  production: 'https://your-render-app.onrender.com',
}
```

Then in Chrome console (background service worker):
```js
chrome.storage.local.set({ 'fp_env': 'development' })
```

---

## ☁️ Deployment

### Backend → Render.com (No Docker Required)

1. Create account at [render.com](https://render.com)
2. New → Web Service → Connect GitHub repo
3. Settings:
   - **Build Command:** `cd backend && npm install`
   - **Start Command:** `cd backend && node server.js`
   - **Node Version:** 18
4. Add Environment Variables (copy from `.env.example`)
5. Deploy!

### Backend → Railway

1. Connect GitHub at [railway.app](https://railway.app)
2. Select repo → Railway auto-detects Node.js
3. Set root directory to `backend/`
4. Add env vars in Railway dashboard
5. Deploy!

### Database → MongoDB Atlas

1. Create free cluster at [mongodb.com/atlas](https://mongodb.com/atlas)
2. Create database user with read/write permissions
3. Whitelist IP `0.0.0.0/0` (or specific Render/Railway IPs)
4. Copy connection string → set as `MONGODB_URI`

---

## 🔌 API Reference

### Authentication
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | None | Register new user |
| POST | `/api/auth/login` | None | Login, get tokens |
| POST | `/api/auth/refresh` | Cookie/Body | Refresh access token |
| POST | `/api/auth/logout` | Bearer | Logout, revoke token |
| GET | `/api/auth/me` | Bearer | Get current user |
| PUT | `/api/auth/me` | Bearer | Update profile |
| PUT | `/api/auth/change-password` | Bearer | Change password |

### Profiles
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/profiles` | List all profiles |
| POST | `/api/profiles` | Create profile |
| GET | `/api/profiles/:id` | Get profile |
| PUT | `/api/profiles/:id` | Update profile |
| DELETE | `/api/profiles/:id` | Delete profile |
| POST | `/api/profiles/:id/duplicate` | Duplicate profile |
| PUT | `/api/profiles/:id/set-default` | Set as default |
| GET | `/api/profiles/:id/export` | Export as JSON |
| POST | `/api/profiles/import` | Import from JSON |

### AI
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ai/generate-answers` | Generate form answers |
| POST | `/api/ai/parse-resume` | Parse resume text |
| POST | `/api/ai/map-fields` | Map fields to profile |
| GET | `/api/ai/usage` | Get AI quota usage |

### Form History
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/forms/history` | List history (paginated) |
| POST | `/api/forms/history` | Save form fill |
| GET | `/api/forms/history/:id` | Get form detail |
| DELETE | `/api/forms/history/:id` | Delete entry |
| DELETE | `/api/forms/history` | Clear all history |
| GET | `/api/forms/analytics` | Get usage analytics |

---

## 🔐 Security Implemented

- ✅ JWT Access Tokens (7 day expiry)
- ✅ Refresh Tokens (30 day, httpOnly cookie + DB hash)
- ✅ bcrypt password hashing (12 rounds)
- ✅ Account lockout (5 failed attempts → 2hr lock)
- ✅ Helmet.js security headers
- ✅ CORS origin whitelist (allows chrome-extension://)
- ✅ MongoDB input sanitization (express-mongo-sanitize)
- ✅ Rate limiting (100/15min general, 20/15min auth, 10/min AI)
- ✅ Express validator input validation
- ✅ No API keys in extension code
- ✅ Token expiry auto-detected from JWT payload
- ✅ Automatic token refresh before expiry

---

## 🛒 Chrome Web Store Checklist

- [ ] Extension ID obtained from Chrome Extensions page
- [ ] Add Extension ID to `ALLOWED_ORIGINS` in backend `.env`
- [ ] Replace placeholder icons with real 16x16, 32x32, 48x48, 128x128 PNGs
- [ ] Test on Google Forms, Typeform, JotForm
- [ ] Privacy Policy URL ready
- [ ] Screenshots (1280×800 or 640×400) prepared
- [ ] Description written (under 132 chars for short, 800 for long)
- [ ] Set `NODE_ENV=production` in backend
- [ ] Set production `ALLOWED_ORIGINS` including your extension ID
- [ ] Single-purpose justification for `<all_urls>` permission written

---

## 🛡️ Security Audit Summary

| Item | Status | Notes |
|------|--------|-------|
| Hardcoded localhost | ✅ Fixed | Environment-based URL config |
| API keys in extension | ✅ Fixed | All keys on backend only |
| JWT stored insecurely | ✅ Fixed | chrome.storage.local (sandboxed) |
| No token refresh | ✅ Fixed | Auto refresh with httpOnly cookie |
| No rate limiting | ✅ Fixed | Three tiers of rate limiting |
| No input validation | ✅ Fixed | express-validator on all routes |
| Weak password hashing | ✅ Fixed | bcrypt 12 rounds |
| CORS open | ✅ Fixed | Origin whitelist |
| MongoDB injection | ✅ Fixed | mongo-sanitize middleware |
| Account brute force | ✅ Fixed | Lockout after 5 attempts |

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open Pull Request

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

**FormPilot AI** — Fill Less. Achieve More. 🚀
