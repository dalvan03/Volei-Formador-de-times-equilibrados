import { backupDatabase } from './backup';
backupDatabase('before-deploy').catch(err => { console.error('Backup interrompido:', err.message); process.exitCode = 1; });
