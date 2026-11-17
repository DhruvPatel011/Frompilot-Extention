# Privacy Notice – FormPilot AI

**Last Updated:** November 2026

FormPilot AI is an independent Chrome extension project developed by Dhruv Patel.

This notice explains the types of information the project may process and the privacy considerations associated with using the extension and its backend.

FormPilot AI is an experimental development project and is not represented as a certified or independently audited privacy product.

## 1. How FormPilot AI Works

FormPilot AI is designed to detect form fields on webpages, use saved profile information to assist with form completion, and optionally generate suggested answers through an AI service.

Depending on the features used, information may be processed by:

- The Chrome extension.
- The FormPilot AI backend.
- The configured MongoDB database.
- The Google Gemini API.
- The email or hosting services used by the application.

The exact processing depends on the current source code and deployment configuration.

## 2. Information That May Be Processed

Depending on the functionality used, the application may process:

### Account Information
- Name or other registration details.
- Email address.
- Authentication-related information.
- Password hashes and token-related data.

### Profile Information
- Personal details entered into user profiles.
- Educational information.
- Employment and professional information.
- Other information saved for form completion.

### Webpage and Form Information
- Website URLs.
- Form field labels and names.
- Field types and detected form structure.
- Information entered into supported form fields.
- Form completion status.

### Resume Information
If resume parsing is used, resume text or extracted information may be processed by the backend and AI service.

### Usage and History Information
Depending on the implementation, the backend may store:
- Form history.
- AI usage information.
- Application activity records.
- Technical logs.

This list describes possible information categories, not a claim that every category is collected in every session.

## 3. Browser Permissions and Webpage Access

The extension's actual access is determined by its Chrome manifest and the permissions granted during installation.

The project is designed to detect and interact with form fields on supported webpages.

This means that webpage content and form information may be accessible to the extension on websites where its permissions allow it to operate.

Users should review the requested permissions before installing or enabling the extension.

Do not use the extension on websites containing confidential or highly sensitive information.

## 4. AI Processing

FormPilot AI uses the Google Gemini API for AI-assisted functionality.

When AI features are used, relevant information such as form questions, field descriptions, profile details, or resume text may be transmitted to the configured backend and processed through Gemini.

The information shared depends on the request and the current implementation.

Google's own terms and privacy policies also apply to its processing of information.

Do not submit confidential information or sensitive personal data to AI features.

AI-generated responses may be incorrect, incomplete, or inappropriate. Always review suggestions before using them.

## 5. Database and Storage

The backend is designed to use MongoDB for application data.

The extension may also use Chrome storage for extension-related information.

Depending on the implementation, these systems may contain:
- Account information.
- Saved profiles.
- Authentication-related information.
- Form history.
- Usage records.
- Extension preferences.

The exact retention and deletion behaviour depends on the current implementation and database configuration.

Clearing Chrome storage does not necessarily delete information already transmitted to the backend.

## 6. Authentication and Security

The project documentation describes JWT-based authentication, password hashing, and token management.

However, the presence of these mechanisms does not guarantee that the application is completely secure.

The project has not been represented as independently security-audited.

Users should avoid reusing important passwords and should not rely on the extension for highly sensitive information.

## 7. Third-Party Services

Depending on the deployment, FormPilot AI may rely on services including:

- Google Gemini API for AI processing.
- MongoDB Atlas for database hosting.
- Render or Railway for backend hosting.
- Other infrastructure or services configured by the project.

These providers may process technical or application information under their own terms and privacy policies.

This notice does not replace the privacy policies of those providers.

## 8. Data Retention and Deletion

Information may remain in browser storage, the backend database, or third-party infrastructure depending on the application configuration.

Deleting an account or clearing local storage should not be assumed to remove every copy of information from all systems.

The actual deletion process and retention period depend on the implemented functionality and relevant service policies.

## 9. Children's Information

FormPilot AI is not specifically designed for children.

Do not use the project to collect or process another person's personal information without appropriate permission.

## 10. Changes to This Notice

This notice may be updated as the application, its features, or its data-processing practices change.

The latest version will be published in the project repository.

## 11. Contact

For questions regarding FormPilot AI or this notice:

**Author:** Dhruv Patel

**GitHub:** https://github.com/DhruvPatel011

---

*Use FormPilot AI responsibly. Review webpage permissions and avoid processing confidential or sensitive information.*
