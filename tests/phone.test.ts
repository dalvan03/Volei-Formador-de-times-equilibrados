import test from 'node:test';
import assert from 'node:assert/strict';
import { formatPhone } from '../src/utils/phone';

test('telefone ganha máscara progressiva, aceita colagem e limita a 11 dígitos', () => {
  assert.equal(formatPhone(''), '');
  assert.equal(formatPhone('5'), '(5');
  assert.equal(formatPhone('51'), '(51');
  assert.equal(formatPhone('519'), '(51) 9');
  assert.equal(formatPhone('519990'), '(51) 9990');
  assert.equal(formatPhone('5199906'), '(51) 9990-6');
  assert.equal(formatPhone('51999063747'), '(51) 99906-3747');
  assert.equal(formatPhone('(51) 99906-3747'), '(51) 99906-3747');
  assert.equal(formatPhone('5199906374799'), '(51) 99906-3747');
  assert.equal(formatPhone('5133334444'), '(51) 3333-4444');
  assert.equal(formatPhone('abc'), '');
});
