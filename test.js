'use strict';

const fs = require('fs');
//const requireDir = require('require-dir');
//const locales = requireDir('./test/locales/json/bigfiles'); // TODO: make dynamic
const { validateLocales } = require('./src/validate');

/*
Object.keys(locales).forEach(key => {
  locales[key] = JSON.stringify(locales[key], null, 2);
});
*/

const locales = {
  en: fs.readFileSync('./test/locales/json/bigfiles/en.json', 'utf8'),
  fr: fs.readFileSync('./test/locales/json/bigfiles/fr.json', 'utf8'),
  ar: fs.readFileSync('./test/locales/json/bigfiles/ar.json', 'utf8'),
  es: fs.readFileSync('./test/locales/json/bigfiles/es.json', 'utf8')
}


const issues = validateLocales({
  locales,
  sourceLocale: 'en'
});

console.log(JSON.stringify(issues, null, 2)); // eslint-disable-line no-console
