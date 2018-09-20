'use strict';

const requireDir = require('require-dir');
const locales = requireDir('./test/locales/json'); // TODO: make dynamic
const { validateLocales } = require('./src/validate');

Object.keys(locales).forEach(key => {
  locales[key] = JSON.stringify(locales[key]);
});

console.log(locales);

const issues = validateLocales({
  locales,
  sourceLocale: 'en'
});

console.log(JSON.stringify(issues, null, 2));
