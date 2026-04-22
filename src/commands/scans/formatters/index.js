/**
 * Formatter registry.
 * Contract: { name, mime, extension, render(envelope) → string }
 * Add a new format = drop a file in formatters/ + one line here.
 */
import json  from './json.js';
import sarif from './sarif.js';
import csv   from './csv.js';
import md    from './md.js';
import table from './table.js';

export const FORMATTERS = { json, sarif, csv, md, table };
