import { getEngeznyFirestore } from './src/integrations/engezny/firebase';

async function main() {
  const db = getEngeznyFirestore();
  if (!db) {
    console.log('No DB');
    return;
  }
  const snap = await db.collection('orders').doc('MHS-NBHNCW2Z').get();
  console.log(snap.data());
  process.exit(0);
}
main();
