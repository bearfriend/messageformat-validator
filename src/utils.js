import { env } from 'node:process';
import findConfig from 'find-config';
import { pathToFileURL } from 'node:url';
import localeData from './locale-data.js';

export function getArgs(asts, types = [1,2,3,4,5,6,8], args = []) {
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

/** The option names of every `select` in `asts`, by argument name, in the order they first appear. */
export function getSelectOptions(asts, found = new Map()) {
	asts.forEach(ast => {
		if (ast.type === 5) {
			const keys = found.get(ast.value) ?? [];
			Object.keys(ast.options).forEach(key => keys.includes(key) || keys.push(key));
			found.set(ast.value, keys);
		}
		if (ast.options) Object.values(ast.options).forEach(({ value }) => getSelectOptions(value, found));
		if (ast.children) getSelectOptions(ast.children, found);
	});
	return found;
}

/** The first AST node for the argument `value` of `type`, searching options and tag children. */
export function findArgument(asts, value, type) {
	for (const ast of asts) {
		if (typeof ast === 'string') continue;
		if (ast.value === value && ast.type === type && ast.location) return ast;
		const nested = [
			...Object.values(ast.options ?? {}).map(option => option.value),
			ast.children ?? [],
		];
		for (const children of nested) {
			const found = findArgument(children, value, type);
			if (found) return found;
		}
	}
}

/** Offset in `message` of the first non-breaking space inside its structure (braces, tags, `#`), or -1. */
export function findStructureNbsp(message) {
	for (const match of message.matchAll(structureRegEx)) {
		const at = match[0].indexOf('\u00a0');
		if (at !== -1) return match.index + at;
	}
	return -1;
}

/**
 * The escape runs in `message` that do not end where the text they are in does. An escape run (text in apostrophes, a "quote") opens at an apostrophe in front of `{`, `}`
 * or `<` (or `#`, in a plural) and only a single apostrophe closes it (`''` is an apostrophe, in a quote or not). One that is never
 * closed swallows the rest of the message, including the brace that closes the case it is in. One that a later apostrophe closes
 * swallows that brace, or the closing tag it is in, just the same: with the same text in two cases, the apostrophe in the second
 * closes the quote in the first, and the message still parses, but its cases are not what they look like.
 *
 * (`'>` is not one: the parser reads it as a quote that opens, but `>` needs no quoting, so it is an apostrophe followed by `>`.)
 *
 * @param {string} message
 * @returns {{ start: number, end: number }[]} `start` is the apostrophe that opens a quote. `end` is where the author most likely
 * meant it to close: just before the `}` or the closing tag that ends what it is in, or the end of the message.
 */
export function findUnterminatedEscapeRuns(message) {
	const found = [];
	// What is open around the scan position: only a `}` or `</tag>` that closes one of these ends a quote.
	const enclosing = { braces: 0, tags: 0 };
	for (let i = 0; i < message.length; i++) {
		const char = message[i];
		if (char === '{') enclosing.braces++;
		else if (char === '}') enclosing.braces = Math.max(0, enclosing.braces - 1);
		else if (char === '<') {
			const tag = tagAt(message, i);
			if (tag?.closing) enclosing.tags = Math.max(0, enclosing.tags - 1);
			else if (tag && !tag.selfClosing) enclosing.tags++;
		}
		else if (char === "'") {
			if (message[i + 1] === "'") {
				i++;
				continue;
			}
			const opener = message[i + 1];
			if (!'{}<'.includes(opener) && !(opener === '#' && isInPlural(message, i))) continue;

			// A `}` that opens the quote is text in it, not the end of the case.
			const end = endOfQuoted(message, opener === '}' ? i + 2 : i + 1, enclosing);
			const closing = nextQuote(message, i + 1);
			if (closing === -1 || closing > end) {
				// A quote that opens at a self-closing tag has no more to hold than that tag.
				const tag = tagAt(message, i + 1);
				found.push({ start: i, end: tag?.selfClosing ? i + 1 + tag.length : end });
				i = end - 1;
			}
			else i = closing;
		}
	}
	return found;
}

// Whether `message` has a plural or selectordinal before `offset`. Whether it is in one is not worked out, as it would take a parse.
function isInPlural(message, offset) {
	return /,\s*(?:plural|selectordinal)\s*,/.test(message.slice(0, offset));
}

const TAG = /<(\/)?[a-zA-Z][^<>{}']*?(\/)?>/y;

/** The tag that starts at `offset`, if one does. (`<br/>` is a tag here, as it does not open one.) */
function tagAt(message, offset) {
	TAG.lastIndex = offset;
	const tag = TAG.exec(message);
	return tag && { closing: Boolean(tag[1]), selfClosing: Boolean(tag[2]), length: tag[0].length };
}

/** Offset of the next apostrophe that is not part of a `''`, or -1. */
function nextQuote(message, from) {
	for (let i = from; i < message.length; i++) {
		if (message[i] !== "'") continue;
		if (message[i + 1] === "'") i++;
		else return i;
	}
	return -1;
}

/**
 * Where the text of a quote that has no end should end: before the first `}` or `</tag>` that closes something opened before it,
 * that is, something in `enclosing` (a brace or tag the quote itself opens is closed by the quote). Otherwise, the end of the message.
 */
function endOfQuoted(message, from, enclosing) {
	let braces = 0;
	let tags = 0;
	for (let i = from; i < message.length; i++) {
		const char = message[i];
		if (char === '{') braces++;
		else if (char === '}') {
			if (braces > 0) braces--;
			else if (enclosing.braces > 0) return i;
		}
		else if (char === '<') {
			const tag = tagAt(message, i);
			if (tag?.closing) {
				if (tags > 0) tags--;
				else if (enclosing.tags > 0) return i;
			}
			else if (tag && !tag.selfClosing) tags++;
		}
	}
	return message.length;
}

export async function getConfig(cwd) {
	const configPath = findConfig('mfv.config.json', { cwd });
	const config = configPath ? (await import(pathToFileURL(configPath).href, { with: { type: 'json' } }))?.default ?? {} : {};
	config.__configPath = configPath;

	if (config.locales !== undefined && !Array.isArray(config.locales)) {
		console.error('locales config must be an array');
		process.exit(1);
	}

	return config;
}

export const sortedCats = ['zero', 'one', 'two', 'few', 'many', 'other'];
export const paddedQuoteLocales = ['fr', 'fr-ca', 'fr-fr', 'fr-on', 'vi-vn'];
export const structureRegEx = /(?<=\s*)(?<!(?<!'([{<>}](?:[^']*?[{<>}])?))')(''|([{<]([^']|\n)*?[{<>}])|\s*}([^']|\n)*?[{}]|#)/g

export function resolveLocaleData(locale, localesMap) {
	locale = localesMap?.[locale] || locale;
	return (localeData[locale] ?? localeData[locale.split('-')[0]] ?? localeData['en']);
}

export async function getLocaleData(locale) {
	return resolveLocaleData(locale, (await getConfig(env.PWD))?.localesMap);
}

export function getPluralCats(locale, pluralType) {
	return new Intl.PluralRules(locale, { type: pluralType }).resolvedOptions().pluralCategories;
}

export function formatList(arr, locale = 'en') {
	return new Intl.ListFormat(locale).format(arr);
}

// sort '.' above '-'
export const sortFn = (a, b) => a.replace(/\./g, '\u0000') >= b.replace(/\./g, '\u0000') ? 1 : -1;
