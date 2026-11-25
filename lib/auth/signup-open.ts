/** Public sign-up is off unless the owner sets NEXT_PUBLIC_SIGNUP_OPEN=true. */
export const SIGNUP_OPEN = process.env.NEXT_PUBLIC_SIGNUP_OPEN === 'true';
