export const sortedCats = ['zero', 'one', 'two', 'few', 'many', 'other'];
export const paddedQuoteLocales = ['fr', 'fr-ca', 'fr-fr', 'fr-on', 'vi-vn'];
export const structureRegEx = /(?<=\s*){(.|\n)*?[{}]|\s*}(.|\n)*?[{}]|[{#]|(\s*)}/g;

export function getPluralCats(locale, pluralType) {
	return new Intl.PluralRules(locale, { type: pluralType }).resolvedOptions().pluralCategories;
}

export function formatList(arr, locale = 'en') {
	return new Intl.ListFormat(locale).format(arr);
}
