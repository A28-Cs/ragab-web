import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

try {
  const app = initializeApp({ projectId: 'ragab-490cc' });
  const auth = getAuth(app);
  console.log('Success');
} catch (e) {
  console.error(e);
}
