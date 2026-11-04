import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(process.argv[2]);
db.exec('BEGIN');
db.prepare('SELECT id FROM attempts').all();
process.send('LOCKED');
setTimeout(() => {
  db.exec('ROLLBACK');
  db.close();
  process.disconnect();
}, 500);
