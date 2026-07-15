import type { Metadata } from "next";
import Link from "next/link";

// ============================================================================
// ⚠️ THIS IS A DRAFT, NOT LEGAL ADVICE — REQUIRES HUMAN LAWYER REVIEW BEFORE
// PRODUCTION USE. Meet.AI records real conversations involving third-party
// guests, a materially higher liability surface than generic SaaS — the
// guest-consent, retention, and international-transfer sections in particular
// need review for the operator's jurisdiction (Pakistan) and user
// jurisdictions (US/UK/EU). Source policy: docs/PRIVACY.md.
// ============================================================================

// TODO: replace with a branded support address when one exists.
const CONTACT_EMAIL = "abdullahnadeem2580@gmail.com";
const EFFECTIVE_DATE = "July 15, 2026";

export const metadata: Metadata = {
  title: "Privacy Policy — Meet.AI",
  description: "How Meet.AI collects, uses, stores, and deletes your data.",
};

const PrivacyPage = () => {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="text-muted-foreground text-sm">
        Effective {EFFECTIVE_DATE}
      </p>

      <p>
        Meet.AI (&quot;we&quot;, &quot;us&quot;) provides video meetings with an AI participant
        that speaks, listens, and produces recordings, transcripts, and
        summaries. Because our product records real conversations, we want to
        be unusually clear about what is collected, who can access it, and how
        to delete it. Meet.AI is operated from Pakistan; our users are
        worldwide.
      </p>

      <h2>1. What we collect</h2>
      <ul>
        <li>
          <strong>Account data</strong> — your name, email address, avatar,
          and (if you enable it) two-factor authentication secrets. Sign-in
          events, including IP address and browser user-agent, are kept in a
          security log.
        </li>
        <li>
          <strong>Content you create</strong> — AI agent names and
          instructions, meeting names.
        </li>
        <li>
          <strong>Meeting content</strong> — when a meeting runs, we capture
          the <strong>audio and video recording</strong> of the call, a{" "}
          <strong>speaker-attributed transcript</strong> (plus an
          English-normalized copy when participants speak other languages),
          and an <strong>AI-generated summary</strong>. Live audio is also
          processed in real time so the AI participant can listen and respond.
        </li>
        <li>
          <strong>Payment data</strong> — handled entirely by Polar, our
          merchant of record. We never see or store card numbers.
        </li>
        <li>
          <strong>Usage data</strong> — meeting and agent counts (for plan
          quotas) and basic security telemetry (rate-limit counters that
          expire within minutes).
        </li>
      </ul>

      <h2>2. Recording and guest participants</h2>
      <p>
        <strong>Every Meet.AI meeting is recorded and transcribed, and an AI
        assistant may listen and speak.</strong> Every participant — host or
        guest — is shown a consent notice stating this <em>before</em> they
        join; joining constitutes consent to being recorded.
      </p>
      <p>
        If you join a meeting as a <strong>guest</strong> (a meeting you do
        not own): your voice, video, and words become part of the{" "}
        <strong>host&apos;s</strong> recording, transcript, and summary. The host
        controls that meeting&apos;s data, including how long it is kept and who
        can access it. If you want your contribution removed, ask the host to
        delete the meeting, or contact us at{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and we will
        assist. Hosts are contractually required (see our{" "}
        <Link href="/terms">Terms</Link>) to obtain any consent their
        jurisdiction requires before recording other people.
      </p>

      <h2>3. How the AI processes your data</h2>
      <p>
        Live meeting audio is streamed to OpenAI&apos;s API in real time so the AI
        participant can listen and respond; we do not retain raw audio
        ourselves beyond the meeting recording. Transcripts and summaries are
        generated after the meeting and stored with it. We do not use your
        meeting content to train AI models; OpenAI&apos;s API terms likewise state
        that API data is not used for training by default.
      </p>

      <h2>4. Who processes data on our behalf (sub-processors)</h2>
      <table>
        <thead>
          <tr>
            <th>Provider</th>
            <th>Purpose</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>OpenAI</td><td>Real-time AI voice, transcription, translation, summaries</td></tr>
          <tr><td>LiveKit</td><td>Real-time audio/video transport and recording infrastructure</td></tr>
          <tr><td>Neon (Postgres)</td><td>Application database (accounts, meetings, agents)</td></tr>
          <tr><td>Cloudflare R2</td><td>Private storage of recordings and transcripts</td></tr>
          <tr><td>Stream</td><td>Post-meeting &quot;Ask AI&quot; chat</td></tr>
          <tr><td>Polar</td><td>Payments (merchant of record)</td></tr>
          <tr><td>Vercel</td><td>Application hosting</td></tr>
          <tr><td>Upstash</td><td>Rate limiting (abuse prevention)</td></tr>
          <tr><td>Inngest</td><td>Background processing (summaries)</td></tr>
        </tbody>
      </table>

      <h2>5. Retention</h2>
      <ul>
        <li>
          <strong>Recordings, transcripts, and summaries</strong> are kept
          until the meeting owner deletes the meeting or their account —
          deleting either permanently removes the media from storage.
        </li>
        <li>
          <strong>Security logs</strong> (sign-in events, audit trail of host
          actions) are retained for up to 90 days after the related account is
          deleted, under our legitimate interest in security.
        </li>
        <li>
          <strong>Backups</strong> — deleted data may persist in encrypted
          database backups for up to 7 days before aging out.
        </li>
        <li>
          <strong>Invoices and tax records</strong> are retained by Polar as
          the merchant of record, as required by law.
        </li>
      </ul>

      <h2>6. Your rights</h2>
      <ul>
        <li>
          <strong>Delete a meeting</strong> — removes its recording and
          transcripts from storage immediately.
        </li>
        <li>
          <strong>Delete your account</strong> (user menu → Delete account) —
          permanently removes your account, agents, meetings, recordings,
          transcripts, chats, and cancels any subscription. Content you
          contributed as a guest in someone else&apos;s meeting belongs to that
          host (see section 2).
        </li>
        <li>
          <strong>Export</strong> — transcripts and summaries can be
          downloaded from each meeting page.
        </li>
        <li>
          <strong>Access, rectification, portability, objection, complaint</strong>{" "}
          (GDPR/UK GDPR and similar laws) — email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. We respond
          within 30 days. You may also complain to your local data-protection
          authority.
        </li>
      </ul>

      <h2>7. Children</h2>
      <p>
        Meet.AI is not directed at children and may not be used by anyone
        under <strong>16 years of age</strong>. We do not knowingly collect
        data from children under 16; if you believe a child has provided us
        data, contact us and we will delete it.
      </p>

      <h2>8. International data transfers</h2>
      <p>
        Meet.AI is operated from Pakistan, and the providers listed above
        store and process data primarily in the United States and the
        European Union. By using the service you acknowledge that your data
        is transferred to and processed in these locations. Where required,
        transfers from the UK/EU rely on our providers&apos; standard contractual
        clauses and equivalent safeguards.
      </p>

      <h2>9. Security</h2>
      <p>
        Recordings and transcripts live in private storage accessible only
        through short-lived signed links; access requires being the host or
        an admitted participant of the meeting. We support two-factor
        authentication, rate-limit abusive traffic, and keep an append-only
        audit log of security-relevant actions.
      </p>

      <h2>10. Changes & contact</h2>
      <p>
        We will update this policy as the product evolves and change the
        effective date above; material changes will be announced in the app.
        Questions or requests:{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </>
  );
};

export default PrivacyPage;
