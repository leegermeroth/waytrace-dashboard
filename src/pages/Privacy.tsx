import { Link } from 'react-router-dom'

export default function Privacy() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-12 text-sm text-foreground">
      <p className="mb-6">
        <Link to="/login" className="underline text-muted-foreground">← Back to log in</Link>
      </p>

      <h1 className="text-2xl font-semibold mb-1">Privacy Policy</h1>
      <p className="text-muted-foreground mb-8">Effective date: July 10, 2026</p>

      <p className="mb-6">
        This Privacy Policy explains how Germeroth Consulting &amp; Creative ("we," "us," or
        "our") collects, uses, and protects information in connection with Waytrace
        (app.waytrace.co).
      </p>

      <h2 className="font-semibold mt-8 mb-2">1. Information We Collect</h2>
      <ul className="list-disc pl-5 mb-4 space-y-2">
        <li>
          <strong>Account information</strong> — your email address and a hashed password when
          you set up your account.
        </li>
        <li>
          <strong>Billing information</strong> — payment details are collected and stored
          directly by Stripe. We receive only a Stripe customer ID and subscription status; we
          never see or store full card numbers.
        </li>
        <li>
          <strong>Campaign and link data</strong> — the URLs, UTM parameters, short codes, and
          labels you create in Waytrace.
        </li>
        <li>
          <strong>Click and scan data</strong> — when someone clicks a short link or scans a QR
          code managed by Waytrace, we log the timestamp, approximate country, device type,
          referrer, and whether the interaction was a link click or QR scan. We do not store IP
          addresses.
        </li>
      </ul>

      <h2 className="font-semibold mt-8 mb-2">2. How We Use Your Information</h2>
      <ul className="list-disc pl-5 mb-4 space-y-2">
        <li>To provide and operate the Waytrace service.</li>
        <li>To process payments and manage your subscription.</li>
        <li>To send transactional emails (account setup, password reset). We do not send
          marketing email without your consent.</li>
        <li>To provide click analytics on your links.</li>
      </ul>

      <h2 className="font-semibold mt-8 mb-2">3. Third-Party Services</h2>
      <ul className="list-disc pl-5 mb-4 space-y-2">
        <li>
          <strong>Stripe</strong> — payment processing. Your payment data is subject to{' '}
          <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="underline">
            Stripe's Privacy Policy
          </a>.
        </li>
        <li>
          <strong>Cloudflare</strong> — hosting, DNS, and infrastructure. Traffic to Waytrace
          passes through Cloudflare's network.
        </li>
        <li>
          <strong>Resend</strong> — transactional email delivery (account setup and password
          reset emails only).
        </li>
        <li>
          <strong>Cloudflare R2</strong> — encrypted daily backups of the database for disaster
          recovery.
        </li>
      </ul>
      <p className="mb-4">We do not sell your data to third parties.</p>

      <h2 className="font-semibold mt-8 mb-2">4. Data Retention</h2>
      <p className="mb-4">
        We retain your account and Workspace/link data for as long as your account exists. If you
        cancel within 14 days of subscribing, your Workspace, link, and click/scan data is
        permanently deleted as part of that cancellation (see our{' '}
        <Link to="/terms" className="underline">Terms of Service</Link>). If you cancel after 14
        days or are on the free tier, your data is retained but you may request full deletion at
        any time by emailing{' '}
        <a href="mailto:hello@waytrace.co" className="underline">hello@waytrace.co</a>. Click/scan
        analytics are retained for up to 24 months.
      </p>

      <h2 className="font-semibold mt-8 mb-2">5. Security</h2>
      <p className="mb-4">
        Passwords are stored as PBKDF2 hashes and never in plaintext. All data is transmitted
        over HTTPS. Database backups are encrypted at rest. No security measure is perfect, and
        we cannot guarantee absolute security.
      </p>

      <h2 className="font-semibold mt-8 mb-2">6. Your Rights</h2>
      <p className="mb-4">
        You may request access to, correction of, or deletion of your personal data at any time
        by contacting us at{' '}
        <a href="mailto:hello@waytrace.co" className="underline">hello@waytrace.co</a>. If you
        are located in the EU or UK, you have additional rights under GDPR/UK GDPR including the
        right to data portability and the right to lodge a complaint with a supervisory authority.
      </p>

      <h2 className="font-semibold mt-8 mb-2">7. Changes to This Policy</h2>
      <p className="mb-4">
        We may update this Privacy Policy from time to time. We will notify you by email before
        material changes take effect.
      </p>

      <h2 className="font-semibold mt-8 mb-2">8. Contact</h2>
      <p className="mb-4">
        Questions? Email us at{' '}
        <a href="mailto:hello@waytrace.co" className="underline">hello@waytrace.co</a>.
      </p>
    </div>
  )
}
