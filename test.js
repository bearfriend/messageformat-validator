'use strict';

const requireDir = require('require-dir');
const locales = requireDir('./test/locales/json'); // TODO: make dynamic
const { validateLocales } = require('./src/validate');

const checks = validateLocales({
  locales,
  sourceLocale: 'en'
});

console.log(JSON.stringify(checks, null, 2));
