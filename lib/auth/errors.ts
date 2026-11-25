export type AuthErrorCode =
  | 'link_expired'
  | 'link_used'
  | 'wrong_browser'
  | 'auth_callback_failed';

type AuthErrorLike = { message?: string; code?: string; status?: number } | null | undefined;

/** Maps a Supabase auth error to the four reasons the login screen can name. */
export function authErrorCode(error: AuthErrorLike): AuthErrorCode {
  const text = `${error?.code ?? ''} ${error?.message ?? ''}`.toLowerCase();
  if (/pkce|code verifier|flow.?state/.test(text)) return 'wrong_browser';
  if (/already been used|already used|consumed/.test(text)) return 'link_used';
  if (/expired|otp_expired/.test(text)) return 'link_expired';
  return 'auth_callback_failed';
}

/** Plain words for each code. Names what happened and the next step. */
export const AUTH_ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  link_expired: 'That sign-in link has expired. Enter your email and ask for a new one.',
  link_used: 'That sign-in link was already used. Enter your email and ask for a new one.',
  wrong_browser:
    'That link has to be opened in the same browser where you asked for it. Ask for a new one here and open it on this device.',
  auth_callback_failed: 'We could not sign you in with that link. Enter your email and ask for a new one.',
};

export function isAuthErrorCode(v: string | null): v is AuthErrorCode {
  return v !== null && v in AUTH_ERROR_MESSAGES;
}
