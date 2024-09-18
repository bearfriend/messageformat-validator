import * as pluralCats from 'make-plural/pluralCategories'
import { Reporter } from './reporter.js';
import { parse } from 'messageformat-parser';

function getPluralCats(locale) {
  return pluralCats[locale.split('-')[0]] || pluralCats.en;
}

export const structureRegEx = /(?<=\s*){(.|\n)*?[{}]|\s*}(.|\n)*?[{}]|[{#]|(\s*)}/g;
let reporter;

export function validateLocales({ locales, sourceLocale }, localesReporter) {

  const sourceStrings = locales[sourceLocale].parsed;

  return Object.keys(locales).map((targetLocale) => {

    reporter = localesReporter ?? new Reporter(targetLocale, locales[targetLocale].contents);
    const targetStrings = locales[targetLocale].parsed;
    const checkedKeys = [];

    Object.keys(targetStrings).forEach(key => {

      checkedKeys.push(key);
      const targetString = targetStrings?.[key].val;
      const sourceString = sourceStrings?.[key]?.val || '';
      const overrides = Array.from(targetStrings?.[key].comment.matchAll(/mfv-(?<override>[a-z]+)/g)).map(m => m.groups.override)

      reporter.config(targetStrings[key], sourceStrings[key]);

      if (!sourceString) {
        reporter.error('extraneous', 'This string does not exist in the source file.');
      }
      else {
        if (locales[targetLocale].duplicateKeys.has(key)) reporter.error('duplicate-keys', 'Key appears multiple times');

        validateMessage({
          targetString,
          targetLocale,
          sourceString,
          sourceLocale,
          overrides
        }, reporter);
      }
    });

    const missingKeys = Object.keys(sourceStrings).filter(arg => !checkedKeys.includes(arg));

    if (missingKeys.length) {
      missingKeys.forEach((key) => {
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

export function validateMessage({ targetString, targetLocale, sourceString, sourceLocale, overrides }, msgReporter = reporter) {

  const re = /[\u2000-\u206F\u2E00-\u2E7F\n\r\\'!"#$%&()*+,\-.\/∕:;<=>?@\[\]^_`{|}~]/g; // eslint-disable-line

  if (sourceLocale
    && targetLocale.split('-')[0] !== sourceLocale.split('-')[0]
    && targetString.replace(re,'') === sourceString.replace(re,'')) {

      if (!overrides?.includes('translated')
        && sourceString
          .replace(structureRegEx, '')
          .replace(re,'')
          .replace(/\s/g, '')) {

        msgReporter.warning('untranslated', `String has not been translated.`);
      }
  }

  let parsedTarget;
  try {
    parsedTarget = Object.freeze(parse(targetString, getPluralCats(targetLocale)));
  }
  catch(e) {

    if (e.message.indexOf('Invalid key') === 0) {
      const backtickCaptures = e.message.match(/`([^`]*)`/g);
      const badKey = backtickCaptures[0].slice(1, -1);
      const pluralArg = backtickCaptures[1].slice(1, -1)
      const column = targetString.indexOf(badKey, targetString.indexOf(`{${pluralArg}, plural, {`));
      msgReporter.error('plural-key', e.message, { column });
    }
    else if ((targetString.match(/{/g) || 0).length !== (targetString.match(/}/g) || 0).length) {
      msgReporter.error('brace', 'Mismatched braces (i.e. {}). ' + e.message, { column: e.location.start.column });
    }
    else {
      msgReporter.error('parse', e.message, { column: e.location.start.column - 1 });
    }
  }

  if (parsedTarget) {

    const targetTokens = parsedTarget;
    let sourceTokens;

    try {
      sourceTokens = parse(sourceString, getPluralCats(sourceLocale));
    }
    catch(e) {
      msgReporter.error('source-error', 'Failed to parse source string.');
      return;
    }

    const checkCases = target => {
      target?.forEach(part => {
        if (['select', 'selectordinal', 'plural'].includes(part.type)) {
          const hasOther = part.cases.find(c => c.key.trim() === 'other');
          if (!hasOther) {
            msgReporter.error('other', 'Missing "other" case');
          }

          if (part.type !== 'select') {
            const pluralType = part.type.includes('ordinal') ? 'ordinal' : 'cardinal';
            const allowedCats = getPluralCats(targetLocale)[pluralType];
            const cats = part.cases.map(c => c.key);
            const missingCats = allowedCats.filter(c => c !== 'other' && !cats.includes(c));
            if (missingCats.length) msgReporter.warning('categories', `Missing categories: ${JSON.stringify(missingCats)}`);
          }
        }
        checkCases(target.cases);
      });
    };

    checkCases(parsedTarget);

    const targetMap = _map(targetTokens);
    const sourceMap = _map(sourceTokens);

    const argDiff = Array.from(targetMap.arguments).filter(arg => !Array.from(sourceMap.arguments).includes(arg));

    const badArgPos = targetString.indexOf(argDiff[0]);
    if (argDiff.length) {
      msgReporter.error('argument', `Unrecognized arguments ${JSON.stringify(argDiff)}`, { column: badArgPos });
    }

    // remove all translated content, leaving only the messageformat structure
    const structure = targetString.match(structureRegEx)?.join('') || '';

    const nbspPos = structure.indexOf(String.fromCharCode(160));
    if (nbspPos > -1) {
      msgReporter.error('nbsp', `String contains invalid non-breaking space at position ${nbspPos}.`, { column: nbspPos });
    }

    if (targetMap.cases.join(',') !== sourceMap.cases.join(',')) {

      const cleanTargetCases = targetMap.cases.map(c => c.replace(/.+(?<=\|(plural|selectordinal)\|).*/, ''));
      const cleanSourceCases = sourceMap.cases.map(c => c.replace(/.+(?<=\|(plural|selectordinal)\|).*/, ''));
      const caseDiff = cleanTargetCases.filter(arg => !cleanSourceCases.includes(arg));

      if (caseDiff.length) {
        msgReporter.error('case', `Unrecognized cases ${JSON.stringify(caseDiff.map(c => c.replace(/.+\|select\|/, '')))}`);
      }
      else if (targetMap.nested && targetMap.cases.length === sourceMap.cases.length) {
        // TODO: better identify case order vs nesting order
        msgReporter.warning('nest-order', `Nesting order does not match source.`);
      }
    }

    const firstPlural = targetMap.cases.findIndex(i => i.match(/^.+\|(plural|selectordinal)\|/)) + 1;
    const lastSelect = targetMap.cases.findLastIndex(i => i.match(/^.+\|select\|/)) + 1;

    if (targetMap.nested && firstPlural && lastSelect && firstPlural < lastSelect) {
      msgReporter.warning('nest-ideal', '"plural" and "selectordinal" should always nest inside "select".');
    }

    if (targetTokens.length > 1) {
      if (targetLocale == sourceLocale && targetTokens.find((token) => typeof token !== 'string' && token.type.match(/plural|select/))) {
        msgReporter.warning('split','String split by non-argument (e.g. select; plural).')
      }
    }
  }
}

export function parseLocales(locales, useJSONObj) {
  return locales.reduce((acc, { contents, file }) => {
    const locale = file.split('.')[0];
    acc[locale] = {
      contents,
      duplicateKeys: new Set(),
      parsed: {},
      file
    };

    const regex = useJSONObj
      //[                             ][  ][         "       ][   key   ][     "    ][             ][:][             ][        "       ][     value    ][        "        ][     ,    ][ // comment ]
      ? /("(?<realKey>.*)"(\s*):(\s*){)*\s+(?<keyQuote>["'`]?)(?<key>.*?)\k<keyQuote>(?<keySpace>\s*):(?<valSpace>\s*)(?<valQuote>["'`])(?<val>(.|\n)*?)(?<!\\)\k<valQuote>(?<comma>,?)(?<comment>.*)/g
      //[  ][         "       ][   key   ][     "    ][             ][:][             ][        "       ][     value    ][        "        ][     ,    ][ // comment ]
      : /\s+(?<keyQuote>["'`]?)(?<key>.*?)\k<keyQuote>(?<keySpace>\s*):(?<valSpace>\s*)(?<valQuote>["'`])(?<val>(.|\n)*?)(?<!\\)\k<valQuote>(?<comma>,?)(?<comment>.*)/g;
    const matches = Array.from(contents.matchAll(regex));

    let findContext = false;
    let findValue = false;

    matches.forEach(match => {

      if (useJSONObj) {
        if (findContext && match.groups.key === 'context') {
          acc[locale].parsed[findContext].comment = match.groups.val;
          findContext = false;
          return;
        }

        if (findValue && match.groups.key === 'translation') {
          acc[locale].parsed[findValue].val = match.groups.val;
          findValue = false;
          return;
        }

        if (match.groups.realKey) {

          if (match.groups.key === 'translation') {
            findContext = match.groups.realKey;
          }
          if (match.groups.key === 'context') {
            match.groups.comment = match.groups.val;
            findValue = match.groups.realKey;
          }

          match.groups.key = match.groups.realKey;
        }
      }

      if (!acc[locale].parsed[match.groups.key]) {
        acc[locale].parsed[match.groups.key] = Object.assign(String(match[0]), match.groups);
      }
      else {
        acc[locale].duplicateKeys.add(match.groups.key);
      }
    });
    return acc;
  }, {});
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
            case 'plural':
            case 'selectordinal':
            partsMap.cases.push(`${token.arg}|${token.type}|${case_.key}`);
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
