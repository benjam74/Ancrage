import 'fake-indexeddb/auto';
import { expect, test } from 'vitest';
import { seedEmptyAccount, seedIfEmpty } from '../../src/app/services';
import { createDexieRepo } from '../../src/storage/dexie-repo';
import { newId } from '../../src/core/ids';

test('an account with no cards gets its examples after the first sync; one with cards gets nothing', async () => {
  // Signed in on a new device: nothing seeded at boot.
  const empty = createDexieRepo(`seed-${newId()}`);
  await seedIfEmpty(empty, 0, 'none');
  expect(await seedEmptyAccount(empty, 'college5', 0)).toBe(true);
  expect((await empty.listNotes()).length).toBeGreaterThan(0);
  expect(await seedEmptyAccount(empty, 'college5', 0)).toBe(false);

  const full = createDexieRepo(`seed-${newId()}`);
  await seedIfEmpty(full, 0, 'coaching');
  const before = (await full.listNotes()).length;
  expect(await seedEmptyAccount(full, 'college5', 0)).toBe(false);
  expect((await full.listNotes()).length).toBe(before);
  expect(await seedEmptyAccount(createDexieRepo(`seed-${newId()}`), 'none', 0)).toBe(false);
});
