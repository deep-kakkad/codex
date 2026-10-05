import type { Config } from '@netlify/functions';
import { netlifyBackupStore, runBackup } from '../../server/backup';
import { runtime } from '../lib/runtime';

// Every night: a copy of the database in Netlify Blobs, kept for two weeks.
export default async () => {
  const key = await runBackup(runtime().db, netlifyBackupStore(), Date.now());
  console.log(`Backed up the database to ${key}`);
};

export const config: Config = { schedule: '17 2 * * *' };
