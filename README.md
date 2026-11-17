# FormPilot AI

**An AI-powered Chrome extension for working with online forms.**

FormPilot AI is an independent development project that explores how browser extensions, profile-based information, and generative AI can work together to simplify form completion.

It uses Chrome Extension Manifest V3, a Node.js backend, MongoDB, and Google's Gemini API.

> **Project Type:** Independent Development Project  
> **Platform:** Google Chrome  
> **Status:** Experimental / Under Development

---

## Overview

Filling out repetitive online forms can take time, especially when the same personal or professional information is required across multiple websites.

FormPilot AI explores a way to make this process easier.

The extension detects form fields, matches them with saved profile information, and can use AI-generated suggestions to help complete forms.

The project includes a Chrome extension and a backend API for authentication, profile management, AI processing, and form history.

AI-generated answers should always be reviewed before being used or submitted.

## Features

The following are the main development areas of FormPilot AI. Availability may depend on the current implementation.

### Form Detection and Filling
- Detect form fields on supported websites.
- Identify common field types using HTML attributes and accessibility information.
- Support text, email, phone, radio, checkbox, dropdown, date, and textarea fields.
- Observe dynamically added form elements.

### AI-Assisted Form Completion
- Generate suggested answers using Gemini AI.
- Match form questions with saved profile information.
- Explore resume-based text extraction.
- Provide specialized assistance for job and scholarship applications.

### Profile Management
- Create and manage multiple profiles.
- Edit and duplicate profiles.
- Import and export profile data using JSON.

### Form History
- View previously processed forms.
- Search form history.
- Review recorded completion status.

### Dashboard and Preferences
- View usage statistics and analytics.
- Switch between dark and light themes.
- Manage extension preferences.

*Feature descriptions are not a guarantee that every feature is fully implemented or available in every website.*

---

## How It Works

The project follows a simple extension-to-backend workflow:

1. The Chrome extension detects supported form fields on a webpage.
2. Relevant field information is processed by the extension.
3. Saved profile information can be matched with detected fields.
4. When AI assistance is requested, relevant information may be sent to the backend for processing through Gemini.
5. Suggested answers can be inserted into supported form fields.
6. Form activity may be recorded in the backend, depending on the enabled functionality.

Always review automatically populated information before submitting a form.

---

## Technology Stack

| Technology | Purpose |
|---|---|
| JavaScript | Extension and backend development |
| Chrome Extension Manifest V3 | Browser extension platform |
| Node.js | Backend runtime |
| Express.js | API framework |
| MongoDB Atlas | Database |
| Gemini API | AI-assisted answer generation |
| JWT | Authentication |
| Chrome Storage API | Extension-side storage |

---

## Project Architecture

```text
FormPilot-AI/
│
├── extension/
│   ├── manifest.json
│   │
│   ├── background/
│   │   └── background.js
│   │
│   ├── content/
│   │   └── content.js
│   │
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.css
│   │   └── popup.js
│   │
│   └── utils/
│       ├── config.js
│       ├── storage.js
│       └── api.js
│
└── backend/
    ├── server.js
    ├── app.js
    │
    ├── config/
    │   └── database.js
    │
    ├── controllers/
    │   ├── authController.js
    │   ├── profileController.js
    │   ├── aiController.js
    │   └── formHistoryController.js
    │
    ├── middleware/
    │   ├── auth.js
    │   ├── rateLimiter.js
    │   └── validate.js
    │
    ├── models/
    │   ├── User.js
    │   ├── Profile.js
    │   ├── FormHistory.js
    │   └── UsageLog.js
    │
    ├── routes/
    │   ├── auth.routes.js
    │   ├── profile.routes.js
    │   ├── ai.routes.js
    │   └── forms.routes.js
    │
    ├── services/
    │   ├── geminiService.js
    │   └── tokenService.js
    │
    └── utils/
        ├── logger.js
        └── apiResponse.js
```

*This is a simplified overview based on the documented project structure. Actual files may change during development.*

---

## Getting Started

### Prerequisites

Before running the project, make sure you have:

- Node.js 18 or later
- npm
- Google Chrome
- A MongoDB database
- A Google AI Studio API key for Gemini

### 1. Clone the repository

```bash
git clone YOUR_FORMPILOT_REPOSITORY_URL
```

Replace the placeholder with the actual Git repository URL.

### 2. Install backend dependencies

```bash
cd backend
npm install
```

### 3. Configure environment variables

Copy the example environment file:

```bash
cp .env.example .env
```

Create the `.env` file manually if an example file is not available.

Add the required configuration:

```env
NODE_ENV=development
PORT=5000

MONGODB_URI=your_mongodb_connection_string

JWT_SECRET=your_access_token_secret
JWT_REFRESH_SECRET=your_refresh_token_secret

GEMINI_API_KEY=your_gemini_api_key

ALLOWED_ORIGINS=http://localhost:3000,chrome-extension://YOUR_EXTENSION_ID
```

Replace all example values with your own credentials and configuration.

Never commit your actual `.env` file.

### 4. Start the backend

```bash
npm run dev
```

The development server is expected to run at:

```text
http://localhost:5000
```

The actual port depends on your environment configuration.

### 5. Check the backend

If the health endpoint is available in your current implementation, test:

```text
GET /health
```

---

## Load the Chrome Extension

### 1. Open Chrome Extensions

Visit:

```text
chrome://extensions/
```

### 2. Enable Developer Mode

Turn on **Developer mode**.

### 3. Load the extension

- Select **Load unpacked**.
- Choose the project's `extension/` directory.
- Chrome will load the extension.

### 4. Configure the backend URL

Open:

```text
extension/utils/config.js
```

Check the development and production API URLs.

Example:

```javascript
API_URLS: {
  development: 'http://localhost:5000',
  production: 'https://your-backend-url.onrender.com'
}
```

Replace the production URL with your actual backend address.

For local testing, the extension environment can be selected using its configuration setting:

```javascript
chrome.storage.local.set({
  fp_env: 'development'
});
```

The exact configuration behaviour depends on the extension implementation.

---

## API Reference

The following table documents the API routes described by the project. Verify the actual route definitions and HTTP methods in the backend source before relying on them.

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Register a user |
| POST | `/api/auth/login` | Authenticate a user |
| POST | `/api/auth/refresh` | Refresh an access token |
| POST | `/api/auth/logout` | Log out and revoke a token |
| GET | `/api/auth/me` | Get current user information |
| PUT | `/api/auth/me` | Update user information |
| PUT | `/api/auth/change-password` | Change password |

### Profiles

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/profiles` | List profiles |
| POST | `/api/profiles` | Create a profile |
| GET | `/api/profiles/:id` | Get a profile |
| PUT | `/api/profiles/:id` | Update a profile |
| DELETE | `/api/profiles/:id` | Delete a profile |
| POST | `/api/profiles/:id/duplicate` | Duplicate a profile |
| PUT | `/api/profiles/:id/set-default` | Set the default profile |
| GET | `/api/profiles/:id/export` | Export a profile |
| POST | `/api/profiles/import` | Import a profile |

### AI

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/ai/generate-answers` | Generate suggested answers |
| POST | `/api/ai/parse-resume` | Process resume text |
| POST | `/api/ai/map-fields` | Match fields with profile information |
| GET | `/api/ai/usage` | Retrieve AI usage information |

### Form History

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/forms/history` | Retrieve form history |
| POST | `/api/forms/history` | Save a history entry |
| GET | `/api/forms/history/:id` | Retrieve a history entry |
| DELETE | `/api/forms/history/:id` | Delete a history entry |
| DELETE | `/api/forms/history` | Clear form history |
| GET | `/api/forms/analytics` | Retrieve usage analytics |

---

## Deployment

The backend can be configured for a hosting provider that supports Node.js applications.

### Render

The documented deployment configuration is:

| Setting | Value |
|---|---|
| Service Type | Web Service |
| Build Command | `cd backend && npm install` |
| Start Command | `cd backend && node server.js` |
| Runtime | Node.js |

Add the required environment variables through the hosting provider's dashboard.

### Railway

- Connect the GitHub repository.
- Configure the backend directory as the service root, if supported by your project setup.
- Add the required environment variables.
- Deploy the application.

### MongoDB Atlas

Configure a database and provide its connection string through `MONGODB_URI`.

Use appropriately restricted database credentials and network access rules. Avoid leaving unrestricted database access enabled unless it is genuinely necessary and understood.

---

## Security and Permissions

FormPilot AI interacts with webpage content and may process personal information.

The extension's actual permissions are determined by `manifest.json`.

Before using or distributing the extension:

- Review all requested Chrome permissions.
- Keep Gemini and database API keys on the backend.
- Never expose private credentials in extension source code.
- Keep authentication secrets in environment variables.
- Restrict backend access to authorized origins where appropriate.
- Review how profile information and form history are stored.
- Test authentication, token refresh, and authorization behaviour.
- Review the extension's handling of webpage data.

The project documentation describes security-related implementations, but this README does not represent an independent security audit or certify the application as secure.

---

## Privacy

FormPilot AI may process webpage form information, profile information, resume text, and form history depending on the features used.

Information may be processed by the backend and Gemini API when AI functionality is used.

Do not use the extension with sensitive accounts or submit confidential information through an experimental deployment.

Read [PRIVACY.md](PRIVACY.md) for more details.

---

## Learning Objectives

Building FormPilot AI has provided practical experience with:

- Chrome Extension Manifest V3
- Browser content scripts and service workers
- DOM manipulation and form detection
- Dynamic webpage observation
- REST API development
- Authentication and token management
- MongoDB integration
- Generative AI API integration
- Browser storage
- Frontend and backend communication

---

## License

FormPilot AI is distributed under the MIT License.

See [LICENSE](LICENSE) for the complete license text.

---

## Author

**Dhruv Patel**

Computer Science Undergraduate | Full-Stack Developer | AI Enthusiast

- GitHub: [@DhruvPatel011](https://github.com/DhruvPatel011)

---

*FormPilot AI – Exploring the intersection of browser automation and artificial intelligence.*
