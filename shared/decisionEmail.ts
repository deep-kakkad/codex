import type { Decision } from './types';

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

/** Used when AI is unavailable; the recruiter edits it anyway. */
export function templateEmail(
  decision: Decision,
  info: { candidateName: string; title: string; orgName: string; senderName: string },
): { subject: string; body: string } {
  const hi = `Hi ${firstName(info.candidateName)},`;
  const sign = `Best,\n${info.senderName}\n${info.orgName}`;
  if (decision === 'advance') {
    return {
      subject: `Next step for the ${info.title} role`,
      body: `${hi}\n\nThank you for working through the ${info.title} assessment. We enjoyed reading your answers and would like to talk about them with you.\n\nCould you pick a time that suits you here: [link to book a time]\n\n${sign}`,
    };
  }
  if (decision === 'hold') {
    return {
      subject: `Your ${info.title} application`,
      body: `${hi}\n\nThank you for completing the ${info.title} assessment. We're still hearing from other candidates, so we haven't decided yet. You'll hear from us by [date].\n\n${sign}`,
    };
  }
  return {
    subject: `Your ${info.title} application`,
    body: `${hi}\n\nThank you for the time you put into the ${info.title} assessment. We've decided not to move forward with your application this time.\n\nWe appreciated the care in your answers, and we wish you the best with your search.\n\n${sign}`,
  };
}
