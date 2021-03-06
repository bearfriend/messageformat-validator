'use strict';

const crypto = require('crypto');
const parse = require('messageformat-parser').parse;
const pluralCats = require('make-plural/pluralCategories');
const { Reporter } = require('./reporter');

//const build = process.env.BUILD;//process.argv.includes('--build');

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
  //const finalReport = {};

  let sourceStrings;

  try {
    sourceStrings = locales[sourceLocale].parsed || JSON.parse(locales[sourceLocale].contents);
  }
  catch(e) {
    return [{
      locale: sourceLocale,
      parsed: false,
      _error: e
    }];
  }

  return Object.keys(locales).map((targetLocale) => {

    reporter = new Reporter(targetLocale, locales[targetLocale].contents);

    let targetStrings;
    try {
      targetStrings = locales[targetLocale].parsed || JSON.parse(locales[targetLocale].contents);
    }
    catch(e) {

      try {
        targetStrings = JSON.parse(locales[targetLocale].contents.trim());
      }
      catch(ee) {

        const column = Number(ee.message.split(' ').pop());

        reporter.error('json-parse-fatal', ee.message, { column });

        return [{
          locale: targetLocale,
          parsed: false,
          issues: reporter.issues || [],
          report: reporter.report,
          _error: ee
        }];
      }

      const column = Number(e.message.split(' ').pop());

      reporter.error('json-parse', e.message, { column });

    }

    const checkedKeys = [];

    Object.keys(targetStrings).forEach((key) => {

      checkedKeys.push(key);

      const target = targetStrings[key];//.replace(/\n/g,'\\n');
      const sourceString = sourceStrings[key] || '';//.replace(/\n/g,'\\n');

      let targetOptions = {},
        targetString;

      if (Array.isArray(target)) {
        targetString = target[0];
        targetOptions = target[1];
      }
      else {
        targetString = target;
      }

      reporter.config({ key, targetString, sourceString });

      if (!sourceString) reporter.error('extraneous', 'This string does not exist in the source file.');

      validateString({
        targetString,
        targetLocale,
        targetOptions,
        sourceString,
        sourceLocale
      });

    });

    const missingKeys = Object.keys(sourceStrings).filter(arg => !checkedKeys.includes(arg));

    if (missingKeys.length) {
      missingKeys.forEach((key) => {
        reporter.config({ key, sourceString: sourceStrings[key], targetString: '' });
        reporter.error('missing', `String missing from locale file.`)
      })
    }

    //console.log(`\nLocale report for "${reporter.locale}":`);
    //console.log(JSON.stringify(reporter.report, null, 2));

    /*
    Object.keys(reporter.report).forEach((key) => {
      finalReport[key] = finalReport[key] || 0;
      finalReport[key] += Object.values(reporter.report[key]).reduce((t,v) => t+v);
    });
    */

    return {
      locale: targetLocale,
      issues: reporter.issues || [],
      report: reporter.report,
      parsed: true
    }

  });

  //if (!build) console.log('\nFINAL REPORT:\n',JSON.stringify(finalReport, null, 2),'\n');
}

function validateString({ targetString, targetLocale, targetOptions, sourceString, sourceLocale }) {

  const re = /[\u2000-\u206F\u2E00-\u2E7F\n\r\\'!"#$%&()*+,\-.\/:;<=>?@\[\]^_`{|}~]/g; // eslint-disable-line

  if (sourceLocale
    && targetLocale !== sourceLocale
    && targetString.replace(re,'') === sourceString.replace(re,'')) {

    const sourceHash = crypto
      .createHash('sha1')
      .update(sourceString)
      .digest("base64");

    if (targetOptions.translated !== true || targetOptions.sourceHash !== sourceHash) {
      reporter.warning('untranslated', `String has not been translated.`)
    }

    return reporter.checks;
  }

  let parsedTarget;
  try {
    parsedTarget = Object.freeze(parse(targetString, pluralCats[targetLocale.split('-')[0]]));
  }
  catch(e) {

    if (e.message.indexOf('Invalid key') === 0) {
      const backtickCaptures = e.message.match(/`([^`]*)`/g);
      const badKey = backtickCaptures[0].slice(1, -1);
      const pluralArg = backtickCaptures[1].slice(1, -1)
      const column = targetString.indexOf(badKey, targetString.indexOf(`{${pluralArg}, plural, {`));
      reporter.error('plural-key', e.message, { column });
    }
    else if ((targetString.match(/{/g) || 0).length !== (targetString.match(/}/g) || 0).length) {
      //const charInstead = ''
      reporter.error('brace', 'Mismatched braces (i.e. {}). ' + e.message, { column: e.location.start.column });
    }
    else {
      reporter.error('parse', e.message, { column: e.location.start.column });
    }
  }

  if (parsedTarget) {

    const targetTokens = parsedTarget;
    let sourceTokens;

    try {
      sourceTokens = parse(sourceString, pluralCats[sourceLocale]);
    }
    catch(e) {
      reporter.error('source-error', 'Failed to parse source string.');
      return;
    }

    const targetMap = _map(targetTokens);
    const sourceMap = _map(sourceTokens);

    const argDiff = Array.from(targetMap.arguments).filter(arg => !Array.from(sourceMap.arguments).includes(arg));
    if (argDiff.length) {
      reporter.error('argument', `Unrecognized arguments ${JSON.stringify(argDiff)}`);
    }

    // remove all translated content, leaving only the messageformat structure
    const regx = new RegExp(targetMap.stringTokens.map(t => t.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')).join('|'), 'g');
    const structure = targetString.replace(regx, m => Array(m.length).fill(' ').join('')); // eslint-disable-line newline-per-chained-call

    const newlinePos = structure.indexOf(String.fromCharCode(10));
    if (newlinePos > -1) {
      reporter.warning('newline', 'String contains unnecessary newline(s).', { column: newlinePos });
    }

    const nbspPos = structure.indexOf(String.fromCharCode(160));
    if (nbspPos > -1) {
      reporter.error('nbsp', `String contains invalid non-breaking space at position ${nbspPos}.`, { column: nbspPos });
    }

    if (targetMap.cases.join(',') !== sourceMap.cases.join(',')) {
      const caseDiff = Array.from(targetMap.cases).filter(arg => !Array.from(sourceMap.cases).includes(arg));
      if (caseDiff.length) {
        reporter.error('case', `Unrecognized cases ${JSON.stringify(caseDiff)}`);
      }
      else {
        // TODO: better identify case order vs nesting order
        reporter.error('nest', `Nesting order does not match source. `);
      }
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
}

function _map(tokens, partsMap = { flatMap: [], arguments: new Set(), cases: [], stringTokens: [] }) {

  tokens.forEach((token) => {

    if (typeof token !== 'string') {

      if (token.arg) {
        partsMap.arguments.add(token.arg);
      }

      if (token.cases) {
        token.cases.forEach((case_) => {

          switch (token.type) {
            case 'select':

            partsMap.cases.push('|select|', case_.key);

            break;
            case 'plural':

            partsMap.cases.push('|plural|');

            break;
          }

          _map(case_.tokens, partsMap);
        });
      }
    }
    else {
      partsMap.stringTokens.push(token);
    }

  });

  return partsMap;

}

module.exports = {
  validateString,
  validateLocales
};
