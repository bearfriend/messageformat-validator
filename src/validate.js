'use strict';

const parse = require('messageformat-parser').parse;
const pluralCats = require('make-plural/umd/pluralCategories');
const { Reporter } = require('./reporter');

const build = process.env.BUILD;//process.argv.includes('--build');

let reporter;

function validateLocales({ locales, sourceLocale }) {

  /*
  const targetResources = {};

  if (build) {
    Object.assign(targetResources, { en: localeResources.en });
  }
  else {
    Object.assign(targetResources, localeResources);
  }
  */

  const finalReport = {};
  const sourceStrings = JSON.parse(locales[sourceLocale]);

  return Object.keys(locales).map((targetLocale) => {

    reporter = new Reporter(targetLocale, locales[targetLocale]);
    const targetStrings = JSON.parse(locales[targetLocale]);

    const checkedKeys = [];

    Object.keys(targetStrings).forEach((key) => {

      checkedKeys.push(key);

      const targetString = targetStrings[key].replace(/\n/g,'\\n');
      const sourceString = sourceStrings[key].replace(/\n/g,'\\n');
      reporter.config({ key, targetString, sourceString });

      validateString({
        targetString,
        targetLocale,
        sourceString,
        sourceLocale
      });

    });

    const missingKeys = Object.keys(sourceStrings).filter(arg => !checkedKeys.includes(arg));

    if (missingKeys.length) {
      missingKeys.forEach((key) => {
        reporter.config({ key, target: '', source: sourceStrings[key] });
        reporter.error('missing', `String missing from locale file.`)
      })
    }

    //console.log(`\nLocale report for "${reporter.locale}":`);
    //console.log(JSON.stringify(reporter.report, null, 2));

    Object.keys(reporter.report).forEach((key) => {
      finalReport[key] = finalReport[key] || 0;
      finalReport[key] += Object.values(reporter.report[key]).reduce((t,v) => t+v);
    });

    return {
      locale: targetLocale,
      issues: reporter.issues || [],
      report: reporter.report
    }

  });

  //if (!build) console.log('\nFINAL REPORT:\n',JSON.stringify(finalReport, null, 2),'\n');
};

function validateString({ targetString, targetLocale, sourceString, sourceLocale }) {

  if (targetString.indexOf(/\n/g) > -1) {
    reporter.warning('newline', 'String contains newline(s). This is unnecessary and may affect error position reporting.');
  }

  if (sourceLocale && targetLocale != sourceLocale && targetString === sourceString) {
    reporter.warning('untranslated', `String has not been translated.`)
    return reporter.checks;
  }

  let parsedTarget;

  try {
    parsedTarget = Object.freeze(parse(targetString, pluralCats[targetLocale.split('-')[0]]));
  }
  catch(e) {

    if (e.message.indexOf('Invalid key') === 0) {
      reporter.error('plural-key', e.message, e);
    }
    else if ((targetString.match(/{/g) || 0).length !== (targetString.match(/}/g) || 0).length) {
      const charInstead = ''
      reporter.error('brace', 'Mismatched braces (i.e. {}). ' + e.message, e);
    }
    else {
      reporter.error('parse', e.message, e);
    }
  }

  if (parsedTarget) {

    const targetTokens = parsedTarget;
    const sourceTokens = parse(sourceString, pluralCats[sourceLocale]);

    const targetMap = _map(targetTokens);
    const sourceMap = _map(sourceTokens);

    const diff = Array.from(targetMap.arguments).filter(arg => !Array.from(sourceMap.arguments).includes(arg));

    if (diff.length) {
      reporter.error('argument', `Unrecognized arguments ${JSON.stringify(diff)}`);
    }

    if (targetString.indexOf(String.fromCharCode(160)) > -1) {
      reporter.warning('nbsp', 'String contains a non-breaking space.');
    }

    if (targetMap.cases.join(',') !== sourceMap.cases.join(',')) {
      reporter.error('case', 'Case or nesting order does not match.');
    }

    if (targetMap.cases.indexOf('select') > 0) {
      reporter.warning('nest', 'Plurals should always nest inside selects.');
    }

    if (targetTokens.length > 1) {

      if (targetLocale == sourceLocale && targetTokens.find((token) => typeof token !== 'string' && token.type.match(/plural|select/))) {
        reporter.warning('split','String split by non-argument (e.g. select; plural).')
      }
    }
  }

  return reporter.checks;

}

function _map(tokens, partsMap = { flatMap: [], arguments: new Set(), cases: [] }) {

  tokens.forEach((token) => {

    if (typeof token !== 'string') {

      if (token.arg) {
        partsMap.arguments.add(token.arg);
      }

      if (token.cases) {
        token.cases.forEach((case_) => {

          switch (token.type) {
            case 'select':

            partsMap.cases.push('select', case_.key);

            break;
            case 'plural':

            partsMap.cases.push('plural');

            break;
          }

          _map(case_.tokens, partsMap);
        });
      }
    }

  });

  return partsMap;

};

module.exports = {
  validateString,
  validateLocales
};
