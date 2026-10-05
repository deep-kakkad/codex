import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  BACKUP_DAYS,
  DEFAULT_RECORDING_DAYS,
  PRIVACY_EMAIL,
  PRIVACY_NOTICE_UPDATED,
  RECORDING_DAY_OPTIONS,
  SUBPROCESSORS,
} from '../../../shared/privacy';
import { Icon, type IconName } from '../components/Icon';
import { SiteLayout } from '../components/Site';

const shortest = RECORDING_DAY_OPTIONS[0];
const longest = RECORDING_DAY_OPTIONS[RECORDING_DAY_OPTIONS.length - 1];
const mail = <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>;

function DocHead({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section className="lp-wrap doc-hero">
      <span className="doc-eyebrow">{eyebrow}</span>
      <h1 className="doc-title">{title}</h1>
      <div className="doc-lead">{children}</div>
    </section>
  );
}

function SubprocessorTable() {
  return (
    <div className="doc-table-wrap">
      <table className="doc-table">
        <thead>
          <tr>
            <th>Company</th>
            <th>What for</th>
            <th>Which data</th>
            <th>Where</th>
          </tr>
        </thead>
        <tbody>
          {SUBPROCESSORS.map((s) => (
            <tr key={s.name}>
              <td>
                <strong>{s.name}</strong>
              </td>
              <td>{s.purpose}</td>
              <td>{s.data}</td>
              <td>{s.location}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Trust ------------------------------------------------------------------------------------

const PRACTICES: { icon: IconName; title: string; points: ReactNode[] }[] = [
  {
    icon: 'lock',
    title: 'Sign-in and access',
    points: [
      'Passwords are hashed with scrypt. Sessions are random tokens, stored only as hashes, in HttpOnly cookies.',
      'Two-factor sign-in with any authenticator app, with one-time recovery codes. Sign out every other device in one click.',
      'Repeated wrong passwords are slowed down per email address and per network address.',
      'Each workspace sees only its own assessments and candidates. Every request is checked against the signed-in workspace.',
    ],
  },
  {
    icon: 'shield',
    title: 'Built-in protections',
    points: [
      'HTTPS everywhere, with HSTS, a strict Content Security Policy and the standard security headers on every page.',
      'Candidate links are long random secrets. A candidate can tie theirs to an account so a forwarded link can’t open it.',
      'An activity log in every workspace: sign-ins, security changes, invitations, decisions, exports and deletions.',
      `A copy of the database every night, kept for ${BACKUP_DAYS} days, separate from the database provider’s own.`,
    ],
  },
  {
    icon: 'sparkle',
    title: 'AI, with people deciding',
    points: [
      'AI transcribes recordings and scores each answer against a fixed rubric, quoting the candidate’s own words.',
      'Accent, fluency and nerves are not assessed. No camera, no screen recording, no AI interviewer.',
      'AI recommends; people at the hiring company make every decision. Candidates are told all of this before they start.',
      'We don’t train AI models on your data or your candidates’ data.',
    ],
  },
  {
    icon: 'clock',
    title: 'Retention and deletion',
    points: [
      `Recordings are deleted ${DEFAULT_RECORDING_DAYS} days after a candidate finishes, or after anything from ${shortest} days to a year, as each workspace chooses.`,
      'Candidates can download their answers, or withdraw and delete everything, from their own link at any time.',
      'Hiring teams can download everything about a candidate, or delete it, from the candidate’s page.',
      `Deleted data leaves our nightly backups within ${BACKUP_DAYS} days.`,
    ],
  },
];

export function TrustPage() {
  return (
    <SiteLayout title="Trust and security">
      <DocHead eyebrow="Trust and security" title="How we look after your candidates’ data.">
        <p>
          Proofwork holds answers and voice recordings from people applying for jobs. Here is what we do to protect
          them, who else handles them, and what you and your candidates can do about it.
        </p>
      </DocHead>

      <section className="lp-wrap doc-section">
        <div className="trust-grid">
          {PRACTICES.map((p) => (
            <article key={p.title} className="trust-card">
              <span className="trust-icon" aria-hidden="true">
                <Icon name={p.icon} size={20} />
              </span>
              <h2>{p.title}</h2>
              <ul>
                {p.points.map((point, i) => (
                  <li key={i}>{point}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="lp-wrap doc-section" aria-labelledby="collect-title">
        <h2 id="collect-title" className="doc-h2">
          What we hold
        </h2>
        <div className="doc-two">
          <div>
            <h3>About candidates</h3>
            <p>
              Name and email (entered by the hiring team), the name on their ID, their written and spoken answers,
              scratchpad, how long each question took, and when they left the tab or pasted text. Plus the AI review,
              the team’s notes and the decision.
            </p>
          </div>
          <div>
            <h3>About hiring teams</h3>
            <p>
              Names, work emails and hashed passwords, the company name, assessments, and the activity log, including
              the network address of each sign-in. No tracking cookies or third-party analytics anywhere.
            </p>
          </div>
        </div>
      </section>

      <section className="lp-wrap doc-section" aria-labelledby="sub-title">
        <h2 id="sub-title" className="doc-h2">
          Sub-processors
        </h2>
        <p className="doc-intro">
          Every company that handles personal data for us. We tell customers before adding or replacing one.
        </p>
        <SubprocessorTable />
      </section>

      <section className="lp-wrap doc-section" aria-labelledby="law-title">
        <h2 id="law-title" className="doc-h2">
          Privacy law
        </h2>
        <div className="doc-three">
          <div>
            <h3>India (DPDP Act, 2023)</h3>
            <p>
              Candidates get a plain notice and give their consent before they start. They can withdraw it, see their
              data and have it erased at any time, and there is a contact for complaints.
            </p>
          </div>
          <div>
            <h3>EU and UK (GDPR)</h3>
            <p>
              The hiring company is the controller and Proofwork its processor. Our{' '}
              <Link to="/dpa">data processing agreement</Link> sets out what we do for you. Data is processed in the
              United States.
            </p>
          </div>
          <div>
            <h3>AI in hiring</h3>
            <p>
              Some places regulate AI in hiring, such as New York City (bias audits) and the EU AI Act (hiring is
              high-risk). Our AI recommends and people decide, but check what applies where you hire.
            </p>
          </div>
        </div>
      </section>

      <section className="lp-wrap doc-section doc-contact" aria-labelledby="contact-title">
        <h2 id="contact-title" className="doc-h2">
          Questions or a security issue?
        </h2>
        <p>
          Email {mail}. Read the <Link to="/privacy">privacy notice</Link> or the{' '}
          <Link to="/dpa">data processing agreement</Link>.
        </p>
      </section>
    </SiteLayout>
  );
}

// Privacy notice ---------------------------------------------------------------------------------

export function PrivacyPage() {
  return (
    <SiteLayout title="Privacy notice">
      <DocHead eyebrow="Privacy notice" title="Your data, in plain words.">
        <p>
          What Proofwork collects, why, who sees it, how long we keep it and what you can do about it. Last updated{' '}
          {PRIVACY_NOTICE_UPDATED}.
        </p>
      </DocHead>

      <article className="lp-wrap doc">
        <nav className="doc-toc" aria-label="On this page">
          <a href="#who">Who we are</a>
          <a href="#candidates">If you’re a candidate</a>
          <a href="#rights">Your rights</a>
          <a href="#recruiters">If you’re hiring</a>
          <a href="#visitors">Visitors and cookies</a>
          <a href="#contact">Contact and complaints</a>
        </nav>

        <section id="who">
          <h2>Who we are</h2>
          <p>
            Proofwork runs practical hiring assessments for companies. When a company invites you to an assessment, that
            company decides why your data is used: it is the <em>data fiduciary</em> (or <em>controller</em>), and
            Proofwork processes your data on its behalf. For recruiters’ own accounts, and for people who leave their
            email on our website, Proofwork decides, and is responsible.
          </p>
        </section>

        <section id="candidates">
          <h2>If you’re a candidate</h2>
          <h3>What we collect</h3>
          <ul>
            <li>Your name and email, as the hiring company entered them, and the name on your photo ID.</li>
            <li>
              Your answers: text, voice recordings, your scratchpad and, on the question where AI is allowed, the AI
              conversation you paste.
            </li>
            <li>
              How the assessment went: when each question opened and closed, and whether you left the tab or pasted
              text. No camera, no screen recording, no keystroke logging.
            </li>
          </ul>
          <h3>Why, and on what basis</h3>
          <p>
            To run the assessment and to help the hiring company assess your application. Before you start, we ask for
            your consent to this, and record when you gave it and to which version of this notice. You can withdraw it
            at any time (see <a href="#rights">your rights</a>); that doesn’t affect what happened before.
          </p>
          <h3>How AI is used</h3>
          <p>
            AI transcribes your recordings and scores each answer against a fixed rubric written for the role, quoting
            your own words as evidence. It does not assess your accent, fluency or nerves. The AI recommends; people at
            the hiring company read the review and make every decision. If you would like a different format or a person
            to look at your answers instead, ask the hiring company.
          </p>
          <h3>Who sees it</h3>
          <p>
            The hiring team at the company that invited you. Proofwork’s staff only to keep the service running and to
            help when asked. The companies that host and process data for us are listed on our{' '}
            <Link to="/trust">trust page</Link>; they are in the United States, so your data is processed there. We
            never sell your data or use it to train AI models.
          </p>
          <h3>How long we keep it</h3>
          <ul>
            <li>
              Recordings: deleted {DEFAULT_RECORDING_DAYS} days after you finish, unless the hiring company chose a
              different period between {shortest} days and {longest === 365 ? 'a year' : `${longest} days`}. Your
              invitation shows the period that applies to you.
            </li>
            <li>Everything else: until the hiring company deletes it, or you withdraw and delete it yourself.</li>
            <li>Deleted data leaves our nightly backups within {BACKUP_DAYS} days.</li>
          </ul>
        </section>

        <section id="rights">
          <h2>Your rights</h2>
          <ul>
            <li>
              <strong>See your data.</strong> Open your invitation link and choose <em>Download my answers</em>. For the
              hiring company’s review of your answers, ask them.
            </li>
            <li>
              <strong>Withdraw and erase.</strong> From your invitation link, at any time, choose{' '}
              <em>Withdraw and delete my answers</em>. Everything you gave is deleted at once, and your application is
              withdrawn.
            </li>
            <li>
              <strong>Correct.</strong> Ask the hiring company, or email us.
            </li>
            <li>
              <strong>Nominate someone</strong> to use these rights for you if you can’t, by emailing us.
            </li>
            <li>
              <strong>Delete your candidate account</strong>, if you made one, from your account page.
            </li>
          </ul>
        </section>

        <section id="recruiters">
          <h2>If you’re hiring</h2>
          <p>
            We hold your name, work email, a hash of your password, your company name and what you create in Proofwork.
            Your workspace’s activity log records sign-ins (with the network address), security changes and actions such
            as invitations and decisions. We use this to provide the service, keep it secure and bill for it, under our
            agreement with your company. It is kept while your workspace exists; email us to close it. Our{' '}
            <Link to="/dpa">data processing agreement</Link> covers your candidates’ data.
          </p>
        </section>

        <section id="visitors">
          <h2>Visitors and cookies</h2>
          <p>
            We use no tracking cookies and no third-party analytics. Signing in sets one cookie that keeps you signed
            in; the demo keeps its sample data in your browser only. If you leave your email at the end of the demo, we
            use it only to follow up about Proofwork, and remove it when you ask. To slow down attacks, we briefly keep
            the network address of failed sign-ins, and we log errors with the page they happened on.
          </p>
        </section>

        <section id="contact">
          <h2>Contact and complaints</h2>
          <p>
            Email {mail} with any question, request or complaint; we answer as soon as we can and within the time the
            law requires. If you are not satisfied, you can complain to the Data Protection Board of India, or in the EU
            or UK to your local data protection authority.
          </p>
          <p className="doc-small">
            We’ll update this notice when what we do changes, and change the date at the top. Candidates who agreed to
            an earlier version are asked again on their next assessment.
          </p>
        </section>
      </article>
    </SiteLayout>
  );
}

// Data processing agreement --------------------------------------------------------------------

function Blank({ children }: { children: ReactNode }) {
  return <span className="doc-blank">[{children}]</span>;
}

export function DpaPage() {
  return (
    <SiteLayout title="Data processing agreement">
      <DocHead eyebrow="Data processing agreement" title="What we do with your candidates’ data, in writing.">
        <p>
          Our standard data processing agreement. Fill in the parts in brackets, sign, and send it to {mail}; we sign
          and send it back. Have your own counsel check it for where you hire.
        </p>
        <button type="button" className="lp-btn lp-btn-sm doc-print" onClick={() => window.print()}>
          Print or save as PDF
        </button>
      </DocHead>

      <article className="lp-wrap doc doc-legal">
        <p>
          This agreement is between <Blank>Customer legal name, address</Blank> (the “Customer”) and{' '}
          <Blank>Proofwork legal entity, address</Blank> (“Proofwork”), and forms part of the agreement under which
          Proofwork provides its hiring assessment service to the Customer (the “Agreement”). It applies from{' '}
          <Blank>date</Blank>.
        </p>

        <section>
          <h2>1. Roles</h2>
          <p>
            The Customer is the controller (or data fiduciary) of the personal data described in Annex 1, and Proofwork
            processes it on the Customer’s behalf as processor. Each party complies with the data protection law that
            applies to it, including, where they apply, the EU and UK GDPR and India’s Digital Personal Data Protection
            Act, 2023.
          </p>
        </section>

        <section>
          <h2>2. Instructions</h2>
          <p>
            Proofwork processes the personal data only to provide the service, on the Customer’s documented instructions
            (including the settings the Customer chooses in the service), unless the law requires otherwise, in which
            case Proofwork tells the Customer first unless the law forbids it. Proofwork does not sell the personal data
            or use it to train AI models.
          </p>
        </section>

        <section>
          <h2>3. Confidentiality and security</h2>
          <p>
            Everyone at Proofwork who can access the personal data is bound to keep it confidential. Proofwork keeps in
            place the measures in Annex 2, and may improve them but not reduce the overall protection.
          </p>
        </section>

        <section>
          <h2>4. Sub-processors</h2>
          <p>
            The Customer agrees to the sub-processors in Annex 3. Proofwork tells the Customer at least{' '}
            <Blank>30</Blank> days before adding or replacing one, and the Customer may object on reasonable grounds; if
            the parties can’t resolve it, the Customer may end the Agreement. Proofwork binds each sub-processor to data
            protection terms no less protective than these, and remains responsible for them.
          </p>
        </section>

        <section>
          <h2>5. Requests from people</h2>
          <p>
            The service lets the Customer export or delete everything about a candidate, and lets candidates download
            their answers or withdraw and delete them. Proofwork passes on any other request it receives and helps the
            Customer answer it.
          </p>
        </section>

        <section>
          <h2>6. Personal data breaches</h2>
          <p>
            Proofwork tells the Customer without undue delay, and within <Blank>48</Blank> hours, after becoming aware
            of a breach affecting the personal data, with what it knows and what it is doing, and keeps the Customer
            updated.
          </p>
        </section>

        <section>
          <h2>7. Help with compliance</h2>
          <p>
            Proofwork gives the Customer the information reasonably needed for impact assessments and consultations with
            authorities, and to show compliance with this agreement, including answering security questionnaires and, at
            most once a year with <Blank>30</Blank> days’ notice, an audit by the Customer or an independent auditor
            bound by confidentiality.
          </p>
        </section>

        <section>
          <h2>8. Transfers</h2>
          <p>
            The personal data is processed in the United States. Where the GDPR applies, the parties agree to the
            European Commission’s standard contractual clauses (module two, controller to processor), and for the UK the
            UK addendum, which are incorporated by reference. Proofwork does not transfer personal data to a country the
            Government of India restricts.
          </p>
        </section>

        <section>
          <h2>9. Retention, deletion and the end of the Agreement</h2>
          <p>
            Recordings are deleted after the period the Customer chooses ({shortest} to {longest} days;{' '}
            {DEFAULT_RECORDING_DAYS} by default). Other personal data is kept until the Customer deletes it. When the
            Agreement ends, the Customer can export its data, and Proofwork deletes the rest within <Blank>30</Blank>{' '}
            days, and from backups within a further {BACKUP_DAYS} days, unless the law requires it to be kept.
          </p>
        </section>

        <section>
          <h2>10. General</h2>
          <p>
            Liability under this agreement is subject to the limits in the Agreement. If this agreement and the
            Agreement conflict about personal data, this agreement wins.
          </p>
        </section>

        <section>
          <h2>Annex 1. The processing</h2>
          <dl className="doc-dl">
            <dt>People</dt>
            <dd>Candidates the Customer invites; the Customer’s users.</dd>
            <dt>Personal data</dt>
            <dd>
              Candidates: name, email, name on ID, written and spoken answers, recordings and their transcripts,
              scratchpad, timing, tab and paste activity, the AI review, team notes and decisions. Users: name, work
              email, sign-in activity and network address.
            </dd>
            <dt>Special categories</dt>
            <dd>None are asked for. Candidates’ voices are recorded but not used to identify them.</dd>
            <dt>Purpose</dt>
            <dd>Running practical assessments and AI-assisted reviews of candidates’ answers for the Customer.</dd>
            <dt>Duration</dt>
            <dd>The term of the Agreement, then as in section 9.</dd>
          </dl>
        </section>

        <section>
          <h2>Annex 2. Security measures</h2>
          <ul>
            <li>Encryption in transit (HTTPS with HSTS) for every connection.</li>
            <li>Passwords hashed with scrypt; session tokens stored only as hashes; optional two-factor sign-in.</li>
            <li>Sign-in rate limiting; strict Content Security Policy and security headers.</li>
            <li>Every request scoped to the signed-in workspace; candidate links are long random secrets.</li>
            <li>An activity log per workspace, and logging of errors.</li>
            <li>Nightly database backups kept for {BACKUP_DAYS} days.</li>
            <li>Automatic deletion of recordings after the Customer’s retention period.</li>
          </ul>
        </section>

        <section>
          <h2>Annex 3. Sub-processors</h2>
          <SubprocessorTable />
        </section>

        <div className="doc-sign">
          <div>
            <strong>For the Customer</strong>
            <span>Name, title, date, signature</span>
          </div>
          <div>
            <strong>For Proofwork</strong>
            <span>Name, title, date, signature</span>
          </div>
        </div>
      </article>
    </SiteLayout>
  );
}
