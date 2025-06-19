import { hoistSelectors } from '@formatjs/icu-messageformat-parser/manipulator.js';
import { parse } from '@formatjs/icu-messageformat-parser';
import { getLocaleData, getPluralCats, paddedQuoteLocales, sortedCats, structureRegEx } from './utils.js';

function getArgs(asts, types = [1,2,3,4,5,6,8], args = []) {
	asts.forEach(ast => {
		if (types.includes(ast.type)) {
			if (ast.type === 8) args.push([ast.value, ast.type]); // account for closing tag
			args.push([ast.value, ast.type]);
		}
		if (ast.options) Object.values(ast.options).map(({ value: asts }) => getArgs(asts, types, args));
		if (ast.children) args.concat(getArgs(ast.children, types, args));
	})
	return args;
}

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

function mfEscape(msg) {
	return msg.replace(/'([{}](?:.*?[{}])?)'/gsu, "'''$1'''");
}

export async function formatMessage(msg, options = {}) {
	let ast;

	try {
		msg = options.quotes === 'straight' ? msg.replace(/'/g, "'''") : mfEscape(msg);
		ast = parse(msg, { requiresOtherClause: false });
	} catch(err) {
		try {
			const alteredMsg = msg.replace('\'{', '’{');
			ast = parse(alteredMsg, { requiresOtherClause: false });
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

	if ((options.hoist ?? true) && !options.trim) {
		try {
			ast = hoistSelectors(ast);
		} catch(e) {
			console.log(e);
		}
	}

	const localeData = { [options.locale]: await getLocaleData(options.locale) };
	if (options.sourceLocale) localeData[options.sourceLocale] = await getLocaleData(options.sourceLocale);

	let args = [];
	if (options.source) {
		try {
			args = getArgs(parse(options.source, { requiresOtherClause: false }));
		} catch(e) {
			console.warn('WARN Source error:', options.key);
		}
	}

	return printAST(ast, {
		useNewlines: options.newlines ?? msg.match(structureRegEx)?.join('').includes('\n'),
		add: options.add ?? false,
		remove: options.remove ?? false,
		dedupe: options.dedupe ?? false,
		trim: options.trim ?? false,
		quotes: options.quotes,

		locale: options.locale,
		sourceLocale: options.sourceLocale,
		localeData,
		args
	}, options.baseTabs);
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
		localeData,
		isFirst = true,
		isLast = true
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
					isFirst: !idx,
					isLast: idx === arr.length - 1,
					swapOne: swapOneClone,
					trim
				},
				level);
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
		return msg.replace(/\|_escape_\|/g, "'");
	}

	let text = '';
	const indent = useNewlines ? Array(level).fill('\t').join('') : ' ';
	const newline = useNewlines ? `\n${indent}` : indent;
	const type = ast.type;

	if (type === 0) { // straight text
		let escaped = ast.value;
		// If this literal starts with a ' and its not the 1st node, this means the node before it is non-literal
		// and the `'` needs to be unescaped
		if (!isFirst && escaped[0] === "'") {
			escaped = "''".concat(escaped.slice(1));
		}
		// Same logic but for last el
		if (!isLast && escaped[escaped.length - 1] === "'") {
			escaped = "".concat(escaped.slice(0, escaped.length - 1), "''");
		}
		escaped = escaped.replace(/'([{}](?:.*[{}])?)'/gsu, "|_escape_|$1|_escape_|");
		escaped = parentValue ? escaped.replace("'#'", "|_escape_|#|_escape_|") : escaped;

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
				else return `, ::${ast.style.pattern || ast.style.tokens.map(t => t.stem).join(' ')}`;
			} else {
				return '';
			}
		})();

		const typesText = ['number', 'date', 'time'];
		text += `{${normalizeArgName(ast.value, type, args)}, ${typesText[type - 2]}${style}}`;
	}
	else if (type === 5) { // select

		const argName = normalizeArgName(ast.value, type, args);
		const optionsText = Object.entries(ast.options)
			.sort((a, b) => {
				return a[0] === 'other' ? 1 : (b[0] === 'other' ? -1 : 0);
			})
			.map(([opt, { value }]) => {
				return `${newline}${useNewlines ? '\t' : ''}${opt} {${printAST(value, { ...options, args }, level + 1)}}`;
			}).join('') + (useNewlines ? newline : '');

		text += `{${argName}, select,${optionsText}}`;
	}
	else if (type === 6) { // plural, selectordinal
		const supportedCats = getPluralCats(locale, ast.pluralType);
		const unsupportedCats = [ ...Object.keys(ast.options).filter(o => !/^=\d+$/.test(o)) , ...sortedCats].filter(cat => !supportedCats.includes(cat));
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
		} else if (ast.options['=1'] && /(?<!(=|offset:|"type":\s?))1/.test(JSON.stringify(ast.options['=1'].value))) { // TODO: recursively check actual options
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

		// replace a bad category if possible
		const usedCats = Object.keys(ast.options);
		const unusedCats = supportedCats.filter(c => !usedCats.includes(c));
		if (unusedCats.length === 1) {
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
		const optionsText = Object.entries(ast.options).sort((a, b) => {
			if (a[0].startsWith('=') || b[0].startsWith('=')) {
				return a[0].localeCompare(b[0]);
			}
			return sortedCats.indexOf(a[0]) > sortedCats.indexOf(b[0]) ? 1 : -1;
		}).map(([opt, { value }]) => {
			return `${newline}${useNewlines ? '\t' : ''}${opt} {${printAST(value, { ...options, swapOne, args: [...args] }, level + 1, ast.value)}}`;
		}).join('') + (useNewlines ? newline : '');

		text += `{${argName}, ${typeText},${offsetText}${optionsText}}`;
	}
	else if (type === 7) { // #
		text += '#';
	}
	else if (type === 8) { // tag
		text += `<${normalizeArgName(ast.value, type, args)}>${printAST(ast.children, options, level + 1)}</${normalizeArgName(ast.value, type, args)}>`;
	}
	else { // unhandled
		console.warn('unhandled type:', type);
	}

	return text;
}
