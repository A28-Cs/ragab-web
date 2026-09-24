import postgres from 'postgres';
const passwords = ['postgres', 'admin', 'root', '1234', '123456', 'password', ''];
async function test() {
  for (const p of passwords) {
    try {
      const sql = postgres(`postgres://postgres:${p}@127.0.0.1:5432/postgres`, { max: 1, idle_timeout: 1 });
      await sql`SELECT 1`;
      console.log('SUCCESS with password:', p);
      process.exit(0);
    } catch (e) {
      console.log('FAILED:', p);
    }
  }
  console.log('All failed');
}
test();
