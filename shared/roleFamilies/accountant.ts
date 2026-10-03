import type { Block, RoleFamily, StageContext, Variant } from '../types';
import { n, s } from '../variants';
import { ADAPTS, FICTIONAL_CALLOUT, NEXT_STEPS, aiAllowedStage, pastWorkStage, warmupStage } from './common';

const COMPANIES = [
  { company: 'Vardhman Packaging', business: 'a packaging manufacturer' },
  { company: 'Greenway Interiors', business: 'an office interiors company' },
  { company: 'Shakti Agro Exports', business: 'a spice exporter' },
] as const;

const VENDORS = ['Patel Corrugators', 'Sunrise Logistics', 'Metro Printing Works'];
const CUSTOMERS = ['Orion Retail', 'Kumar Traders', 'Lakshmi Stores', 'Apex Distributors'];

const OPTIONS = [
  { id: 'pay', label: 'Pay the new invoice in full now to keep the supplier happy' },
  { id: 'net', label: 'Pay the new invoice minus the duplicate amount, with a statement of account' },
  { id: 'hold', label: 'Hold all payments to them until they refund the duplicate' },
  { id: 'escalate', label: 'Escalate to the finance manager and pay nothing today' },
];

/** The reconciling items: bank closing = ledger closing + uncleared cheque − charges − duplicate receipt + unrecorded receipt. */
export function reconMath(v: Variant) {
  const ledger = n(v, 'ledgerClose');
  const bank = ledger + n(v, 'unclearedCheque') - n(v, 'bankCharges') - n(v, 'dupReceipt') + n(v, 'unrecordedReceipt');
  return { ledger, bank, difference: bank - ledger };
}

const money = (ctx: StageContext, key: string) => ctx.fmt.money(n(ctx.variant, key));

export const accountant: RoleFamily = {
  id: 'accountant',
  version: 1,
  name: 'Accountant (AP / AR)',
  roles: ['Accounts Executive', 'Accounts Payable Executive', 'Accounts Receivable Executive', 'Junior Accountant'],
  catalog: {
    function: 'Finance',
    seniority: ['Entry', 'Mid'],
    industries: ['Any', 'Retail', 'Services'],
    skills: ['Numbers', 'Judgement', 'Writing'],
    keywords: [
      'accounts',
      'AP',
      'AR',
      'bank reconciliation',
      'Tally',
      'month-end close',
      'collections',
      'bookkeeping',
      'CA inter',
    ],
  },
  summary:
    'Month-end close: reconcile the bank against the books, spot a supplier paid twice, decide how to handle that supplier’s next invoice, and fix a collection email that would anger a good customer.',

  warmups: [
    'What is something you double-check before you trust it?',
    'Tell us about a time you found a mistake someone else had missed.',
    'How do you keep track of money in your own life?',
  ],

  generate(rng, currency) {
    const inr = currency === 'INR';
    const co = rng.pick(COMPANIES);
    const k = inr ? 1 : 0.012;
    const r = (x: number) => Math.round(x * k);
    const [vendorQ, vendorP] = [rng.pick(VENDORS), VENDORS[0]];
    return {
      ...co,
      vendorQ,
      vendorP: vendorP === vendorQ ? VENDORS[1] : vendorP,
      vendorS: VENDORS[2] === vendorQ ? VENDORS[1] : VENDORS[2],
      customerA: CUSTOMERS[0],
      customerB: CUSTOMERS[1],
      customerC: CUSTOMERS[2],
      customerLate: CUSTOMERS[3],
      ledgerClose: r(rng.int(1600, 2400) * 1000 + rng.int(0, 999)),
      receiptA: r(rng.int(180, 260) * 1000),
      chequeP: r(rng.int(60, 120) * 1000),
      chequePNo: rng.int(4400, 4480),
      dupPayment: r(rng.int(80, 140) * 1000 + rng.int(0, 9) * 100),
      invQ: rng.int(2030, 2060),
      unclearedCheque: r(rng.int(40, 90) * 1000),
      unclearedChequeNo: rng.int(4481, 4499),
      bankCharges: r(rng.int(12, 38) * 100 + 90),
      dupReceipt: r(rng.int(50, 110) * 1000),
      unrecordedReceipt: r(rng.int(70, 150) * 1000),
      newInvoice: r(rng.int(150, 240) * 1000),
      overdueAmount: r(rng.int(300, 520) * 1000),
      paidLastWeek: r(rng.int(60, 110) * 1000),
      overdueDays: rng.pick([62, 68, 75]),
      creditDays: 30,
    };
  },

  brief(ctx) {
    const v = ctx.variant;
    const recon = reconMath(v);
    const dup = money(ctx, 'dupPayment');
    return [
      {
        type: 'p',
        text: `You're an accounts executive at **${s(v, 'company')}**, ${s(v, 'business')}. It's month-end. The bank balance and the books don't match, and the finance manager wants the reconciliation today.`,
      },
      {
        type: 'table',
        caption: 'Closing balances, 31st',
        columns: ['Source', 'Balance'],
        rows: [
          ['Books (bank ledger)', ctx.fmt.money(recon.ledger)],
          ['Bank statement', ctx.fmt.money(recon.bank)],
        ],
      },
      {
        type: 'table',
        caption: 'Bank statement, last week of the month',
        columns: ['Date', 'Description', 'Out', 'In'],
        rows: [
          ['26th', `NEFT from ${s(v, 'customerA')}`, '—', money(ctx, 'receiptA')],
          ['27th', `Cheque ${n(v, 'chequePNo')} to ${s(v, 'vendorP')}`, money(ctx, 'chequeP'), '—'],
          ['28th', `NEFT to ${s(v, 'vendorQ')}, ref INV-${n(v, 'invQ')}`, dup, '—'],
          ['29th', `NEFT to ${s(v, 'vendorQ')}, ref INV${n(v, 'invQ')}`, dup, '—'],
          ['30th', 'Bank charges and GST on charges', money(ctx, 'bankCharges'), '—'],
          ['31st', `NEFT from ${s(v, 'customerB')}`, '—', money(ctx, 'unrecordedReceipt')],
        ],
      },
      {
        type: 'table',
        caption: 'Bank ledger in your books, same week',
        columns: ['Date', 'Entry', 'Paid', 'Received'],
        rows: [
          ['26th', `Receipt: ${s(v, 'customerA')}`, '—', money(ctx, 'receiptA')],
          ['27th', `Cheque ${n(v, 'chequePNo')}: ${s(v, 'vendorP')}`, money(ctx, 'chequeP'), '—'],
          ['28th', `Payment: ${s(v, 'vendorQ')}, INV-${n(v, 'invQ')}`, dup, '—'],
          ['29th', `Payment: ${s(v, 'vendorQ')}, INV${n(v, 'invQ')}`, dup, '—'],
          ['30th', `Cheque ${n(v, 'unclearedChequeNo')}: ${s(v, 'vendorS')}`, money(ctx, 'unclearedCheque'), '—'],
          ['31st', `Receipt: ${s(v, 'customerC')}`, '—', money(ctx, 'dupReceipt')],
          ['31st', `Receipt: ${s(v, 'customerC')}`, '—', money(ctx, 'dupReceipt')],
        ],
      },
      {
        type: 'p',
        text: `${s(v, 'customerC')} sent one payment on the 31st; the receipt was keyed in twice. Earlier weeks are already reconciled.`,
      },
      { type: 'callout', text: FICTIONAL_CALLOUT },
    ];
  },

  stages: [
    warmupStage(),
    {
      id: 'reconcile',
      kind: 'scenario',
      title: 'Reconcile the bank',
      summary:
        'Match a bank statement against the books: an uncleared cheque, unbooked charges, a receipt keyed twice and one not booked; plus a supplier paid twice. Think aloud.',
      timeLimitSec: 420,
      voiceMaxSec: 180,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: '**Explain the difference between the bank and the books, item by item, and list the entries you would pass.** Is there anything else here the finance manager needs to know?',
        },
      ],
      reviewerGuide: (ctx) => {
        const v = ctx.variant;
        const recon = reconMath(v);
        return [
          { type: 'p', text: `Difference to explain: bank − books = ${ctx.fmt.money(recon.difference)}.` },
          {
            type: 'list',
            items: [
              `+ ${money(ctx, 'unclearedCheque')}: cheque ${n(v, 'unclearedChequeNo')} to ${s(v, 'vendorS')} not yet cleared (timing; no entry).`,
              `− ${money(ctx, 'bankCharges')}: bank charges not booked (entry: bank charges expense, credit bank).`,
              `− ${money(ctx, 'dupReceipt')}: ${s(v, 'customerC')} receipt keyed twice (reverse one).`,
              `+ ${money(ctx, 'unrecordedReceipt')}: receipt from ${s(v, 'customerB')} not booked (entry: debit bank, credit ${s(v, 'customerB')}).`,
            ],
          },
          {
            type: 'p',
            text: `**Beyond the reconciliation:** ${s(v, 'vendorQ')} was paid ${money(ctx, 'dupPayment')} twice for the same invoice (INV-${n(v, 'invQ')} and INV${n(v, 'invQ')}). It reconciles because both are in the books, but it is money to recover. Strong candidates flag it; weak ones say "reconciled" and stop.`,
          },
        ];
      },
      rubric: [
        {
          id: 'items',
          label: 'Finds the reconciling items',
          weight: 2,
          anchors: [
            "Can't explain the difference.",
            'Finds one or two items.',
            'Finds all four with the right direction.',
            'Finds all four, signs correct, and shows they add up to the difference.',
          ],
        },
        {
          id: 'duplicate',
          label: 'Spots the duplicate payment',
          weight: 1,
          anchors: [
            'Misses it.',
            'Notices something odd.',
            'Spots the duplicate payment.',
            'Spots it and how to recover it.',
          ],
        },
        {
          id: 'entries',
          label: 'Correct entries',
          weight: 1,
          anchors: [
            'None or wrong.',
            'Partly right.',
            'Right entries for charges, duplicate receipt and missing receipt.',
            'Right, and knows the cheque needs no entry.',
          ],
        },
      ],
      followUps: () => [
        'How would you stop the same invoice being paid twice again?',
        'What would you do if the uncleared cheque was still uncleared three months later?',
      ],
    },
    {
      id: 'supplier-call',
      kind: 'decision',
      title: 'The supplier calls',
      summary:
        'A key supplier paid twice wants their next invoice paid in full. Tests judgement and firmness. Think aloud.',
      timeLimitSec: 300,
      voiceMaxSec: 150,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      choices: OPTIONS,
      prompt: (ctx) => [
        {
          type: 'p',
          text: `${s(ctx.variant, 'vendorQ')} calls about their new invoice of ${money(ctx, 'newInvoice')}: "Pay today or we stop deliveries. The extra payment? We'll adjust it later." They supply materials your factory needs every week.`,
        },
        { type: 'p', text: '**What do you do?** Pick one, then say what you tell them and what you put in writing.' },
      ],
      reviewerGuide: (ctx) => {
        const v = ctx.variant;
        return [
          {
            type: 'p',
            text: `Netting is the strongest: pay ${ctx.fmt.money(n(v, 'newInvoice') - n(v, 'dupPayment'))} (the new invoice minus the ${money(ctx, 'dupPayment')} duplicate), send a statement of account showing both payments, and confirm in writing. It keeps supplies flowing and recovers the money. Paying in full on a verbal "later" promise risks never getting it back. Holding everything risks supply. Escalating is fine if they still respond to the supplier today.`,
          },
        ];
      },
      rubric: [
        {
          id: 'judgement',
          label: 'Protects money and supply',
          weight: 2,
          anchors: [
            'Pays in full on a verbal promise, or blocks everything.',
            'Defensible but one-sided.',
            'Recovers the money without stopping supply.',
            'Recovers it, documents it, and keeps the relationship.',
          ],
        },
        {
          id: 'writing',
          label: 'Puts it in writing',
          weight: 1,
          anchors: [
            'Nothing written.',
            'Mentions writing.',
            'A statement of account or email confirming the netting.',
            'Clear written record with invoice numbers and amounts.',
          ],
        },
      ],
      followUps: (_ctx, answer) => [
        `You chose "${answer.choiceLabel ?? 'your option'}". What exactly would you say on the phone?`,
        'Who should approve a payment that differs from the invoice?',
      ],
    },
    {
      id: 'next-week',
      kind: 'branch',
      title: 'The following week',
      summary: 'What their choice led to. Tests follow-through and ownership.',
      timeLimitSec: 300,
      voiceMaxSec: 120,
      preferVoice: true,
      scored: true,
      dependsOn: 'supplier-call',
      prompt: (ctx) => {
        const v = ctx.variant;
        const byChoice: Record<string, Block[]> = {
          pay: [
            {
              type: 'p',
              text: `${s(v, 'vendorQ')} hasn't adjusted the duplicate. When asked, their accountant says they "can't find" a second payment and asks for proof. Your auditor is in next week.`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          net: [
            {
              type: 'p',
              text: `${s(v, 'vendorQ')}'s sales manager complains to your purchase head that you "short-paid" them. The purchase head asks you why you didn't check with him first.`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          hold: [
            {
              type: 'p',
              text: `${s(v, 'vendorQ')} stopped deliveries. The factory manager says production stops in two days without their material and is furious with Accounts.`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          escalate: [
            {
              type: 'p',
              text: "The finance manager was travelling and didn't reply for two days. Deliveries are paused, and the supplier says nobody from your side called back.",
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
        };
        return byChoice[ctx.choices['supplier-call'] ?? 'net'] ?? byChoice.net;
      },
      reviewerGuide: (ctx) => {
        const guides: Record<string, string> = {
          pay: 'Strong: send bank proof (both UTR numbers and statement lines), a statement of account, and ask for a credit note or refund by a date; flag it for the auditor. Weak: waits.',
          net: 'Strong: show the purchase head the evidence calmly, agree to loop him in next time, and keep the recovery. Weak: reverses the netting.',
          hold: 'Strong: release the undisputed payment immediately (net of the duplicate) to restart supply, and own the call with the factory manager. Weak: keeps holding.',
          escalate:
            'Strong: own the delay, call the supplier, make a decision within their authority (net payment) or find another approver. Weak: keeps waiting.',
        };
        const choice = ctx.choices['supplier-call'] ?? 'net';
        return [
          { type: 'p', text: `They chose **${OPTIONS.find((o) => o.id === choice)?.label ?? choice}**.` },
          { type: 'p', text: guides[choice] ?? guides.net },
        ];
      },
      rubric: [ADAPTS, NEXT_STEPS],
      followUps: () => ['What would you change in the payment process?', 'How would you explain this to the auditor?'],
    },
    {
      id: 'collection-email',
      kind: 'critique',
      title: 'Check a collection email',
      summary:
        'A collection email that threatens legal action, asks for an invoice already paid and gives no invoice details. Think aloud.',
      timeLimitSec: 360,
      voiceMaxSec: 150,
      preferVoice: false,
      thinkAloud: true,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: 'A junior drafted this to a good customer who is overdue. **Name the problems, worst first, and what each could cost.** Then write the version you would send.',
        },
      ],
      material: (ctx) => {
        const v = ctx.variant;
        return [
          {
            type: 'p',
            text: `Account: ${s(v, 'customerLate')}. Outstanding ${money(ctx, 'overdueAmount')}, including an invoice of ${money(ctx, 'paidLastWeek')} they paid last week (not yet applied in the ledger). Credit terms: ${n(v, 'creditDays')} days. Oldest invoice: ${n(v, 'overdueDays')} days.`,
          },
          { type: 'h', text: 'Draft email (CC: their CEO)' },
          {
            type: 'quote',
            text: `Dear Sir/Madam,\n\nWe hope you are doing well. Your account is seriously overdue. You owe us ${money(ctx, 'overdueAmount')}. If this is not paid within 48 hours, we will stop supplies and take legal action, and charge 24% interest.\n\nRegards,\nAccounts Team`,
          },
        ];
      },
      reviewerGuide: (ctx) => {
        const v = ctx.variant;
        return [
          { type: 'p', text: 'Planted problems:' },
          {
            type: 'list',
            items: [
              `**Wrong amount:** it includes the ${money(ctx, 'paidLastWeek')} invoice they already paid. The correct amount is ${ctx.fmt.money(n(v, 'overdueAmount') - n(v, 'paidLastWeek'))}. Asking a good customer for money they've paid damages trust.`,
              "**Threats with no basis:** legal action and 24% interest aren't in the agreed terms, and copying their CEO escalates before any reminder.",
              "**No detail:** no invoice numbers, dates or amounts, so they can't check or pay quickly.",
            ],
          },
          {
            type: 'p',
            text: 'Decoy: the polite opening line is fine. A strong rewrite lists invoices, confirms the earlier payment, asks for a payment date and offers a call.',
          },
        ];
      },
      rubric: [
        {
          id: 'critical',
          label: 'Catches the real problems',
          weight: 2,
          anchors: [
            'Misses the wrong amount.',
            'Catches one problem.',
            'Catches the wrong amount and the threats.',
            'Catches all three and why they matter with a good customer.',
          ],
        },
        {
          id: 'rewrite',
          label: 'The rewrite',
          weight: 1,
          anchors: [
            'Missing or still threatening.',
            'Polite but vague.',
            'Correct amount, invoice list, clear ask.',
            'Correct, firm but warm, with a payment date asked for.',
          ],
        },
        {
          id: 'severity',
          label: 'Orders by impact',
          weight: 1,
          anchors: [
            'Decoy first.',
            'Unexplained.',
            'Sensible order.',
            'Ordered by damage to the relationship and cash, explained.',
          ],
        },
      ],
      followUps: () => [
        'When would you escalate to their CEO, if ever?',
        "How would you track which payments haven't been applied yet?",
      ],
    },
    aiAllowedStage({
      id: 'reminder',
      title: 'A payment reminder (AI allowed)',
      summary: 'Write a firm, polite reminder with AI. Catches invented late fees and legal threats.',
      timeLimitSec: 420,
      task: (ctx) => [
        {
          type: 'p',
          text: `Write the reminder to ${s(ctx.variant, 'customerLate')} (under 120 words) for the corrected overdue amount, asking for a payment date. Their terms are ${n(ctx.variant, 'creditDays')} days; there is no interest or late fee in the agreement.`,
        },
      ],
      guide: (ctx) => [
        {
          type: 'p',
          text: `Correct amount: ${ctx.fmt.money(n(ctx.variant, 'overdueAmount') - n(ctx.variant, 'paidLastWeek'))}. No interest or legal threats (not in the agreement).`,
        },
        {
          type: 'p',
          text: 'AI drafts typically add "late payment charges", "legal action" or a fake deadline. Did the candidate remove them and use the right amount?',
        },
      ],
      accuracy: {
        id: 'accuracy',
        label: 'Correct and within terms',
        weight: 1,
        anchors: [
          'Wrong amount or invented penalties.',
          'Mostly right.',
          'Right amount, no invented terms.',
          'Right amount, invoice detail and a clear ask.',
        ],
      },
      usable: {
        id: 'usable',
        label: 'Ready to send',
        weight: 1,
        anchors: ['Rude or long.', 'Usable with edits.', 'Polite and firm.', 'Would get a payment date back.'],
      },
    }),
    pastWorkStage({
      id: 'found-error',
      title: 'An error you found',
      summary: 'A real accounting error they found or fixed. Checks specificity and ownership.',
      question: 'Tell us about an accounting error you found or fixed.',
    }),
  ],
};
