#!/usr/bin/env -S node --no-warnings --experimental-json-modules

/* eslint-disable no-console */

import { parseLocales, validateLocales } from '../src/validate.js';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import chalk from 'chalk';
import findConfig from 'find-config';
import { formatMessage } from '../src/format.js'
import glob from 'glob';
import pkg from '../package.json' with { type: 'json' };
import { program } from 'commander';
import { structureRegEx } from '../src/utils.js';

const configPath = findConfig('mfv.config.json');
const { path, source: globalSource, locales: globalLocales, jsonObj: globalJsonObj } = configPath ? (await import(`file://${configPath}`, { with: { type: 'json' } }))?.default ?? {} : {};

program
	.version(pkg.version)
	.option('--no-issues', 'Don\'t output issues')
	.option('-i, --ignoreIssueTypes <items>', 'Ignore these comma-separated issue types')
	.option('-l, --locales <items>', 'Process only these comma-separated locales')
	.option('-p, --path <path>', 'Path to a directory containing locale files')
	.option('-s, --source-locale <locale>', 'The locale to use as the source')
	.option('--json-obj', 'Indicate that the files to be parsed are JSON files with keys that have objects for values')
	.command('validate', { isDefault: true, hidden: true })
	.action(() => {
		program.validate = true;
	});

program
	.command('print-missing')
	.description('Output JSON of all source messages that are missing or untranslated in the target')
	.action(() => {
		program.printMissing = true;
	});

program
	.command('remove-extraneous')
	.description('Remove messages that do not exist in the source locale')
	.action(() => {
		program.removeExtraneous = true;
	});

program
	.command('add-missing')
	.description('Add messages that do not exist in the target locale')
	.action(() => {
		program.addMissing = true;
	});

program
	.command('sort')
	.description('Sort messages alphabetically by key, maintaining any blocks')
	.action(() => {
		program.sort = true;
	});

program
	.command('rename <old-key> <new-key>')
	.description('Rename a message')
	.action((oldKey, newKey) => {
		program.rename = true;
		program.oldKey = oldKey;
		program.newKey = newKey;
	});

program
	.command('format')
	.description('Rewrite messages to a standard format')
	.option('-n, --newlines', 'When formatting complex arguments, use newlines and indentation for readability')
	.option('-a, --add', 'Add cases for missing supported pural and selectordinal categories')
	.option('-r, --remove', 'Remove cases for unsupported pural and selectordinal categories')
	.option('-d, --dedupe', 'Remove complex argument cases that duplicate the `other` case. Takes precedence over --add.')
	.option('-t, --trim', 'Trim whitespace from both ends of messages')
	.option('-c, --collapse', 'Collapse repeating whitepace')
	.action(function() {
		program.format = true;
		const opts = this.opts();
		program.newlines = opts.newlines;
		program.add = opts.add;
		program.remove = opts.remove;
		program.trim = opts.trim;
		program.collapse = opts.collapse;
		program.dedupe = opts.dedupe
	});

program
	.command('highlight <key>')
	.description('Output a message with all non-translatable ICU MessageFormat structure highlighted')
	.action(key => {
		program.highlight = key;
	});

program.parse(process.argv);

const pathCombined = program.path || path;
if (!pathCombined) {
	console.error('Must provide a path to the locale files using either the -p option or a config file.');
	process.exit(1);
}

const noSource = () => {
	console.error('Must provide a source locale using either the -s option or a config file.');
	process.exit(1);
};

const localesPaths = glob.sync(pathCombined);
localesPaths.forEach(async localesPath => {

	const absLocalesPath = `${process.cwd()}/${localesPath}`;

	const subConfigPath = findConfig('mfv.config.json', { cwd: absLocalesPath });

	const { source, locales: configLocales, jsonObj } = subConfigPath ? (await import(`file://${subConfigPath}`, { with: { type: 'json' } }))?.default ?? {} : {}; /* eslint-disable-line global-require */

	const files = await readdir(absLocalesPath).catch(err => {
		console.log(`Failed to read ${absLocalesPath}\n`);
		throw err;
	});

	const sourceLocale = program.sourceLocale || source || globalSource;
	const allowedLocalesString = program.locales || configLocales || globalLocales;
	const allowedLocales = allowedLocalesString && allowedLocalesString.split(',').concat(sourceLocale);
	const filteredFiles = !allowedLocales ?
		files.filter(file => !(/^\..*/g).test(file)) :
		files.filter(file => allowedLocales.includes(file.split('.')[0]));
	const targetLocales = filteredFiles.map(file => file.split('.')[0]);

	if (program.removeExtraneous) {
		if (!sourceLocale) noSource();
		console.log('Removing extraneous messages from:', targetLocales.join(', '));
	}

	if (program.addMissing) {
		if (!sourceLocale) noSource();
		console.log('Adding missing messages to:', targetLocales.join(', '));
	}

	if (program.rename) {
		console.log(`Renaming "${program.oldKey}" to "${program.newKey}" in:`, targetLocales.join(', '));
	}

	if (program.format) {
		if (!sourceLocale) noSource();
		console.log(`Formatting:`, targetLocales.join(', '));
	}

	const resources = await Promise.all(filteredFiles.map(file => readFile(absLocalesPath + file, 'utf8')))
		.then(readFiles => readFiles.map((contents, idx) => ({
			file: filteredFiles[idx],
			contents
		})))
		.catch(err => {
			console.error(err);
			process.exitCode = 1;
		});
	if (!resources) return;

	const useJSONObj = program.jsonObj || jsonObj || globalJsonObj;

	const locales = parseLocales(resources, useJSONObj);

	if (program.highlight) {

		const showWS = str => str
			.replace(/ /g, '·')
			.replace(/\t/g, '··')
			.replace(/\n/g, '␤\n');

		Object.keys(locales).forEach(locale => {
			if ((!allowedLocales || allowedLocales.includes(locale)) && locales[locale].parsed[program.highlight]) {
				const str = String(locales[locale].parsed[program.highlight].val);

				let match;
				let prevEnd = 0;
				const sections = [];

				while((match = structureRegEx.exec(str)) !== null) {
					sections.push(showWS(str.substring(prevEnd, match.index)));
					sections.push(chalk.red(showWS(str.substr(match.index, match[0].length))));
					prevEnd = match.index + match[0].length;
				}

				sections.push(showWS(str.substring(prevEnd)));

				const highlighted = sections.join('');
				console.log(highlighted);

			}
		});

		return;
	}

	if (program.format) {
		let count = 0;

		const sourceLocaleParsed = locales[sourceLocale].parsed;
		Object.keys(locales).forEach(async locale => {
			if (!allowedLocales || allowedLocales.includes(locale)) {

				let localeContents = locales[locale].contents;

				Object.values(locales[locale].parsed).forEach(t => {

					const source = sourceLocaleParsed[t.key];

					if (localeContents.includes(t)) {
						const baseTabs = t.match('^\n?(?<tabs>\t*)').groups.tabs
						const newVal = formatMessage(t.val, {
							locale,
							add: program.add,
							remove: program.remove,
							newlines: program.newlines,
							dedupe: program.dedupe,
							trim: program.trim,
							collapse: program.collapse,

							baseTabs: baseTabs.length,
							key: t.key,
							source,
							target: t
						});
						const valQuote = program.newlines && newVal.includes('\n') ? '`' : t.valQuote;
						const valSpace = program.newlines && newVal.includes('\n') ? `\n${baseTabs}` : t.valSpace;
						const old = `${t.keyQuote}${t.key}${t.keyQuote}${t.keySpace}:${t.valSpace}${t.valQuote}${t.val}${t.valQuote}${t.comma}${t.comment}`;
						const noo = `${t.keyQuote}${t.key}${t.keyQuote}${t.keySpace}:${valSpace}${valQuote}${newVal}${valQuote}${t.comma}${t.comment}`;

						if (old !== noo) count += 1;
						localeContents = localeContents.replace(old, noo);
					}
				});

				await writeFile(absLocalesPath + locales[locale].file, localeContents);
			}
		});

		const cliReport = `\n ${chalk.green('\u2714')} Formatted ${count} messages`;
		console.log(cliReport);

		return;
	}

	if (program.rename) {
		let count = 0;
		await Promise.all(Object.keys(locales).map(async locale => {
			if (!allowedLocales || allowedLocales.includes(locale)) {

				const localeContents = locales[locale].contents;
				const t = locales[locale].parsed[program.oldKey];

				if (localeContents.includes(t)) {
					const old = `${t.keyQuote}${t.key}${t.keyQuote}${t.keySpace}:${t.valSpace}${t.valQuote}${t.val}`;
					const noo = `${t.keyQuote}${program.newKey}${t.keyQuote}${t.keySpace}:${t.valSpace}${t.valQuote}${t.val}`;

					count += 1;
					const newLocaleContents = localeContents.replace(old, noo);

					await writeFile(absLocalesPath + locales[locale].file, newLocaleContents);
					console.log(`${chalk.green('\u2714')} ${locales[locale].file} - Renamed`);
				}
				else {
					console.log(`${chalk.red('\u2716')} ${locales[locale].file} - Missing`);
				}
			}
		}));

		const cliReport = `\n ${chalk.green('\u2714')} Renamed ${count} messages`;
		console.log(cliReport);

		return;
	}

	if (!sourceLocale) noSource();

	const output = validateLocales({ locales, sourceLocale });
	const translatorOutput = {};

	await Promise.all(output.map(async(locale, idx) => {
		const localePath = `${absLocalesPath}${locales[locale.locale].file}`;

		if (!allowedLocales || allowedLocales.includes(locale.locale)) {
			console.log((idx > 0 ? '\n' : '') + chalk.underline(localePath));
			if (program.issues) {

				locale.report.totals.ignored = 0;

				if (program.sort) {
					const sorted = Object.values(locales[locale.locale].parsed)
						.reduce((acc, val) => {
							const block = !val.startsWith('\n\n') ? acc.pop() || [] : [];
							block.push(val.replace('\n\n', '\n'));
							acc.push(block);
							return acc;
						}, [])
						.map(block => block.sort().join(''))
						.sort()
						.join('\n');

					locales[locale.locale].contents = locales[locale.locale].contents.replace(Object.values(locales[locale.locale].parsed).join(''), sorted);
				}
				else {

					locale.issues.forEach(issue => {
						if (program.removeExtraneous) {
							if (issue.type === 'extraneous') {
								locales[locale.locale].contents = locales[locale.locale].contents.replace(locales[locale.locale].parsed[issue.key], '')
								console.log('Removed:', issue.key);
							}
						}
						else if (program.addMissing) {
							if (issue.type === 'missing') {
								const keys = Object.keys(locales[sourceLocale].parsed);
								const targetKeys = Object.keys(locales[locale.locale].parsed);
								const keyIdx = keys.indexOf(issue.key);
								const nextKey = keys[keyIdx + 1];
								const previousKey = keys[keyIdx - 1];
								const nextMessage = locales[locale.locale].parsed[nextKey];
								const siblingMessage = nextMessage || locales[locale.locale].parsed[previousKey] || locales[locale.locale].parsed[targetKeys[targetKeys.length - 1]];
								const contents = locales[locale.locale].contents;
								const insertAt = contents.indexOf(siblingMessage) + Number(!nextMessage ? String(siblingMessage).length : 0);
								const comma = !nextMessage && !siblingMessage.comma ? `,${siblingMessage.comment}` : '';
								const commaOffset = comma ? siblingMessage.comment.length : 0;
								const sourceMessage = `${comma}${locales[sourceLocale].parsed[issue.key]}`;
								locales[locale.locale].contents = [contents.slice(0, insertAt - commaOffset), sourceMessage, contents.slice(insertAt)].join('');
								console.log('Added:', issue.key);
								locales[locale.locale].parsed[issue.key] = locales[sourceLocale].parsed[issue.key];
							}
						}
						else if (program.printMissing) {
							if (['missing', 'untranslated'].includes(issue.type)) {
								translatorOutput[issue.key] = issue.source;
							}
						}
						else if (!program.ignoreIssueTypes || !program.ignoreIssueTypes
							.replace(' ','')
							.split(',')
							.includes(issue.type)
						) {
							console.log([
								'  ', chalk.grey(`${issue.line}:${issue.column}`),
								'  ', chalk[issue.level == 'error' ? 'red' : 'yellow'](issue.level),
								' ', chalk.grey(issue.type),
								'  ', chalk.cyan(issue.key),
								'  ', chalk.white(issue.msg)
							].join(''));
						}
						else {
							locale.report.totals.ignored += 1;
						}
					});
				}

				if (program.removeExtraneous || program.addMissing || program.sort) {
					writeFile(localePath, locales[locale.locale].contents);
				}
			}

			if (program.printMissing) {
				console.log(JSON.stringify(translatorOutput, null, 2));
			}
			else if (program.removeExtraneous) {
				const count = locale.report.errors ? locale.report.errors.extraneous || 0 : 0;
				const cliReport = `\n ${chalk.green('\u2714')} Removed ${count} extraneous messages`;
				console.log(cliReport);
			}
			else if (program.addMissing) {
				const count = locale.report.errors ? locale.report.errors.missing || 0 : 0;
				const cliReport = `\n ${chalk.green('\u2714')} Added ${count} missing messages`;
				console.log(cliReport);
			}
			else if (program.sort) {
				console.log('\nSorted');
			}
			else if (locale.report.totals.errors || locale.report.totals.warnings) {
				const color = locale.report.totals.errors ? 'red' : 'yellow';
				const total = locale.report.totals.errors + locale.report.totals.warnings;
				const cliReport = chalk[color](`\n\u2716 ${total} issues (${locale.report.totals.errors} errors, ${locale.report.totals.warnings} warnings)${locale.report.totals.ignored ? chalk.grey(` - ${locale.report.totals.ignored} Ignored`) : ''}`);
				console.log(cliReport);
				return;
			}
			else {
				const cliReport = `\n ${chalk.green('\u2714')} Passed`;
				console.log(cliReport);
			}
		}

		locale.report = undefined;

	}));

	if (output.some(locale => locale.report?.totals.errors)) {
		console.error('\nErrors were reported in at least one locale. See details above.');
		return 1;
	}
});
