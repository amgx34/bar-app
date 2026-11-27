export const resolveSupportEmail = (value: string | undefined) => value?.trim() || 'railsystemspos@gmail.com';

/** The one address users are told to write to. next.config.ts inlines SUPPORT_EMAIL so client components match the server. */
export const SUPPORT_EMAIL = resolveSupportEmail(process.env.SUPPORT_EMAIL);
