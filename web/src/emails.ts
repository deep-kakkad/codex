/** Ready-to-send emails a recruiter copies or opens in their own mail app. Nothing is sent from Proofwork. */

export interface EmailDraft {
  subject: string;
  body: string;
}

interface InviteFacts {
  candidateName: string;
  title: string;
  orgName: string;
  senderName: string;
  minutes: number;
  link: string;
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

export function inviteEmail(f: InviteFacts): EmailDraft {
  return {
    subject: `Next step for the ${f.title} role at ${f.orgName}`,
    body: [
      `Hi ${firstName(f.candidateName)},`,
      '',
      `Thanks for your interest in the ${f.title} role at ${f.orgName}. The next step is a short practical assessment: a realistic work situation you work through one question at a time. It takes about ${f.minutes} minutes, and you can do it whenever suits you in the next few days.`,
      '',
      'A few questions ask you to think aloud, so find a quiet spot with a microphone. One question lets you use any AI tool you like.',
      '',
      `Start here: ${f.link}`,
      '',
      'Best,',
      f.senderName,
      f.orgName,
    ].join('\n'),
  };
}

export function reminderEmail(f: InviteFacts & { started: boolean }): EmailDraft {
  return {
    subject: f.started ? `Finish your ${f.title} assessment` : `Reminder: your ${f.title} assessment at ${f.orgName}`,
    body: [
      `Hi ${firstName(f.candidateName)},`,
      '',
      f.started
        ? `You've started the ${f.title} assessment. You can pick up where you left off with the same link: ${f.link}`
        : `A quick reminder about the ${f.title} assessment. It takes about ${f.minutes} minutes and you can start whenever suits you: ${f.link}`,
      '',
      'If anything is getting in the way, just reply and let me know.',
      '',
      'Best,',
      f.senderName,
      f.orgName,
    ].join('\n'),
  };
}

export function mailtoHref(to: string, email: EmailDraft) {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;
}

const EMAIL_RE = /[^\s,;<>"']+@[^\s,;<>"']+\.[^\s,;<>"']+/;

/**
 * People from pasted lines or a CSV: one per line, an email anywhere in it and
 * the rest as the name. Lines without an email (like a header row) are reported.
 */
export function parsePeople(input: string): { people: { name: string; email: string }[]; ignored: string[] } {
  const people: { name: string; email: string }[] = [];
  const ignored: string[] = [];
  for (const raw of input.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const match = line.match(EMAIL_RE);
    if (!match) {
      ignored.push(line);
      continue;
    }
    const name = line
      .replace(match[0], ' ')
      .split(/[,;\t]/)
      .map((part) => part.replace(/^["'\s<>]+|["'\s<>]+$/g, '').trim())
      .filter(Boolean)
      .join(' ')
      .trim();
    people.push({ name: name || match[0].split('@')[0], email: match[0] });
  }
  return { people, ignored };
}

/** A CSV cell, quoted when it needs to be. */
export function csvCell(value: string) {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function downloadCsv(filename: string, rows: string[][]) {
  const text = rows.map((row) => row.map(csvCell).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
