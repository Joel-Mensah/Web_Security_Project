import { useRef, useState } from 'react';
import { Bot, MessageCircle, Send, X } from 'lucide-react';
import { Link } from 'react-router-dom';

const TOPICS = [
  {
    keywords: ['report incident', 'submit report', 'new report', 'file a report', 'report a'],
    answer: 'Open Incident reports and choose New report. Add a clear description, select a category and severity, then submit. You will see a confirmation when the report is saved.',
    link: '/incidents',
    linkLabel: 'Open incident reports',
  },
  {
    keywords: ['edit report', 'change report', 'update report', 'edit incident'],
    answer: 'Open your report from Incident reports and choose Edit. You can edit it until a responder sends a public reply or an administrator records a referral.',
    link: '/incidents',
    linkLabel: 'View your reports',
  },
  {
    keywords: ['reply', 'chat', 'message', 'respond', 'conversation'],
    answer: 'Open the incident to see its conversation. Write your message in the box below the conversation and select Send message. Administrators can also send a public reply or add a private note for incident managers.',
    link: '/incidents',
    linkLabel: 'Open incident reports',
  },
  {
    keywords: ['screenshot', 'evidence', 'attach', 'upload'],
    answer: 'You can attach up to three PNG, JPEG, or WebP screenshots to an incident report. Each file must be 5 MB or smaller. Do not attach passwords, authentication codes, or unrelated personal information.',
    link: '/incidents',
    linkLabel: 'Create or view a report',
  },
  {
    keywords: ['status', 'track', 'progress', 'investigation', 'referred', 'authority'],
    answer: 'Open the incident report to view its status and activity. A referral entry records that an administrator referred it for investigation. The site does not send the report to an outside authority.',
    link: '/incidents',
    linkLabel: 'Check incident reports',
  },
  {
    keywords: ['password', 'login', 'sign in', 'locked out', 'two factor', '2fa', 'verification code'],
    answer: 'Use the sign-in page to log in. If you forgot your password, choose the password recovery option. Never share your password or verification code in an incident report or chat.',
    link: '/login',
    linkLabel: 'Go to sign in',
  },
  {
    keywords: ['user management', 'manage users', 'users', 'account'],
    answer: 'Managers and administrators can open User Management from the sidebar. The options shown there depend on your assigned role.',
    link: '/users',
    linkLabel: 'Open user management',
  },
  {
    keywords: ['security law ghana', 'ghana legal', 'ghana law', 'cyberlaw ghana', 'data protection act', 'convicted of', 'high treason', 'contempt of court', 'criminal offence', 'criminal'],
    answer: 'Ghana is a constitutional democracy. Its security and criminal law sits on top of the 1992 Constitution (Chapter 11 protects freedom and independence of the media; Article 19 sets out fundamental human rights and freedom). The Criminal Offences Act, 1960 (Act 29) and the Criminal and Other Offences (Procedure) Act, 1960 (Act 30) are the main criminal statutes. The Data Protection Act, 2012 (Act 843) governs how personal data and privacy are handled. The Data Protection Commission (DPC) is the regulator under Act 843. The Judicial Service publishes the Acts of Ghana and the Constitution of Ghana 1992 for public reference. I do not give legal advice; for specific legal questions, consult a qualified legal professional.',
    link: 'https://judicial.gov.gh/index.php/the-constitution',
    linkLabel: 'Read the 1992 Constitution of Ghana',
  },
  {
    keywords: ['criminal offences', 'criminal law', 'criminal off', 'convicted', 'imprisonment', 'penal', 'inquest', 'high treason', 'treason', 'contempt of court', 'doubt of', 'disturbance', 'riot', 'security'],
    answer: 'Security-related offences in Ghana are prosecuted under statutes such as the Criminal Offences Act, 1960 (Act 29) and the Criminal and Other Offences (Procedure) Act, 1960 (Act 30). These laws prescribe offences and criminal procedure. Criminal liability generally requires proof that an act was committed intentionally or recklessly as required by law. The 1992 Constitution protects fundamental human rights and freedoms, which limit how criminal law and state action may be exercised. I do not give legal advice; for specific legal questions, consult a qualified legal professional.',
    link: 'https://repository.parliament.gh/items/375bb5c3-da9c-43fe-bd2a-bb9b307d5ceb',
    linkLabel: 'Read the Criminal Offences Act, 1960 (Act 29)',
  },
  {
    keywords: ['data protection', 'data privacy', 'personal data', 'privacy', 'dpc', 'data breach', 'data controller', 'data processor', 'confidentiality', 'confidential'],
    answer: 'Ghana protects personal data and privacy mainly through the Data Protection Act, 2012 (Act 843). The Data Protection Commission (DPC) is the independent regulator established under Act 843. It enforces data protection laws through registration, training, compliance checks, audits, and supporting complaints by data subjects. Organisations that handle personal data generally must register with the DPC and follow data protection principles for lawfulness, fairness, and security. I do not give legal advice; for specific legal questions, consult a qualified legal professional.',
    link: 'https://dataprotection.org.gh/',
    linkLabel: 'Data Protection Commission — official site',
  },
  {
    keywords: ['right to information', 'freedom of information', 'foi', 'access to information', 'rTI', 'information request', 'information'],
    answer: 'Ghana has a Right to Information law that gives people the right to access recorded information held by public authorities. The Right to Information Manual is published by the Office of the Attorney-General and Ministry of Justice as a practical guide. Requests are usually made in writing to the public authority holding the record; fees may apply. I do not give legal advice; for specific legal questions, consult a qualified legal professional.',
    link: 'https://mojagd.gov.gh/publications',
    linkLabel: 'Office of the AG & MoJ — publications (incl. RTI Manual)',
  },
  {
    keywords: ['cybercrime', 'cyber security', 'computer misuse', 'hacking', 'online', 'internet', 'network security', 'security of information', 'ethical hack'],
    answer: 'Computer misuse and cyber-related offences in Ghana are addressed through Ghana\u2019s cyber laws and the broader Criminal Offences Act, 1960 (Act 29). Under the 1992 Constitution, the security of the state, public safety, and the prevention of crime are lawful grounds for restricting certain rights and activities, but only as permitted by law. The Attorney-General and Ministry of Justice provides legal opinions and prosecutes offences. I do not give legal advice; for specific legal questions, consult a qualified legal professional.',
    link: 'https://mojagd.gov.gh/',
    linkLabel: 'Office of the Attorney-General & Ministry of Justice',
  },
];

const SUGGESTIONS = [
  'How do I submit a report?',
  'Can I edit my report?',
  'How do I reply to an incident?',
  'What files can I attach?',
  'What is Ghana\u2019s cyber law?',
  'How do I protect personal data?',
];

function getReply(question) {
  const normalized = question.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const match = TOPICS.find(topic => topic.keywords.some(keyword => normalized.includes(keyword)));
  if (match) return match;
  return {
    answer: 'I can help with incident reports, editing, replies, evidence, report status, sign-in, user management, and Ghana\u2019s security and cyber law. I do not give legal advice. Try one of the example questions, or ask your administrator for help with something else.',
  };
}

export default function HelpBot() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([
    {
      id: 0,
      from: 'bot',
      text: 'Hi. I can help you use the incident reporting site. What do you need help with?',
    },
  ]);
  const nextId = useRef(1);
  const messagesEnd = useRef(null);

  const ask = (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const reply = getReply(trimmed);
    setMessages(current => [
      ...current,
      { id: nextId.current++, from: 'user', text: trimmed },
      { id: nextId.current++, from: 'bot', text: reply.answer, link: reply.link, linkLabel: reply.linkLabel },
    ]);
    setQuestion('');
    requestAnimationFrame(() => messagesEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }));
  };

  return (
    <div className="fixed bottom-5 right-5 z-[60]">
      {open && (
        <section
          className="mb-3 flex h-[min(34rem,calc(100dvh-7rem))] w-[min(22rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-white/10 bg-navy-950 shadow-2xl"
          aria-label="Help bot"
          aria-live="polite"
        >
          <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300">
              <Bot className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-white">Site help</h2>
              <p className="text-xs text-slate-400">Answers common site questions</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"
              aria-label="Close help"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
            {messages.map(message => (
              <div key={message.id} className={`flex ${message.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm leading-5 ${
                  message.from === 'user'
                    ? 'bg-emerald-500/20 text-emerald-50'
                    : 'border border-white/10 bg-white/5 text-slate-200'
                }`}>
                  <p className="whitespace-pre-wrap">{message.text}</p>
                  {message.link && (
                    <Link
                      to={message.link}
                      onClick={() => setOpen(false)}
                      className="mt-2 inline-block text-xs font-semibold text-emerald-300 underline underline-offset-2 hover:text-emerald-200"
                    >
                      {message.linkLabel}
                    </Link>
                  )}
                </div>
              </div>
            ))}
            {messages.length === 1 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {SUGGESTIONS.map(suggestion => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => ask(suggestion)}
                    className="rounded-full border border-white/10 px-3 py-1.5 text-left text-xs text-slate-300 hover:border-emerald-400/40 hover:text-white"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
            <div ref={messagesEnd} />
          </div>

          <form
            className="flex items-center gap-2 border-t border-white/10 p-3"
            onSubmit={event => {
              event.preventDefault();
              ask(question);
            }}
          >
            <label className="sr-only" htmlFor="help-question">Ask a question</label>
            <input
              id="help-question"
              value={question}
              onChange={event => setQuestion(event.target.value)}
              className="form-input min-w-0 py-2.5"
              placeholder="Ask a question..."
              maxLength={300}
            />
            <button
              type="submit"
              disabled={!question.trim()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Send question"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
          <p className="px-3 pb-3 text-[10px] text-slate-500">Questions stay in this browser and are not sent to a service.</p>
        </section>
      )}

      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="ml-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-950/40 transition-transform hover:scale-105 hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:ring-offset-2 focus:ring-offset-navy-900"
        aria-label={open ? 'Close site help' : 'Open site help'}
        aria-expanded={open}
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>
    </div>
  );
}
