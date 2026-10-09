# DealForge — B2B Offer & ROI Studio

A self-hosted, privacy-friendly SaaS MVP for agencies and freelancers. Create persuasive B2B proposals with transparent ROI scenarios, generate shareable proposal links, and export printable offers.

## Monetization
- Free: 3 proposals (per account).
- Pro: €29/month — unlimited proposals and branded share links (Stripe Checkout only after keys are configured).
- Payments are **not active by default**. Never mark a user paid from a return URL; Stripe webhooks are verified.
- A €1m revenue target would require about 2,874 subscribers paying €29/month for a full year (before churn, fees and tax). This is a target, not a prediction.

## Run
```sh
cp .env.example .env
npm install
npm run dev
```
Open http://localhost:3000, sign up, and create a proposal.

Node.js 20+ and a PostgreSQL database required. Put a strong random `SESSION_SECRET` in `.env`.

## Database
`DATABASE_URL` points to Postgres. Tables are created by running `npm run db:init`. Development examples are in `.env.example`. Use your own production Postgres and HTTPS.

## Billing setup — owner action required
Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, and `BASE_URL`. The customer chooses an upgrade from the pricing page. Wire the Stripe webhook to `POST /api/stripe/webhook`. Without keys, checkout remains disabled. Never commit secrets.

## MVP scope
No external AI key needed: proposal drafts are produced with deterministic templates. ROI is only a user-defined illustrative scenario, *not* a guaranteed return. No scraping, spam or automatic billing.

## Next steps
Deploy to Render/Railway/Fly with HTTPS and Postgres; configure domain; test Stripe in test mode; add compliant imprint/privacy policy and terms; find pilot customers.
