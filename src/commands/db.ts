import { Command } from 'commander';
import chalk from 'chalk';
import { getDb, getTaskieDir, requireInitialized } from '../db/index.js';
import { join } from 'path';
import { existsSync, statSync } from 'fs';

export const dbCommand = new Command('db')
  .description('Database maintenance commands');

dbCommand
  .command('status')
  .description('Show database health and file size')
  .action(() => {
    requireInitialized();
    const taskieDir = getTaskieDir();
    const dbPath = join(taskieDir, 'db.sqlite');
    const walPath = join(taskieDir, 'db.sqlite-wal');
    const backupPath = join(taskieDir, 'db.sqlite.bak');

    const db = getDb();

    const integrity = (db.query('PRAGMA quick_check').get() as { quick_check: string }).quick_check;
    const walMode = (db.query('PRAGMA journal_mode').get() as { journal_mode: string }).journal_mode;
    const autoVac = (db.query('PRAGMA auto_vacuum').get() as { auto_vacuum: number }).auto_vacuum;
    const pageSize = (db.query('PRAGMA page_size').get() as { page_size: number }).page_size;
    const pageCount = (db.query('PRAGMA page_count').get() as { page_count: number }).page_count;

    const dbSize = existsSync(dbPath) ? statSync(dbPath).size : 0;
    const walSize = existsSync(walPath) ? statSync(walPath).size : 0;
    const backupSize = existsSync(backupPath) ? statSync(backupPath).size : 0;

    console.log('');
    console.log(chalk.bold('  Database Status'));
    console.log(chalk.dim('  ' + '─'.repeat(50)));
    console.log(`  Integrity     ${integrity === 'ok' ? chalk.green('ok') : chalk.red(integrity)}`);
    console.log(`  Journal mode  ${chalk.cyan(walMode)}`);
    console.log(`  Auto vacuum   ${autoVac === 2 ? chalk.green('incremental') : chalk.yellow(String(autoVac))}`);
    console.log(`  Page size     ${chalk.dim(String(pageSize) + ' bytes')}`);
    console.log(`  Pages         ${chalk.dim(String(pageCount))}`);
    console.log(`  DB size       ${chalk.dim(formatBytes(dbSize))}`);
    if (walSize > 0) {
      console.log(`  WAL size      ${chalk.dim(formatBytes(walSize))}`);
    }
    if (backupSize > 0) {
      console.log(`  Backup size   ${chalk.dim(formatBytes(backupSize))}`);
    }
    console.log('');
  });

dbCommand
  .command('checkpoint')
  .description('Flush WAL file into main database')
  .action(() => {
    requireInitialized();
    const db = getDb();
    const result = db.query('PRAGMA wal_checkpoint(TRUNCATE)').get() as {
      busy: number;
      log: number;
      checkpointed: number;
    };
    console.log('');
    if (result.busy) {
      console.log(chalk.yellow('  WAL checkpoint: busy (some readers active)'));
    } else {
      console.log(chalk.green(`  ✓  WAL checkpoint complete — ${result.checkpointed} pages`));
    }
    console.log('');
  });

dbCommand
  .command('vacuum')
  .description('Reclaim disk space (rewrites entire database — use rarely)')
  .action(() => {
    requireInitialized();
    const db = getDb();
    console.log(chalk.dim('  Running VACUUM... (may take a moment)'));
    db.exec('VACUUM;');
    console.log(chalk.green('  ✓  VACUUM complete'));
    console.log('');
  });

dbCommand
  .command('repair')
  .description('Run full integrity check and attempt repair from backup')
  .action(() => {
    requireInitialized();
    const db = getDb();
    console.log(chalk.dim('  Running integrity_check...'));
    const result = db.query('PRAGMA integrity_check').all() as { integrity_check: string }[];
    const issues = result.filter((r) => r.integrity_check !== 'ok');

    if (issues.length === 0) {
      console.log(chalk.green('  ✓  Database integrity: OK'));
    } else {
      console.log(chalk.red('  ✗  Integrity issues found:'));
      for (const issue of issues) {
        console.log(chalk.red(`    ${issue.integrity_check}`));
      }
      console.log(chalk.dim('\n  To restore from backup: delete db.sqlite and rename db.sqlite.bak to db.sqlite'));
    }
    console.log('');
  });

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
