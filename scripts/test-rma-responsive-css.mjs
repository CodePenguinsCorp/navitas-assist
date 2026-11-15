import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Verifica contratos de CSS. Não mede layout, overflow ou estilos calculados.
const section = readFileSync('frontend/src/app/shared/collapsible-section/collapsible-section.component.css', 'utf8');
const rmas = readFileSync('frontend/src/app/pages/rmas/rmas.component.ts', 'utf8');
const mobile = section.slice(section.indexOf('@media (max-width: 480px)'));
assert.match(mobile, /\.collapsible__head\s*\{[^}]*flex-wrap:\s*wrap/);
assert.match(mobile, /\.collapsible__actions\s*\{[^}]*order:\s*1;[^}]*flex-basis:\s*100%/);
assert.match(mobile, /\.collapsible__title\s*\{[^}]*white-space:\s*normal;[^}]*overflow-wrap:\s*anywhere/);
assert.match(rmas, /\.rma-item-detail__header\s*\{[^}]*flex-wrap:\s*wrap/);
assert.match(rmas, /\.rma-item-warranties\s*\{[^}]*min-width:\s*0;[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
console.log('Contratos responsivos de CSS conferidos.');
