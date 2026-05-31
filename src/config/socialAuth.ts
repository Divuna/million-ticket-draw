/**
 * Social OAuth provider enablement.
 *
 * Providers are HIDDEN by default. A button is only shown when its provider
 * is both (a) listed here via an explicit env flag AND (b) actually enabled
 * in Supabase Auth. This prevents broken "provider is not enabled" buttons.
 *
 * To enable a provider, set the matching env var to "true" at build time
 * AND enable that provider in the Supabase dashboard:
 *   VITE_ENABLE_GOOGLE_AUTH=true
 *   VITE_ENABLE_FACEBOOK_AUTH=true
 *   VITE_ENABLE_APPLE_AUTH=true
 */

export type OAuthProvider = 'google' | 'facebook' | 'apple';

const isEnabled = (value: string | undefined): boolean =>
  value === 'true' || value === '1';

export const ENABLED_OAUTH_PROVIDERS: OAuthProvider[] = [
  isEnabled(import.meta.env.VITE_ENABLE_GOOGLE_AUTH) ? 'google' : null,
  isEnabled(import.meta.env.VITE_ENABLE_FACEBOOK_AUTH) ? 'facebook' : null,
  isEnabled(import.meta.env.VITE_ENABLE_APPLE_AUTH) ? 'apple' : null,
].filter((p): p is OAuthProvider => p !== null);
