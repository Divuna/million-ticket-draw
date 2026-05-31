export type OAuthProvider = "google" | "apple" | "facebook";

const SUPPORTED_OAUTH_PROVIDERS: OAuthProvider[] = ["google", "apple", "facebook"];

const enabledProviderNames = new Set(
  ((import.meta.env.VITE_ENABLED_OAUTH_PROVIDERS as string | undefined) ?? "")
    .split(",")
    .map((provider) => provider.trim().toLowerCase())
    .filter(Boolean)
);

export const enabledOAuthProviders = SUPPORTED_OAUTH_PROVIDERS.filter((provider) =>
  enabledProviderNames.has(provider)
);
