import { redirect } from 'next/navigation';

export default function Home() {
  // In a real app, you would check for a valid session here.
  // For now, we redirect to login.
  redirect('/login');
}
