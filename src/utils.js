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
