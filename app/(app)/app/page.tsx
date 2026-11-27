import { redirect } from 'next/navigation';

// /app has no page of its own; a bare visit lands on the dashboard instead of a 404.
export default function AppIndex() {
  redirect('/app/dashboard');
}
