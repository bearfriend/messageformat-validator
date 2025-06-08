import { env } from 'node:process';
import findConfig from 'find-config';
import localeData from './locale-data.js';

export async function getConfig(cwd) {
	const configPath = findConfig('mfv.config.json', { cwd });
	const config = configPath ? (await import(`file://${configPath}`, { with: { type: 'json' } }))?.default ?? {} : {};
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

export async function getLocaleData(locale) {
	locale = (await getConfig(env.PWD))?.localesMap?.[locale] || locale;
	return (localeData[locale] ?? localeData[locale.split('-')[0]] ?? localeData['en']);
}

export function getPluralCats(locale, pluralType) {
	return new Intl.PluralRules(locale, { type: pluralType }).resolvedOptions().pluralCategories;
}

export function formatList(arr, locale = 'en') {
	return new Intl.ListFormat(locale).format(arr);
}

// sort '.' above '-'
export const sortFn = (a, b) => a.replace(/\./g, '\u0000') >= b.replace(/\./g, '\u0000') ? 1 : -1;
