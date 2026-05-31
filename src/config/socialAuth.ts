/**
 * Social OAuth provider enablement.
 *
 * Social auth button visibility. Google and Facebook are shown by default
 * and can be hidden with explicit env flags. Apple is hidden by default
 * because it is not currently enabled in Supabase Auth.
 *
 * To hide Google or Facebook, set the matching env var to "false" or "0":
 *   VITE_ENABLE_GOOGLE_AUTH=false
 *   VITE_ENABLE_FACEBOOK_AUTH=false
 *
 * To show Apple, set the matching env var to "true" at build time AND enable
 * that provider in the Supabase dashboard:
 *   VITE_ENABLE_APPLE_AUTH=true
 */

export type OAuthProvider = 'google' | 'facebook' | 'apple';

const isEnabled = (value: string | undefined): boolean =>
  value === 'true' || value === '1';

const isNotExplicitlyDisabled = (value: string | undefined): boolean =>
  value !== 'false' && value !== '0';

export const ENABLED_OAUTH_PROVIDERS: OAuthProvider[] = [
  isNotExplicitlyDisabled(import.meta.env.VITE_ENABLE_GOOGLE_AUTH) ? 'google' : null,
  isNotExplicitlyDisabled(import.meta.env.VITE_ENABLE_FACEBOOK_AUTH) ? 'facebook' : null,
  isEnabled(import.meta.env.VITE_ENABLE_APPLE_AUTH) ? 'apple' : null,
].filter((p): p is OAuthProvider => p !== null);
