import type { Config } from '@netlify/functions';
import { deleteOldRecordings } from '../../server/privacy';
import { runtime } from '../lib/runtime';

// Every night: delete recordings older than each workspace keeps them (180 days unless changed).
export default async () => {
  const { db, files } = runtime();
  let deleted = 0;
  // A few hundred at a time, well inside the function's time limit.
  for (let round = 0; round < 5; round++) {
    const done = await deleteOldRecordings(db, files, Date.now());
    deleted += done;
    if (done === 0) break;
  }
  console.log(`Deleted the recordings of ${deleted} candidate${deleted === 1 ? '' : 's'}`);
};

export const config: Config = { schedule: '43 3 * * *' };
