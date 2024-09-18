import { hoistSelectors } from '@formatjs/icu-messageformat-parser/manipulator.js';
import { parse } from '@formatjs/icu-messageformat-parser';
import * as pluralCats from 'make-plural/pluralCategories';
import cldr from 'cldr';

function getPluralCats(locale) {
  return pluralCats[locale.split('-')[0]] || pluralCats.en;
}

function expandASTHashes(ast, parentValue) {
  if (Array.isArray(ast)) {
    ast.map(ast => expandASTHashes(ast, parentValue));
  }

  if (ast.type === 7) { // #
    ast.type = 1;
    ast.value = parentValue;
  }
  else if (ast.type === 6) { // plural, selectordinal
    expandASTHashes(Object.values(ast.options).map(o => o.value), ast.value);
  }
}

export function formatMessage(msg, options = {}) {
  let ast;
  try {
    ast = parse(msg.replace(/'/g, "'''"), { requiresOtherClause: false });
  } catch(err) {
    try {
      alteredMsg = msg.replace('\'{', '’{');
      ast = parse(msg.replace(/'/g, "'''"), { requiresOtherClause: false });
      msg = alteredMsg;
    } catch(err2) {
      if (err.location) {
        console.log(`\nERROR: ${err.message}`);
        console.log(`\tLocale: ${options.locale}`);
        console.log(`\tKey: ${options.key}`);
        console.log(`\tOriginal message: ${err.originalMessage}`);
        console.log('\tAt or near:', msg.slice(err.location.start.offset, Math.max(err.location.end.offset, err.location.start.offset + 4)));
      } else {
        console.log(err);
        console.log(`\tLocale: ${options.locale}`);
        console.log(`\tKey: ${options.key}`);
      }
      return msg;
    }
  }
  if (options.expandHashes) {
    expandASTHashes(ast);
  }
  try {
	ast = hoistSelectors(ast);
  } catch(e) {
    console.log(e);
  }

	return printAST(ast, {
    useNewlines: options.newlines ?? msg.includes('\n'),
    add: options.add ?? false,
    remove: options.remove ?? false,
    dedupe: options.dedupe ?? false,
    trim: options.trim ?? false,
    collapse: options.collapse ?? false,

    locale: options.locale,
    args: options.source ? [...new Set(options.source.match(/(?<=[\{<])[^,\{\}<>]+(?=[\}>,])/g))] : []
  }, options.baseTabs);
}

function normalizeArgName(argName, availableArgs) {
  if (!availableArgs.includes(argName)) {
    if (availableArgs.length === 1) {
      return availableArgs[0];
    } else {
      return availableArgs.find(a => a.toLowerCase() === argName.toLowerCase()) ?? argName;
    }
  }
  return argName;
}

function printAST(ast, options, level = 0) {
  const {
    locale,
    swapOne = new Set(),
    useNewlines = false,
    add = false,
    remove = false,
    dedupe = false,
    trim = false,
    collapse = false,
    args = []
  } = options;

	if (Array.isArray(ast)) {
    const swapOneClone = new Set(swapOne);
    ast.forEach(a => a.type === 1 && swapOneClone.delete(a.value))

    const delimiters = (() => {
      try {
        return cldr.extractDelimiters(locale);
      } catch(err) {
        return cldr.extractDelimiters(locale.split('-')[0]);
      }
    })();
    let
      quoteStart = delimiters.quotationStart,
      quoteEnd = delimiters.quotationEnd,
      singleQuoteStart = delimiters.alternateQuotationStart,
      singleQuoteEnd = delimiters.alternateQuotationEnd;

    if (locale.toLowerCase().endsWith('-gb')) {
      quoteStart = delimiters.alternateQuotationStart;
      quoteEnd = delimiters.alternateQuotationEnd;
      singleQuoteStart = delimiters.quotationStart;
      singleQuoteEnd = delimiters.quotationEnd;
    }

		return ast.map((ast, idx, arr) => {
      let trim;
      if (options.trim) {
        if (arr.length === 1) {
          trim = 'trim';
        } else if (!idx) {
          trim = 'trimStart';
        } else if (idx === arr.length - 1) {
          trim = 'trimEnd';
        }
      }
      return printAST(ast, { ...options, swapOne: swapOneClone, trim }, level);
    }).join('')
			.replace(/''/g, '|_single_|').replace(/'/g, '|_escape_|').replace(/\|_single_\|/g, "'")
			.replace(/(?<=\s)\\?'|^\\?'/g, singleQuoteStart) // opening '
      .replace(/(?<=\S)'(?=\S)/g, '’') // apostrophe
			.replace(/\\?'/g, singleQuoteEnd) // closing '
			.replace(/(?<=\s(\u0648)?)\\?"|^\\?"/g, quoteStart) // opening "
			.replace(/\\?"/g, quoteEnd) // closing "
			.replace(/\|_escape_\|/g, "'");
	}

	let text = '';
	const indent = useNewlines ? Array(level).fill('\t').join('') : ' ';
	const newline = useNewlines ? `\n${indent}` : indent;
	const type = ast.type;

	if (type === 0) { // straight text
    const value = swapOne.size ? ast.value.replace(/1/g, `{${[...swapOne].join('|')}}`) : ast.value;
    text += value[trim]?.() ?? value;
	}
	else if (type === 1) { // simple arg
		text += `{${normalizeArgName(ast.value, args)}}`;
	}
	else if ([2, 3, 4].includes(type)) { // number, date, time
		const style = (() => {
			if (ast.style) {
				if (typeof ast.style === 'string') return `, ${ast.style}`;
				else return `, ::${ast.style.pattern || ast.style.tokens.map(t => t.stem).join(' ')}`;
			} else {
        return '';
      }
		})();

		const typesText = ['number', 'date', 'time'];
		text += `{${normalizeArgName(ast.value, args)}, ${typesText[type - 2]}${style}}`;
	}
	else if (type === 5) { // select
		const optionsText = Object.entries(ast.options)
			.sort((a, b) => {
				return a[0] === 'other' ? 1 : (b[0] === 'other' ? -1 : 0);
			})
			.map(([opt, { value }]) => {
				return `${newline}${useNewlines ? '\t' : ''}${opt} {${printAST(value, options, level + 1)}}`;
			}).join('') + (useNewlines ? newline : '');

		text += `{${normalizeArgName(ast.value, args)}, select,${optionsText}}`;
	}
	else if (type === 6) { // plural, selectordinal
		const pluralCats = ['zero', 'one', 'two', 'few', 'many', 'other'];
		const supportedCats = new Intl.PluralRules(locale, { type: ast.pluralType }).resolvedOptions().pluralCategories;
		const unsupportedCats = [ ...Object.keys(ast.options).filter(o => !/^=\d+$/.test(o)) , ...pluralCats].filter(cat => !supportedCats.includes(cat));
    if (add) {
			supportedCats.forEach(cat => {
        if (!/^(fr|pt)/.test(locale) && cat === 'one' && ast.options['=1']) return; // don't create orphaned `one`
        // add missing supported categories
				ast.options[cat] ??= { ...(ast.options.other || ast.options.many || ast.options.few || Object.values(ast.options).at(-1)) };
			});
    }

    if (ast.options.one) {
      // `one` and `=1` are the same
      if (ast.options['=1'] && JSON.stringify(ast.options['=1']) === JSON.stringify(ast.options['one'])) {
        delete ast.options['=1'];
      }
    } else if (ast.options['=1'] && /(?<!(=|offset:\s?))1/.test(JSON.stringify(ast.options['=1'].value))) { // TODO: recursively check actual options
      // `=1` exists with literal "1" text
      ast.options.one = ast.options['=1'];
      delete ast.options['=1'];
      swapOne.add(ast.value);
    }

    if (dedupe && ast.options.other) {
      const otherPrinted = printAST(ast.options.other.value, { locale, args });
      Object.entries(ast.options).forEach(([k, v]) => {
        if (k !== 'other' && printAST(v.value, { locale, swapOne, args }) === otherPrinted) {
          delete ast.options[k];
        }
      });
    }

    remove && unsupportedCats.forEach(cat => delete ast.options[cat]);

		const typeText = ast.pluralType === 'ordinal' ? 'selectordinal' : 'plural';
		const offsetText = + ast.offset !== 0 ? ` offset:${ast.offset}` : '';
		const optionsText = Object.entries(ast.options).sort((a, b) => {
			if (a[0].startsWith('=') || b[0].startsWith('=')) {
				return a[0].localeCompare(b[0]);
			}
			return pluralCats.indexOf(a[0]) > pluralCats.indexOf(b[0]) ? 1 : -1;
		}).map(([opt, { value }]) => {
			return `${newline}${useNewlines ? '\t' : ''}${opt} {${printAST(value, { ...options, swapOne }, level + 1)}}`;
		}).join('') + (useNewlines ? newline : '');

		text += `{${normalizeArgName(ast.value, args)}, ${typeText},${offsetText}${optionsText}}`;
	}
	else if (type === 7) { // #
		text += '#';
	}
	else if (type === 8) { // tag
		text += `<${normalizeArgName(ast.value, args)}>${printAST(ast.children, options, level + 1)}</${normalizeArgName(ast.value, args)}>`;
	}
	else { // unhandled
		console.warn('unhandled type:', type);
	}

	return text;
}
