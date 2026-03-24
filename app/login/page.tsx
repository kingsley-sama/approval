import { redirect } from 'next/navigation';

// Legacy route - redirect to the new sign-in page
export default function LoginPage() {
  redirect('/sign-in');
}
