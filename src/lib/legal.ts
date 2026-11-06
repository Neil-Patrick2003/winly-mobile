import { openBrowserAsync, WebBrowserPresentationStyle } from 'expo-web-browser';

import { API_BASE_URL } from '@/lib/api';

/*
 * The Privacy Policy and the Terms live on the backend as plain web pages, so
 * the app stores, the sign-up screen and Settings all point at one copy of the
 * wording. Changing it there changes it everywhere, with no app release.
 */
const base = (API_BASE_URL ?? '').replace(/\/+$/, '');

export const PRIVACY_POLICY_URL = `${base}/privacy`;
export const TERMS_URL = `${base}/terms`;

/**
 * Open a legal page without leaving the app: an in-app browser sheet on a
 * phone, and a new tab on web so the form being filled in is not lost.
 */
export async function openLegalPage(url: string) {
  if (process.env.EXPO_OS === 'web') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }

  await openBrowserAsync(url, {
    presentationStyle: WebBrowserPresentationStyle.AUTOMATIC,
  });
}
