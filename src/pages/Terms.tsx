import { Link } from 'react-router-dom'

export default function Terms() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-12 text-sm text-foreground">
      <p className="mb-6">
        <Link to="/login" className="underline text-muted-foreground">← Back to log in</Link>
      </p>

      <h1 className="text-2xl font-semibold mb-1">Terms of Service</h1>
      <p className="text-muted-foreground mb-8">Effective date: July 10, 2026</p>

      <p className="mb-6">
        These Terms of Service ("Terms") govern your use of Waytrace, a campaign link management
        service operated by Germeroth Consulting &amp; Creative ("we," "us," or "our"). By
        subscribing to or using Waytrace, you agree to these Terms.
      </p>

      <h2 className="font-semibold mt-8 mb-2">1. The Service</h2>
      <p className="mb-4">
        Waytrace is a paid software-as-a-service product that lets you create, manage, and track
        campaign URLs, short links, and QR codes. Access requires an active paid subscription.
        There is no free tier on the cloud product.
      </p>

      <h2 className="font-semibold mt-8 mb-2">2. Subscriptions and Billing</h2>
      <p className="mb-4">
        Subscriptions are billed in advance on a monthly or annual basis through Stripe. By
        subscribing you authorize us to charge your payment method on a recurring basis until you
        cancel. Prices are listed at checkout and may change with 30 days' notice to existing
        subscribers.
      </p>
      <p className="mb-4">
        You may cancel your subscription at any time through the billing portal in your account
        settings. Cancellation takes effect at the end of the current billing period. We do not
        issue prorated refunds for unused time except where required by applicable law.
      </p>

      <h2 className="font-semibold mt-8 mb-2">3. Acceptable Use &amp; Fair Use</h2>
      <p className="mb-4">
        You may use Waytrace only for lawful purposes. You may not use the Service to create,
        distribute, or redirect through links to illegal content, malware, phishing pages, spam,
        or content that infringes the rights of others.
      </p>
      <p className="mb-4">
        Your plan includes a set number of Workspaces, Users, and branded domains as described on
        our pricing page; these limits are enforced automatically. We do not cap the number of
        tracking links or clicks you may create, but we reserve the right to apply reasonable
        rate limits, suspend link creation, or require an upgrade if usage patterns indicate
        abuse, automated bulk creation designed to circumvent plan limits, or a load pattern that
        threatens the stability of the Service for other customers.
      </p>
      <p className="mb-4">
        We may disable or remove any individual link, at our discretion and without notice, if it
        is used for illegal activity, malware distribution, phishing, or a violation of these
        Terms. We will make reasonable efforts to notify you when we do so.
      </p>

      <h2 className="font-semibold mt-8 mb-2">4. Your Data</h2>
      <p className="mb-4">
        You retain ownership of the links, campaign data, and content you create in Waytrace.
        We do not sell your data. See our{' '}
        <Link to="/privacy" className="underline">Privacy Policy</Link> for details on how we
        collect and use information.
      </p>

      <h2 className="font-semibold mt-8 mb-2">5. Service Availability</h2>
      <p className="mb-4">
        We aim for high availability but do not guarantee uninterrupted access. Waytrace is
        provided "as is" without warranties of any kind. We are not liable for lost revenue,
        data loss, or other damages arising from downtime or errors in the service.
      </p>

      <h2 className="font-semibold mt-8 mb-2">6. Limitation of Liability</h2>
      <p className="mb-4">
        To the maximum extent permitted by law, our total liability to you for any claim arising
        from your use of Waytrace is limited to the amount you paid us in the three months
        preceding the claim.
      </p>

      <h2 className="font-semibold mt-8 mb-2">7. Termination, Cancellation &amp; Data Retention</h2>
      <p className="mb-4">
        You may cancel your subscription at any time from your account's Billing settings.
      </p>
      <p className="mb-4">
        <strong>Within 14 days of your subscription start date:</strong> cancelling immediately
        terminates and refunds your subscription in full, and permanently deletes all of your
        Workspaces, links, click/scan history, and branded domain configurations. This deletion is
        irreversible. Your account itself is not deleted and you may still log in, downgraded to
        the free tier.
      </p>
      <p className="mb-4">
        <strong>After 14 days:</strong> cancelling schedules your subscription to end at the close
        of the current billing period. No refund is issued for the remaining period. Your data is
        not touched and remains accessible until the paid period ends, at which point your account
        is downgraded to the free tier (Workspaces, links, and click history are retained but
        read-only/limited per the free tier).
      </p>
      <p className="mb-4">
        We may suspend or terminate your account for violation of these Terms or non-payment, with
        reasonable notice where practicable. If your account is terminated for cause, we may
        delete your data after a reasonable notice period.
      </p>

      <h2 className="font-semibold mt-8 mb-2">8. Changes to These Terms</h2>
      <p className="mb-4">
        We may update these Terms from time to time. We will notify you by email at least 14
        days before material changes take effect. Continued use of the service after changes
        take effect constitutes acceptance.
      </p>

      <h2 className="font-semibold mt-8 mb-2">9. Governing Law</h2>
      <p className="mb-4">
        These Terms are governed by the laws of the State of New Hampshire, United States, without
        regard to conflict of law principles.
      </p>

      <h2 className="font-semibold mt-8 mb-2">10. Contact</h2>
      <p className="mb-4">
        Questions about these Terms? Email us at{' '}
        <a href="mailto:hello@waytrace.co" className="underline">hello@waytrace.co</a>.
      </p>
    </div>
  )
}
