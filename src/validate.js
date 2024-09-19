import { Reporter } from './reporter.js';
import { parse } from '@formatjs/icu-messageformat-parser';

const SELECT = 5;
const SELECTORDINAL = 6;
const PLURAL = 6;
const ARGUMENT = 1;

function getPluralCats(locale, pluralType) {
  return new Intl.PluralRules(locale, { type: pluralType }).resolvedOptions().pluralCategories;
}

export const structureRegEx = /(?<=\s*){(.|\n)*?[{}]|\s*}(.|\n)*?[{}]|[{#]|(\s*)}/g;
let reporter;

export function validateLocales({ locales, sourceLocale }, localesReporter) {

  const sourceMessages = locales[sourceLocale].parsed;

  return Object.keys(locales).map((targetLocale) => {

    reporter = localesReporter ?? new Reporter(targetLocale, locales[targetLocale].contents);
    const targetMessages = locales[targetLocale].parsed;
    const checkedKeys = [];

    Object.keys(targetMessages).forEach(key => {

      checkedKeys.push(key);
      const targetMessage = targetMessages?.[key].val;
      const sourceMessage = sourceMessages?.[key]?.val || '';
      const overrides = Array.from(targetMessages?.[key].comment.matchAll(/mfv-(?<override>[a-z]+)/g)).map(m => m.groups.override)


      reporter.config(targetMessages[key], sourceMessages[key]);

      if (!sourceMessage) {
        reporter.error('extraneous', 'Message does not exist in the source file.');
      }
      else {
        if (locales[targetLocale].duplicateKeys.has(key)) reporter.error('duplicate-keys', 'Key appears multiple times');

        validateMessage({
          targetMessage,
          targetLocale,
          sourceMessage,
          sourceLocale,
          overrides
        }, reporter);
      }
    });

    const missingKeys = Object.keys(sourceMessages).filter(arg => !checkedKeys.includes(arg));

    if (missingKeys.length) {
      missingKeys.forEach((key) => {
        reporter.config(sourceMessages[key], sourceMessages[key]);
        reporter.error('missing', `Message missing from locale file.`)
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

function checkNbsp(message, reporter) {
  const structure = message.match(structureRegEx)?.join('') || '';
  const nbspPos = structure.indexOf(String.fromCharCode(160));

  if (nbspPos > -1) {
    reporter.error('nbsp', `Message contains invalid non-breaking space at position ${nbspPos}.`, { column: nbspPos });
    return true;
  }
}

export function validateMessage({ targetMessage, targetLocale, sourceMessage, sourceLocale, overrides }, msgReporter = reporter) {

  const re = /[\u2000-\u206F\u2E00-\u2E7F\n\r\\'!"#$%&()*+,\-.\/∕:;<=>?@\[\]^_`{|}~]/g; // eslint-disable-line

  if (sourceLocale
    && targetLocale.split('-')[0] !== sourceLocale.split('-')[0]
    && targetMessage.replace(re,'') === sourceMessage.replace(re,'')) {

      if (!overrides?.includes('translated')
        && sourceMessage
          .replace(structureRegEx, '')
          .replace(re,'')
          .replace(/\s/g, '')) {

        msgReporter.warning('untranslated', `Message has not been translated.`);
      }
  }

  let parsedTarget;
  try {
    parsedTarget = Object.freeze(parse(targetMessage, { captureLocation: true, requiresOtherClause: false }));
  }
  catch(e) {
    if ((targetMessage.match(/{/g) || 0).length !== (targetMessage.match(/}/g) || 0).length) {
      msgReporter.error('brace', 'Mismatched braces', { column: e.location.start.column });
    }
    else if (!checkNbsp(targetMessage, msgReporter)) {
      if (e.message === 'EXPECT_SELECT_ARGUMENT_OPTIONS') {
        msgReporter.error('parse', `Expected "," but "${e.originalMessage.substr(e.location.start.column, 1)}" found`, { column: e.location.start.column - 1 });
      }
      else {
        msgReporter.error('parse', e.message, { column: e.location.start.column - 1 });
      }
    }
  }

  if (parsedTarget) {

    const targetTokens = parsedTarget;
    let sourceTokens;

    try {
      sourceTokens = parse(sourceMessage, { requiresOtherClause: false });
    }
    catch(e) {
      msgReporter.error('source-error', 'Failed to parse source message.');
      return;
    }

    const checkCases = (target, msg) => {
      target?.forEach(part => {
        if ([SELECT, PLURAL].includes(part.type)) {
          if (!part.options.other) {
            msgReporter.error('other', 'Missing "other" option');
          }

          if (part.type === PLURAL) {
            const supportedCats = getPluralCats(targetLocale, part.pluralType);
            const cats = Object.keys(part.options);
            const missingCats = supportedCats.filter(c => c !== 'other' && !cats.includes(c));
            if (missingCats.length) msgReporter.warning('categories', `Missing categories: ${JSON.stringify(missingCats)}`);
            const unsupportedCats = cats.filter(c => !supportedCats.includes(c));

            unsupportedCats.forEach(cat => {
              const column = part.options[cat].location.start.offset;
              msgReporter.error('categories', `Unsupported category "${cat}". Must be one of: "${supportedCats.join('", "')}", or explicit keys like "=0"`, { column });
            });
          }

          Object.values(part.options).forEach(o => {
            checkCases(o.value, msg);
          });
        }
      });
    };

    checkCases(parsedTarget, targetMessage);

    const targetMap = _map(targetTokens);
    const sourceMap = _map(sourceTokens);

    const argDiff = Array.from(targetMap.arguments).filter(arg => !Array.from(sourceMap.arguments).includes(arg));

    const badArgPos = targetMessage.indexOf(argDiff[0]);
    if (argDiff.length) {
      msgReporter.error('argument', `Unrecognized arguments: ${argDiff.join(', ')}. Must be one of: ${Array.from(sourceMap.arguments).join(', ')}`, { column: badArgPos });
    }

    checkNbsp(targetMessage, msgReporter);

    if (targetMap.cases.join(',') !== sourceMap.cases.join(',')) {

      const cleanTargetCases = targetMap.cases.map(c => c.replace(/.+(?<=\|(6(ordinal|cardinal))\|).*/, ''));
      const cleanSourceCases = sourceMap.cases.map(c => c.replace(/.+(?<=\|(6(ordinal|cardinal))\|).*/, ''));
      const optionDiff = cleanTargetCases.filter(arg => !cleanSourceCases.includes(arg));

      optionDiff.forEach(o => {
        msgReporter.error('option', `Unrecognized option "${o.replace(/.+\|5undefined\|/, '')}". Must be one of "${cleanSourceCases.map(o => o.replace(/.+\|5undefined\|/, '')).join('", "')}".`);
      });

      if (targetMap.nested && targetMap.cases.length === sourceMap.cases.length) {
        // TODO: better identify case order vs nesting order
        msgReporter.warning('nest-order', `Nesting order does not match source.`);
      }
    }

    const firstPlural = targetMap.cases.findIndex(i => i.match(/^.+\|(6(ordinal|cardinal))\|/)) + 1;
    const lastSelect = targetMap.cases.findLastIndex(i => i.match(/^.+\|5undefined\|/)) + 1;

    if (targetMap.nested && firstPlural && lastSelect && firstPlural < lastSelect) {
      msgReporter.warning('nest-ideal', '"plural" and "selectordinal" should always nest inside "select".');
    }

    if (targetTokens.length > 1) {
      if (targetLocale == sourceLocale && targetTokens.find((token) => typeof token !== 'string' && [PLURAL, SELECT].includes(token.type))) {
        msgReporter.warning('split','Message split by complex argument')
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
      //[                               ][  ][         "       ][   key   ][     "    ][             ][:][             ][        "       ][     value    ][                    "                    ][     ,    ][ // comment ]
      ? /("(?<realKey>.*)"(\s*):(\s*)\{)*\s+(?<keyQuote>["'`]?)(?<key>.*?)\k<keyQuote>(?<keySpace>\s*):(?<valSpace>\s*)(?<valQuote>["'`])(?<val>(.|\n)*?)(?<!\\)\k<valQuote>(?!\s?([\w\p{L}]|\k<valQuote>))(?<comma>,?)(?<comment>.*)/g
      //[  ][         "       ][   key   ][     "    ][             ][:][             ][        "       ][     value    ][                    "                    ][     ,    ][ // comment ]
      : /\s+(?<keyQuote>["'`]?)(?<key>.*?)\k<keyQuote>(?<keySpace>\s*):(?<valSpace>\s*)(?<valQuote>["'`])(?<val>(.|\n)*?)(?<!\\)\k<valQuote>(?!\s?([\w\p{L}]|\k<valQuote>))(?<comma>,?)(?<comment>.*)/g;
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

function _map(ast, partsMap = { nested: false, arguments: new Set(), cases: [], messageTokens: [] }) {

  ast.forEach(token => {

    if (typeof token !== 'string') {

      if (token.type === ARGUMENT) {
        partsMap.arguments.add(token.value);
      }

      if (token.options) {

        if (partsMap.cases.length) {
          partsMap.nested = true;
        }

        Object.entries(token.options).forEach(([k, option]) => {
          switch (token.type) {
            case SELECT:
            case PLURAL:
            partsMap.cases.push(`${token.value}|${token.type}${token.pluralType}|${k}`);
            break;
          }

          _map(option.value, partsMap);
        });
      }
    }
    else {
      partsMap.messageTokens.push(token);
    }

  });

  return partsMap;
}
