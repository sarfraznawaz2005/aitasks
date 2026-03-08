import { existsSync, copyFileSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export function performBackupIfNeeded(taskieDir: string): void {
  const dbPath = join(taskieDir, 'db.sqlite');
  const backupPath = join(taskieDir, 'db.sqlite.bak');
  const stampPath = join(taskieDir, 'last_backup');

  if (!existsSync(dbPath)) return;

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  let lastBackup = '';

  if (existsSync(stampPath)) {
    lastBackup = readFileSync(stampPath, 'utf8').trim();
  }

  if (lastBackup === today) return;

  try {
    copyFileSync(dbPath, backupPath);
    writeFileSync(stampPath, today, 'utf8');
  } catch {
    // Backup failure is non-fatal — continue normally
  }
}

export function restoreFromBackup(taskieDir: string): boolean {
  const dbPath = join(taskieDir, 'db.sqlite');
  const backupPath = join(taskieDir, 'db.sqlite.bak');

  if (!existsSync(backupPath)) return false;

  try {
    copyFileSync(backupPath, dbPath);
    return true;
  } catch {
    return false;
  }
}
