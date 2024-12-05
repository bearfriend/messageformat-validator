import { readdir, writeFile } from 'node:fs/promises';
import { env, stderr } from 'node:process';
import { formatList, getConfig } from './src/utils.js';
import { dirname, join, posix } from 'node:path';

const defaultLocales = ['ar', 'cy', 'da', 'de', 'en', 'en-gb', 'es', 'es-es', 'fr', 'fr-ca', 'fr-fr', 'haw', 'hi', 'ja', 'ko', 'mi', 'nl', 'pt', 'sv', 'tr', 'zh-cn', 'zh-tw'];
const defaultLocaleMap = { 'fr-on': 'fr-ca' };

const SAVE_PATH = posix.join(dirname(import.meta.url), 'src/cldr-data.js').replace(/file:(\/c:)?/i, '');

function getDelimiters(locale) {
	try {
		return cldr.extractDelimiters(locale);
	} catch(err) {
		return cldr.extractDelimiters(locale.split('-')[0]);
	}
}

let cldr;
await (async() => {
	let contents = `import localeData from './locale-data-default.js';\nexport default localeData;\n`;

	const config = await getConfig();
	const localeMap = config.localeMap || defaultLocaleMap;

	let locales = env.MFV_LOCALES?.split(',') ?? config.locales;
	locales ??= config.path && (await readdir(join(dirname(config.__configPath), config.path)).catch(() => {}))?.map(f => f.split('.')[0]);
	locales ??= defaultLocales;
	const nonDefaultLocales = locales?.filter(l => !defaultLocales.includes(localeMap[l] ?? l));

	if (nonDefaultLocales?.length) {
		let cldrImport;
		try {
			cldrImport = await import('cldr');
		} catch(e) {
			stderr.write(`\n\nSome configured locales (${formatList(nonDefaultLocales.map(l => `"${l}"`))}) require the 'cldr' package: npm i -D cldr\n\n`);
			process.exitCode = 1;
			return;
		}
		cldr = (cldrImport).default;
		const data = {};

		locales.forEach(locale => {
			try {
				locale = Intl.getCanonicalLocales(locale.trim().toLowerCase())[0];
			} catch(e) {
				stderr.write(e.message);
				process.exit(1);
			}
			data[locale] = {};
			data[locale].delimiters = getDelimiters(locale);
		});

		contents = `import defaultLocaleData from './locale-data-default.js';export default { ...${JSON.stringify(data, null, '\t')}\n`;
	}
	await writeFile(SAVE_PATH, contents);
})();
