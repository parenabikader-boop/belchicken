import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectImageType, ownsPhoto } from '../src/services/photo.service.js';

const pad = (head) => Buffer.concat([Buffer.from(head), Buffer.alloc(16)]);

test('detectImageType reconnaît JPEG, PNG et WebP par leur contenu', () => {
  assert.equal(detectImageType(pad([0xff, 0xd8, 0xff, 0xe0])), 'jpg');
  assert.equal(detectImageType(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'png');
  assert.equal(detectImageType(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(8)])), 'webp');
});

test('detectImageType refuse le reste (HEIC, PDF, texte, vide)', () => {
  assert.equal(detectImageType(Buffer.concat([Buffer.alloc(4), Buffer.from('ftypheic'), Buffer.alloc(8)])), null);
  assert.equal(detectImageType(pad(Buffer.from('%PDF-1.7'))), null);
  assert.equal(detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
  assert.equal(detectImageType(Buffer.alloc(0)), null);
  assert.equal(detectImageType(null), null);
});

test('ownsPhoto : seules les photos du dossier de ce serveur peuvent être supprimées', () => {
  assert.equal(ownsPhoto('belchicken/plats/abc', 'belchicken'), true);
  assert.equal(ownsPhoto('belchicken/plats/abc', 'belchicken-dev'), false); // photo du vrai site vue depuis le développement
  assert.equal(ownsPhoto('belchicken-dev/plats/abc', 'belchicken'), false);
  assert.equal(ownsPhoto('belchicken-dev/plats/abc', 'belchicken-dev'), true);
  assert.equal(ownsPhoto(null, 'belchicken'), false);
});
