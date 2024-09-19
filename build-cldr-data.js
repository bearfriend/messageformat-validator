#!/usr/bin/env -S node --no-warnings --experimental-json-modules
import { writeFile } from 'node:fs/promises';
import { env } from 'node:process';
import cldr from 'cldr';

const defaultLocales = ['ar', 'cy', 'da', 'de', 'en', 'en-gb', 'es', 'es-es', 'fr', 'fr-ca', 'fr-fr', 'haw', 'hi', 'ja', 'ko', 'mi', 'nl', 'pt', 'sv', 'tr', 'zh-cn', 'zh-tw'];

function getDelimiters(locale) {
	try {
		return cldr.extractDelimiters(locale);
	} catch(err) {
		return cldr.extractDelimiters(locale.split('-')[0]);
	}
}

const locales = env.MFV_LOCALES?.split(',') ?? defaultLocales;

const data = {};

locales.forEach(locale => {
	locale = locale.trim().toLowerCase();
	data[locale] = {};
	data[locale].delimiters = getDelimiters(locale);
});

await writeFile('./src/cldr-data.js', `export default ${JSON.stringify(data, null, '\t')}\n`);
