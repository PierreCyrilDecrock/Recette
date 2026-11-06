// Budget de poids du JavaScript (scripts/budget.mjs) : moins de 100 Ko compressé en gzip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUDGET, mesurer } from '../scripts/budget.mjs';

test('le JavaScript de l’app pèse moins de 100 Ko compressé', async () => {
  const { fichiers, total } = await mesurer();
  assert.ok(fichiers.some((f) => f.chemin === 'js/app.js'));
  assert.ok(fichiers.some((f) => f.chemin === 'sw.js'));
  assert.ok(total < BUDGET, `${total} octets compressés pour un budget de ${BUDGET}`);
});
