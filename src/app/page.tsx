import { redirect } from 'next/navigation';

export default function Home() {
  // Let the /chat route handle the authentication check.
  // It will redirect to /login if the user is not authenticated.
  redirect('/chat');
}
