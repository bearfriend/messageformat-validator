import { hoistSelectors } from '@formatjs/icu-messageformat-parser/manipulator.js';
import { parse } from '@formatjs/icu-messageformat-parser';
import { env } from 'node:process';
import { getArgs, getConfig, getSelectOptions, getPluralCats, paddedQuoteLocales, resolveLocaleData, sortedCats, structureRegEx } from './utils.js';

function expandASTHashes(ast, parentValue) {
	if (Array.isArray(ast)) {
		ast.map(ast => expandASTHashes(ast, parentValue));
	}

	if (ast.type === 7 && parentValue) { // #
		ast.type = 1;
		ast.value = parentValue;
	}
	else if (ast.type === 6 && !ast.offset) { // plural, selectordinal
		expandASTHashes(Object.values(ast.options).map(o => o.value), ast.value);
	}
}

// Stands for a `'` that quotes text. Kept as a marker until the whole message is printed, so nothing in between
// (curling apostrophes, doubling the literal ones) mistakes it for an apostrophe in the text.
const ESCAPE = '|_escape_|';
const ESCAPE_REGEX = /\|_escape_\|/g;

// Quoted braces, as the user wrote them: `'{'`, `'{x}'`. The quotes stay in the text (see `mfEscape`) so they can be printed as written.
const QUOTED_BRACES = "'([{}](?:[^']*?[{}])?)'";

// Either those, or a stretch of text from its first literal brace (or `#`, in a plural) to its last, plus any apostrophes
// right after it. That is text the parser took from an unterminated or oddly-ended quote, and it has to be quoted again.
const textRegex = parentValue => new RegExp(`${QUOTED_BRACES}|([${parentValue ? '{}#' : '{}'}](?:.*[${parentValue ? '{}#' : '{}'}])?'*)`, 'gsu');

function mfEscape(msg) {
	return msg.replace(new RegExp(QUOTED_BRACES, 'gsu'), "'''$1'''");
}

/**
 * Formats a message without side effects: nothing is logged, nothing reads the working directory or config,
 * and nothing exits the process. Problems come back in the result instead.
 *
 * If the message cannot be parsed, `message` is the input, unchanged. `error` is the parse error, and `errorText`
 * is the text its `location` offsets refer to (the input after quote escaping, which can differ from the input).
 *
 * With `source` (the source locale's message), `add` also adds the select options that message has and this one lacks,
 * and argument names are corrected to match it, unless `correct` is `false`.
 *
 * The default rewrites ("essentials") can be switched off individually (`apostrophes`, `hoist`, `normalizeOne`,
 * `renameCategories`, `sort`), or all together with `essentials: false`, in which case an individual option set
 * to `true` switches that one back on.
 *
 * @param {string} msg
 * @param {object} [options] see `formatMessage`; `localesMap` replaces the `mfv.config.json` setting of the same name
 * @returns {{ message: string, error?: Error, errorText?: string, warnings: string[] }}
 */
export function formatMessageSync(msg, options = {}) {
	const warnings = [];
	const warn = warning => warnings.push(warning);
	const essential = name => options[name] ?? options.essentials ?? true;
	const input = msg;
	let ast;

	try {
		msg = options.quotes === 'straight' ? msg.replace(/'/g, "'''") : mfEscape(msg);
		ast = parse(msg, { requiresOtherClause: false });
	} catch(err) {
		try {
			const alteredMsg = msg.replace('\'{', '’{');
			ast = parse(alteredMsg, { requiresOtherClause: false });
			msg = alteredMsg;
		} catch {
			return { message: input, error: err, errorText: msg, warnings };
		}
	}
	if (options.expandHashes) {
		expandASTHashes(ast);
	}

	if (essential('hoist') && !options.trim) {
		try {
			ast = hoistSelectors(ast);
		} catch(e) {
			warn(`Could not hoist selectors: ${e?.message ?? e}`);
		}
	}

	const localeData = { [options.locale]: resolveLocaleData(options.locale, options.localesMap) };
	if (options.sourceLocale) localeData[options.sourceLocale] = resolveLocaleData(options.sourceLocale, options.localesMap);

	let args = [];
	let sourceSelects = new Map();
	if (options.source) {
		try {
			const sourceAST = parse(options.source, { requiresOtherClause: false });
			if (options.correct ?? true) args = getArgs(sourceAST);
			if (options.add) sourceSelects = getSelectOptions(sourceAST);
		} catch {
			warn(`WARN Source error: ${options.key}`);
		}
	}

	const printed = printAST(ast, {
		useNewlines: options.newlines ?? msg.match(structureRegEx)?.join('').includes('\n'),
		add: options.add ?? false,
		remove: options.remove ?? false,
		dedupe: options.dedupe ?? false,
		trim: options.trim ?? false,
		quotes: options.quotes,

		locale: options.locale,
		sourceLocale: options.sourceLocale,
		localeData,
		args,
		sourceSelects,
		warn,

		apostrophes: essential('apostrophes'),
		normalizeOne: essential('normalizeOne'),
		renameCategories: essential('renameCategories'),
		sort: essential('sort'),
	}, options.baseTabs);

	// A literal apostrophe before something that would start a quote (`{`, `}`, `<`, `>`, `#`, another apostrophe),
	// or before the quotes this adds, has to be doubled to stay one. Quote replacement (`quotes`) handles its own.
	const message = (options.quotes ? printed : printed.replace(/'(?=['{}<>#]|\|_escape_\|)/g, "''")).replace(ESCAPE_REGEX, "'");

	return { message, warnings };
}

/**
 * Formats a message, logging any problems to the console. Use `formatMessageSync` to get them as data instead.
 * Locale data is chosen using `options.localesMap`, or else the `localesMap` in the `mfv.config.json` found from `$PWD`.
 */
export async function formatMessage(msg, options = {}) {
	const localesMap = options.localesMap ?? (await getConfig(env.PWD))?.localesMap;
	const { message, error, errorText, warnings } = formatMessageSync(msg, { ...options, localesMap });

	if (error) {
		if (error.location) {
			console.log(`\nERROR: ${error.message}`);
			console.log(`\tLocale: ${options.locale}`);
			console.log(`\tKey: ${options.key}`);
			console.log(`\tOriginal message: ${error.originalMessage}`);
			console.log('\tAt or near:', errorText.slice(error.location.start.offset, Math.max(error.location.end.offset, error.location.start.offset + 4)));
		} else {
			console.log(error);
			console.log(`\tLocale: ${options.locale}`);
			console.log(`\tKey: ${options.key}`);
		}
	}
	warnings.forEach(warning => console.warn(warning));

	return message;
}

function normalizeArgName(name, type, availableArgs) {
	if (availableArgs.length) {
		const idx = availableArgs.findIndex(([n, t]) => n === name && t === type);
		if (idx > -1) {
			availableArgs.splice(idx, 1);
			return name;
		}
		else if (availableArgs.length === 1) {
			return availableArgs.pop()[0];
		} else {
			const idx = availableArgs.findIndex(([n, t]) => t === type && n.toLowerCase() === name.toLowerCase());
			if (idx > -1) {
				// case match
				return availableArgs.splice(idx, 1)[0][0];
			}
			return [...new Set(availableArgs
				.reduce((acc, [n, t]) => t === type && acc.push(n) && acc || acc, [])
			)].join('|');
		}
	}
	return name;
}

function printAST(ast, options, level = 0, parentValue) {
	const {
		locale,
		sourceLocale,
		quotes,
		swapOne = new Set(),
		useNewlines = false,
		add = false,
		remove = false,
		dedupe = false,
		trim = false,
		args = [],
		sourceSelects = new Map(),
		localeData,
		warn = () => {},
		apostrophes = true,
		normalizeOne = true,
		renameCategories = true,
		sort = true,
	} = options;

	const localeLower = locale.toLowerCase();

	if (Array.isArray(ast)) {
		const swapOneClone = new Set(swapOne);
		ast.forEach(a => a.type === 1 && swapOneClone.delete(a.value))

		let msg = ast
			.filter((i, idx) => !trim || i.type !== 0 || (idx !== 0 && idx !== ast.length - 1) || i.value.trim()) // filter out leading and trailing whitespace
			.map((ast, idx, arr) => {
				let trim = options.trim;
				if (trim && ast.type === 0) {
					if (arr.length === 1) {
						trim = 'trim';
					} else if (!idx) {
						trim = 'trimStart';
					} else if (idx === arr.length - 1) {
						trim = 'trimEnd';
					}
				}
				return printAST(ast, { ...options,
					swapOne: swapOneClone,
					trim
				},
				level,
				parentValue);
			}).join('');

		if (quotes) {
			const { delimiters } = localeData[locale];

			for (const k in delimiters) {
				if (paddedQuoteLocales.includes(localeLower)) {
					if (k.endsWith('Start')) {
						delimiters[k] = delimiters[k].padEnd(2,'\u202f');
					} else if (k.endsWith('End')) {
						delimiters[k] = delimiters[k].padStart(2,'\u202f');
					}
				}
			}

			let
				quoteStart = delimiters.quotationStart,
				quoteEnd = delimiters.quotationEnd,
				altStart = delimiters.alternateQuotationStart,
				altEnd = delimiters.alternateQuotationEnd,
				apostrophe = delimiters.apostrophe ?? '’';

			//if (1) { // todo: fromSource
			if (localeLower.endsWith('-gb')) {
				quoteStart = delimiters.alternateQuotationStart;
				quoteEnd = delimiters.alternateQuotationEnd;
				altStart = delimiters.quotationStart;
				altEnd = delimiters.quotationEnd;
			}
			//}

			if (quotes === 'straight' || quotes === 'both') {
				msg = msg
					.replace(/''/g, '|_single_|').replace(/'/g, '|_escape_|').replace(/\|_single_\|/g, "'")
					.replace(/(?<=\s)\\?'|^\\?'/g, altStart) // opening '
					.replace(/(?<=\S)'(?=\S)/g, '|_apostrophe_|') // apostrophe
					.replace(/\\?'/g, altEnd) // closing '
					.replace(/\|_apostrophe_\|/g, apostrophe)
					.replace(/(?<=\s(\u0648)?)\\?"|^\\?"/g, quoteStart) // opening "
					.replace(/\\?"/g, quoteEnd); // closing "
			}

			if (quotes === 'source' || quotes === 'both' && !locale.endsWith('-gb')) {
				const {
					quoteEnd: sourceQuoteEnd,
					quoteStart: sourceQuoteStart,
					altEnd: sourceAltEnd,
					altStart: sourceAltStart,
					apostrophe: sourceApostrophe
				} = (locale => {
					const { delimiters } = localeData[locale];

					for (const k in delimiters) {
						if (paddedQuoteLocales.includes(locale.toLowerCase())) {
							if (k.endsWith('Start')) {
								delimiters[k] = delimiters[k].padEnd(2,'\u202f');
							} else if (k.endsWith('End')) {
								delimiters[k] = delimiters[k].padStart(2,'\u202f');
							}
						}
					}

					let
						quoteStart = delimiters.quotationStart,
						quoteEnd = delimiters.quotationEnd,
						altStart = delimiters.alternateQuotationStart,
						altEnd = delimiters.alternateQuotationEnd,
						apostrophe = delimiters.apostrophe ?? '’';

					//if (1) { // todo: fromSource
					if (locale.toLowerCase().endsWith('-gb')) {
						quoteStart = delimiters.alternateQuotationStart;
						quoteEnd = delimiters.alternateQuotationEnd;
						altStart = delimiters.quotationStart;
						altEnd = delimiters.quotationEnd;
					}

					return { quoteStart, quoteEnd, altStart, altEnd, apostrophe };

				})(sourceLocale);

				/* eslint-disable no-useless-escape */
				msg = msg
					.replace(new RegExp(`''`, 'g'), '|_single_|').replace(/'/g, '|_escape_|').replace(/\|_single_\|/g, "'")
					.replace(new RegExp(`(?<=\s)\\\\?${sourceAltStart}|^\\\\?${sourceAltStart}`, 'g'), '|_altStart_|') // opening alt
					.replace(new RegExp(`(?<=\\S)${sourceApostrophe}(?=\\S)`, 'g'), '|_apostrophe_|') // apostrophe
					.replace(new RegExp(`\\\\?${sourceAltEnd}`, 'g'), '|_altEnd_|') // closing alt
					.replace(new RegExp(`\\\\?${sourceQuoteStart}(\\b|(?=\\p{Sc}|\\p{P}))`, 'g'), '|_quoteStart_|') // opening quote
					.replace(new RegExp(`\\b\\\\?${sourceQuoteEnd}`, 'g'), '|_quoteEnd_|') // closing quote
					.replace(/\|_apostrophe_\|/g, apostrophe)
					.replace(/\|_quoteStart_\|/g, quoteStart)
					.replace(/\|_quoteEnd_\|/g, quoteEnd)
					.replace(/\|_altStart_\|/g, altStart)
					.replace(/\|_altEnd_\|/g, altEnd);
				/* eslint-enable no-useless-escape */
			}
		}
		if (apostrophes && !quotes && localeData?.[locale]) {
			const { delimiters } = localeData[locale];
			const apostrophe = delimiters.apostrophe ?? '\u2019';
			msg = msg.replace(/'/g, apostrophe);
		}
		return quotes ? msg.replace(ESCAPE_REGEX, "'") : msg;
	}

	let text = '';
	const indent = useNewlines ? Array(level).fill('\t').join('') : ' ';
	const newline = useNewlines ? `\n${indent}` : indent;
	const type = ast.type;

	if (type === 0) { // straight text
		let escaped = ast.value;
		escaped = escaped.replace(textRegex(parentValue), (match, quoted, stretch) => quoted === undefined
			? `${ESCAPE}${stretch.replace(/'/g, ESCAPE + ESCAPE)}${ESCAPE}` // `''` is an apostrophe inside a quote, too
			: `${ESCAPE}${quoted}${ESCAPE}`);

		escaped = swapOne.size ? escaped.replace(/1/g, `{${[...swapOne].join('|')}}`) : escaped;
		text += escaped[trim]?.() ?? escaped;
	}
	else if (type === 1) { // simple arg
		text += `{${normalizeArgName(ast.value, type, args)}}`;
	}
	else if ([2, 3, 4].includes(type)) { // number, date, time
		const style = (() => {
			if (ast.style) {
				if (typeof ast.style === 'string') return `, ${ast.style}`;
				else return `, ::${ast.style.pattern || ast.style.tokens.map(t => [t.stem, ...t.options].join('/')).join(' ')}`;
			} else {
				return '';
			}
		})();

		const typesText = ['number', 'date', 'time'];
		text += `{${normalizeArgName(ast.value, type, args)}, ${typesText[type - 2]}${style}}`;
	}
	else if (type === 5) { // select

		const argName = normalizeArgName(ast.value, type, args);
		if (add) {
			// the same case plural categories copy: `other` if there is one, otherwise the last
			const copied = ast.options.other ?? Object.values(ast.options).at(-1);
			if (copied) {
				[...(sourceSelects.get(argName) ?? []), 'other'].forEach(key => {
					if (!Object.hasOwn(ast.options, key)) ast.options[key] = { ...copied };
				});
			}
		}
		const selectEntries = Object.entries(ast.options);
		if (sort) selectEntries.sort((a, b) => a[0] === 'other' ? 1 : (b[0] === 'other' ? -1 : 0));
		const optionsText = selectEntries
			.map(([opt, { value }]) => {
				return `${newline}${useNewlines ? '\t' : ''}${opt} {${printAST(value, { ...options, args }, level + 1)}}`;
			}).join('') + (useNewlines ? newline : '');

		text += `{${argName}, select,${optionsText}}`;
	}
	else if (type === 6) { // plural, selectordinal
		const supportedCats = getPluralCats(locale, ast.pluralType);
		// Printing is also how options are compared, and printing mutates the AST, so comparisons must follow the same rules.
		const compareOptions = { locale, args, warn, normalizeOne, renameCategories, sort };
		const unsupportedCats = [ ...Object.keys(ast.options).filter(o => !/^=\d+$/.test(o)) , ...sortedCats].filter(cat => !supportedCats.includes(cat));
		if (add) {
			supportedCats.forEach(cat => {
				// TODO: check actual locale plural categories
				if (!/^(fr|pt)/.test(locale) && cat === 'one' && ast.options['=1']) return; // don't create orphaned `one`
				// add missing supported categories
				ast.options[cat] ??= { ...(ast.options.other || ast.options.many || ast.options.few || Object.values(ast.options).at(-1)) };
			});
		}

		if (normalizeOne && ast.options['=1'] && !ast.offset) {
			if (ast.options['=1'].value.filter(o => o.type === 0).map(o => o.value).join('').includes('1')) { // TODO: recursively check actual options
				// `=1` exists with literal "1" text
				ast.options.one = ast.options['=1'];
				delete ast.options['=1'];
				swapOne.add(ast.value);
			} else if (locale === sourceLocale && locale.startsWith('en')) {
				// `=1` exists with basic Englished pluralization differences
				const enBasicPluralsRegEx = /e|s|es(?=\s|$|\p{P})/gv;
				if (printAST(ast.options.other.value, compareOptions).replace(enBasicPluralsRegEx, '') === printAST(ast.options['=1'].value, compareOptions).replace(enBasicPluralsRegEx, '')) {
					ast.options.one = ast.options['=1'];
					delete ast.options['=1'];
					swapOne.add(ast.value);
				}
			}
		}

		if (normalizeOne && ast.options.one && !ast.offset) {
			// `one` and `=1` are the same
			if (ast.options['=1'] && JSON.stringify(ast.options['=1']) === JSON.stringify(ast.options['one'])) {
				delete ast.options['=1'];
			}
		}

		if (dedupe && ast.options.other) {
			const otherPrinted = printAST(ast.options.other.value, compareOptions);
			Object.entries(ast.options).forEach(([k, v]) => {
				if (k !== 'other' && printAST(v.value, { ...compareOptions, swapOne }) === otherPrinted) {
					delete ast.options[k];
				}
			});
		}

		// replace a bad category if possible
		const usedCats = Object.keys(ast.options);
		const unusedCats = supportedCats.filter(c => !usedCats.includes(c));
		if (renameCategories && unusedCats.length === 1) {
			const unrecognizedCats = usedCats.filter(c => !/^=\d+$/.test(c) && !supportedCats.includes(c));
			if (unrecognizedCats.length === 1) {
				ast.options[unusedCats[0]] = ast.options[unrecognizedCats[0]];
				delete ast.options[unrecognizedCats[0]];
			}
		}

		remove && unsupportedCats.forEach(cat => {
			const currentKeys = Object.keys(ast.options);
			if (currentKeys.includes(cat)) {
				if (currentKeys.length === 1) {
					ast.options.other = Object.assign({}, ast.options[cat]);
				}
				delete ast.options[cat];
			}
		});

		const argName = normalizeArgName(ast.value, type, args);

		const typeText = ast.pluralType === 'ordinal' ? 'selectordinal' : 'plural';
		const offsetText = + ast.offset !== 0 ? ` offset:${ast.offset}` : '';
		const pluralEntries = Object.entries(ast.options);
		if (sort) {
			pluralEntries.sort((a, b) => {
				if (a[0].startsWith('=') || b[0].startsWith('=')) {
					return a[0].localeCompare(b[0]);
				}
				return sortedCats.indexOf(a[0]) > sortedCats.indexOf(b[0]) ? 1 : -1;
			});
		}
		const optionsText = pluralEntries.map(([opt, { value }]) => {
			return `${newline}${useNewlines ? '\t' : ''}${opt} {${printAST(value, { ...options, swapOne, args: [...args] }, level + 1, ast.value)}}`;
		}).join('') + (useNewlines ? newline : '');

		text += `{${argName}, ${typeText},${offsetText}${optionsText}}`;
	}
	else if (type === 7) { // #
		text += '#';
	}
	else if (type === 8) { // tag
		text += `<${normalizeArgName(ast.value, type, args)}>${printAST(ast.children, options, level + 1, parentValue)}</${normalizeArgName(ast.value, type, args)}>`;
	}
	else { // unhandled
		warn(`unhandled type: ${type}`);
	}

	return text;
}
