import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, deleteDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCAOvfUmpytTA30lu0a3c-IYIvL8sk0Jmc",
  authDomain: "fruttein-b3a41.firebaseapp.com",
  projectId: "fruttein-b3a41",
  storageBucket: "fruttein-b3a41.firebasestorage.app",
  messagingSenderId: "278970143189",
  appId: "1:278970143189:web:5fa6462abdf907b38ead5c"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function resetAll() {
  console.log('🗑️  Menghapus semua data gkm_daily...');
  const snap = await getDocs(collection(db, 'gkm_daily'));
  if (snap.empty) { console.log('✅ Tidak ada data. Sudah bersih.'); process.exit(0); }

  let count = 0;
  for (const doc of snap.docs) {
    await deleteDoc(doc.ref);
    count++;
    console.log(`   Hapus: ${doc.id}`);
  }
  console.log(`\n✅ Selesai! ${count} dokumen dihapus.`);
  process.exit(0);
}

resetAll().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });
