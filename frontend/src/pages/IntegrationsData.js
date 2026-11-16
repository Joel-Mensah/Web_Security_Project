// src/pages/IntegrationsPage.jsx — part 1: helpers (provider cards + status)
import {
  BsGoogle, BsGithub, BsMicrosoft, BsSlack, BsPersonLock,
} from 'react-icons/bs';
import { CiCode } from 'react-icons/ci';

export const PROVIDER_CARDS = [
  {
    id: 'google',
    name: 'Google',
    blurb: 'Sign in with Google and sync your workspace identity.',
    icon: <BsGoogle />,
    gradient: 'from-red-500 via-amber-500 to-emerald-500',
  },
  {
    id: 'github',
    name: 'GitHub',
    blurb: 'Link repos and developer identity for security reviews.',
    icon: <BsGithub />,
    gradient: 'from-slate-700 via-slate-900 to-black',
  },
  {
    id: 'microsoft',
    name: 'Microsoft 365',
    blurb: 'Connect Entra ID for corporate single sign-on.',
    icon: <BsMicrosoft />,
    gradient: 'from-sky-500 via-blue-600 to-indigo-700',
  },
  {
    id: 'slack',
    name: 'Slack',
    blurb: 'Get incident alerts in your security channel.',
    icon: <BsSlack />,
    gradient: 'from-fuchsia-500 via-purple-600 to-indigo-600',
  },
  {
    id: 'custom_saml',
    name: 'Enterprise SSO / SAML',
    blurb: 'Custom SAML identity provider for regulated tenants.',
    icon: <BsPersonLock />,
    gradient: 'from-indigo-500 via-cyan-500 to-emerald-500',
  },
];

export function maskAccountId(value) {
  const s = String(value || '');
  if (s.length <= 8) return s;
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}
