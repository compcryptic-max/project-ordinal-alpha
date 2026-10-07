# v0.18 — First Journey

Every launch begins with Welcome, Create Account, Sign In and Continue Saved Wayfarer (when available). Account creation leads to a private recovery-code receipt, character selection and world entry. Browser and native iPhone clients share the same account API.

Alpha accepts invented identifiers and names, including identifiers without email syntax, and any non-empty test password. No email, domain, identity or password-strength verification is performed. Duplicate account identifiers are rejected to preserve existing progress. Sign-in checks the chosen password; recovery requires the private code.

Passwords use salted scrypt hashes; recovery codes use SHA-256 hashes and rotate after use. Accounts persist in PostgreSQL when connected, or temporary memory on test servers. Clients never save passwords. Legacy character/recovery routes remain available for alpha migration. Release authentication hardening, legacy-route retirement and email verification remain unfinished; this is not production-ready account security.

Browser background sync and combat clocks pause behind the account gate. Class selection preserves the typed character name. Native startup postpones location access until after the account step.

Also fixes a v0.17 defect: the server now serves WebP creature/character assets and the PNG icon with correct MIME types. All five Node suites pass, including functional account and asset-delivery checks.
