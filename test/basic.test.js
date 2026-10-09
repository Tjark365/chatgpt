import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('package scripts exist',()=>{const p=JSON.parse(fs.readFileSync('package.json','utf8'));assert.ok(p.scripts.start);assert.ok(p.scripts['db:init']);});
test('billing requires webhook signature',()=>{const s=fs.readFileSync('server.js','utf8');assert.ok(s.includes('stripe.webhooks.constructEvent'));});
