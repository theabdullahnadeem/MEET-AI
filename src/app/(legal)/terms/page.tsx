import type { Metadata } from "next";
import Link from "next/link";

// ============================================================================
// ⚠️ THIS IS A DRAFT, NOT LEGAL ADVICE — REQUIRES HUMAN LAWYER REVIEW BEFORE
// PRODUCTION USE. Pay particular attention to: the recording-consent
// responsibility clause (section 4 — Meet.AI records third-party guests who
// are not account holders), the refund policy, the liability cap, and the
// governing-law choice (Pakistan operator with US/UK/EU consumers).
// ============================================================================

// TODO: replace with a branded support address when one exists.
const CONTACT_EMAIL = "abdullahnadeem2580@gmail.com";
const EFFECTIVE_DATE = "July 15, 2026";

export const metadata: Metadata = {
  title: "Terms of Service — Meet.AI",
  description: "The terms that govern your use of Meet.AI.",
};

const TermsPage = () => {
  return (
    <>
      <h1>Terms of Service</h1>
      <p className="text-muted-foreground text-sm">
        Effective {EFFECTIVE_DATE}
      </p>

      <p>
        These terms govern your use of Meet.AI — video meetings with an AI
        participant that speaks, listens, and produces recordings,
        transcripts, and summaries. By creating an account or joining a
        meeting you agree to them and to our{" "}
        <Link href="/privacy">Privacy Policy</Link>. If you do not agree, do
        not use the service. You must be at least 16 years old.
      </p>

      <h2>1. The service</h2>
      <p>
        Meet.AI lets you create AI agents with custom instructions, hold
        video meetings where such an agent participates by voice, invite
        guests via link (guests join free and are admitted by the host), and
        receive a recording, transcript, and AI-generated summary after each
        meeting. Features may change as the product evolves.
      </p>

      <h2>2. Plans, quotas & billing</h2>
      <ul>
        <li>
          <strong>Free</strong> — 1 custom agent, 1 AI meeting per calendar
          month, up to 60 minutes per meeting.
        </li>
        <li>
          <strong>Starter ($15/month)</strong> — 3 agents, 10 AI meetings per
          month.
        </li>
        <li>
          <strong>Pro ($29/month)</strong> — 10 agents, 30 AI meetings per
          month.
        </li>
        <li>
          <strong>Business ($79/month)</strong> — unlimited agents, 75 AI
          meetings per month.
        </li>
      </ul>
      <p>
        All plans include recording, transcription, summaries, post-meeting
        chat, and unlimited free guests. Quotas are enforced by the service
        and reset each calendar month; every meeting has a 60-minute limit
        and ends automatically after 10 minutes of silence. Billing is
        handled by Polar, our merchant of record, at the prices shown on the
        upgrade page. We may change prices or quotas with 30 days&apos; notice;
        changes apply from your next billing cycle.
      </p>

      <h2>3. Cancellation & refunds</h2>
      <p>
        You can cancel any time from the billing portal; cancellation takes
        effect at the end of the paid period and you keep access until then.
        If Meet.AI didn&apos;t work out, email us within{" "}
        <strong>14 days of your first purchase</strong> for a full refund.
        After that, refunds are pro-rata at our reasonable discretion; abuse
        of the refund policy (e.g., consuming a full quota and then
        requesting refunds repeatedly) may be declined. Statutory consumer
        rights in your country remain unaffected.
      </p>

      <h2>4. Recording consent — your responsibility as host</h2>
      <p>
        Every Meet.AI meeting is recorded and transcribed, and every
        participant is shown a notice saying so before they join.{" "}
        <strong>
          As a host, you are solely responsible for complying with the
          recording and wiretapping laws that apply to you and your
          participants
        </strong>{" "}
        — some jurisdictions require the consent of all parties. Do not admit
        participants who have not consented, and do not use Meet.AI to record
        anyone secretly. You indemnify us against claims arising from your
        failure to obtain required consent.
      </p>

      <h2>5. Acceptable use</h2>
      <ul>
        <li>No unlawful, harassing, or abusive use or content.</li>
        <li>
          No attempts to probe, overload, or circumvent the service&apos;s
          security, quotas, or billing.
        </li>
        <li>No reselling or white-labelling without our written permission.</li>
        <li>
          No use of the AI to generate content that violates applicable law
          or third-party rights.
        </li>
        <li>
          <strong>No regulated health data</strong> — the service is not
          HIPAA-compliant and must not be used to process protected health
          information.
        </li>
      </ul>

      <h2>6. AI-generated content disclaimer</h2>
      <p>
        AI transcriptions, summaries, and spoken responses are generated
        automatically and <strong>may contain errors, omissions, or
        fabrications</strong>. They are not legal, medical, financial, or
        other professional advice. Verify AI output before relying on it or
        sharing it as a record of what was said.
      </p>

      <h2>7. Your content</h2>
      <p>
        You own your meeting content (recordings, transcripts, summaries,
        agent instructions). You grant us the limited licence needed to
        operate the service — storing, processing, transcribing, and
        summarizing your content via the sub-processors listed in the{" "}
        <Link href="/privacy">Privacy Policy</Link>. We do not sell your
        content or use it to train AI models.
      </p>

      <h2>8. Termination</h2>
      <p>
        You may stop using Meet.AI at any time and delete your account from
        the user menu — deletion is permanent and removes your meetings,
        media, and subscription as described in the Privacy Policy. We may
        suspend or terminate accounts that violate these terms, with notice
        where practicable; where the violation is not curable or is unlawful,
        immediately.
      </p>

      <h2>9. Warranty & liability</h2>
      <p>
        The service is provided <strong>&quot;as is&quot;</strong> without warranties
        of any kind. To the maximum extent permitted by law: we are not
        liable for indirect, incidental, or consequential damages (including
        lost profits or lost data beyond the retention commitments in the
        Privacy Policy), and our aggregate liability for any claim is limited
        to the amounts you paid us in the 12 months before the claim arose.
        Nothing in these terms excludes liability that cannot be excluded by
        law, including mandatory consumer protections in your country of
        residence.
      </p>

      <h2>10. Governing law</h2>
      <p>
        These terms are governed by the laws of Pakistan, without prejudice
        to mandatory consumer-protection rules of the country where you
        reside. Disputes will first be attempted to be resolved informally
        via <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <h2>11. Changes & contact</h2>
      <p>
        We may update these terms as the product evolves; material changes
        will be announced in the app and apply 30 days after notice.
        Questions: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </>
  );
};

export default TermsPage;
