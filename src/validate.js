'use strict';

const crypto = require('crypto');
const parse = require('messageformat-parser').parse;
const pluralCats = require('make-plural/pluralCategories');
const { Reporter } = require('./reporter');

const structureRegEx = /(?<=\s*){(.|\n)*?[{}]|\s*}(.|\n)*?[{}]|[{#]|(\s*)}/g;
let reporter;

function validateLocales({ locales, sourceLocale }) {

  const sourceStrings = locales[sourceLocale].parsed;

  return Object.keys(locales).map((targetLocale) => {

    reporter = new Reporter(targetLocale, locales[targetLocale].contents);
    const targetStrings = locales[targetLocale].parsed;
    const checkedKeys = [];

    Object.keys(targetStrings).forEach(key => {

      checkedKeys.push(key);
      const targetString = targetStrings?.[key].val;
      const sourceString = sourceStrings?.[key]?.val || '';
      const overrides = Array.from(targetStrings?.[key].comment.matchAll(/mfv-(?<override>[a-z]+)/g)).map(m => m.groups.override)

      reporter.config(targetStrings[key], sourceStrings[key]);

      if (!sourceString) reporter.error('extraneous', 'This string does not exist in the source file.');

      validateString({
        targetString,
        targetLocale,
        sourceString,
        sourceLocale,
        overrides
      });

    });

    const missingKeys = Object.keys(sourceStrings).filter(arg => !checkedKeys.includes(arg));

    if (missingKeys.length) {
      missingKeys.forEach((key) => {
        const sourceString = sourceStrings?.[key]?.val || '';

        reporter.config(sourceStrings[key], sourceStrings[key]);
        reporter.error('missing', `String missing from locale file.`)
      })
    }

    return {
      locale: targetLocale,
      issues: reporter.issues || [],
      report: reporter.report,
      parsed: true
    }

  });
}

function validateString({ targetString, targetLocale, sourceString, sourceLocale, overrides }) {

  const re = /[\u2000-\u206F\u2E00-\u2E7F\n\r\\'!"#$%&()*+,\-.\/∕:;<=>?@\[\]^_`{|}~]/g; // eslint-disable-line

  if (sourceLocale
    && targetLocale !== sourceLocale
    && targetString.replace(re,'') === sourceString.replace(re,'')) {
      if (!overrides.includes('translated') && sourceString.replace(structureRegEx, '').replace(re,'').replace(/\s/g, '')) {
        reporter.warning('untranslated', `String has not been translated.`);
      }
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
    
    const badArgPos = targetString.indexOf(argDiff[0]);
    if (argDiff.length) {
      reporter.error('argument', `Unrecognized arguments ${JSON.stringify(argDiff)}`, { column: badArgPos });
    }

    // remove all translated content, leaving only the messageformat structure
    const structure = targetString.match(structureRegEx)?.join('') || '';

    const newlinePos = structure.indexOf(String.fromCharCode(10));
    if (newlinePos > -1) {
      reporter.warning('newline', 'String contains unnecessary newline(s).', { column: newlinePos });
    }

    const nbspPos = structure.indexOf(String.fromCharCode(160));
    if (nbspPos > -1) {
      reporter.error('nbsp', `String contains invalid non-breaking space at position ${nbspPos}.`, { column: nbspPos });
    }

    if (targetMap.cases.join(',') !== sourceMap.cases.join(',')) {
      const caseDiff = Array.from(targetMap.cases.map(c => c.replace(/(?<=\|plural\|).*/, ''))).filter(arg => !Array.from(sourceMap.cases).map(c => c.replace(/(?<=\|plural\|).*/, '')).includes(arg));
      if (caseDiff.length) {
        reporter.error('case', `Unrecognized cases ${JSON.stringify(caseDiff.map(c => c.replace('|plural|', '')))}`);
      }
      else if (targetMap.nested && targetMap.cases.length === sourceMap.cases.length) {
        // TODO: better identify case order vs nesting order
        reporter.error('nest', `Nesting order does not match source. `);
      }
    }

    const hasPlural = targetMap.cases.find(c => c.startsWith('|plural|'));
    const lastItem = targetMap.cases[targetMap.cases.length - 1];

    if (hasPlural && !lastItem.startsWith('|plural|')) {
      reporter.warning('nest', 'Plurals should always nest inside selects.');
    }

    if (targetTokens.length > 1) {

      if (targetLocale == sourceLocale && targetTokens.find((token) => typeof token !== 'string' && token.type.match(/plural|select/))) {
        reporter.warning('split','String split by non-argument (e.g. select; plural).')
      }
    }
  }
}

function _map(tokens, partsMap = { nested: false, arguments: new Set(), cases: [], stringTokens: [] }) {

  tokens.forEach(token => {

    if (typeof token !== 'string') {

      if (token.arg) {
        partsMap.arguments.add(token.arg);
      }

      if (token.cases) {

        if (partsMap.cases.length) {
          partsMap.nested = true;
        }

        token.cases.forEach((case_) => {

          switch (token.type) {
            case 'select':

            partsMap.cases.push('|select|', case_.key);

            break;
            case 'plural':

            partsMap.cases.push('|plural|' + case_.key);

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
  validateLocales,
  structureRegEx
};
