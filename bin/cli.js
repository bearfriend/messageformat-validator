#!/usr/bin/env -S node --no-warnings --experimental-json-modules

/* eslint-disable no-console */

import { env } from 'node:process';
import { parseLocales, validateLocales } from '../src/validate.js';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import chalk from 'chalk';
import glob from 'glob';
import pkg from '../package.json' with { type: 'json' };
import { program, Option } from 'commander';
import { getConfig, sortFn, structureRegEx } from '../src/utils.js';

let formatMessage, commandOpts;
const programArgs = {};

const {
	path,
	source: globalSource,
	locales: globalLocales,
	jsonObj: globalJsonObj
} = await getConfig(env.PWD);

program
	.version(pkg.version)
	.option('--no-issues', 'Don\'t output issues')
	.option('-i, --ignore <items>', 'Ignore these comma-separated issue types')
	.option('-l, --locales <items>', 'Process only these comma-separated locales')
	.option('-p, --path <path>', 'Glob path to a directory containing locale files')
	.option('-s, --source-locale <locale>', 'The locale to use as the source')
	.option('--json-obj', 'Indicate that the files to be parsed are JSON files with keys that have objects for values')
	.command('validate', { isDefault: true, hidden: true })
	.action(() => {
		program.validate = true;
	});

program
	.command('build')
	.description('Build locale data for configured locales')
	.action(() => {
		program.build = true;
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
		programArgs.oldKey = oldKey;
		programArgs.newKey = newKey;
	});

program
	.command('format')
	.description('Rewrite messages to a standard format')
	.option('-n, --newlines', 'When formatting complex arguments, use newlines and indentation for readability')
	.option('-a, --add', 'Add cases for missing supported pural and selectordinal categories')
	.option('-r, --remove', 'Remove cases for unsupported pural and selectordinal categories')
	.option('-d, --dedupe', 'Remove complex argument cases that duplicate the `other` case. Takes precedence over --add.')
	.option('-t, --trim', 'Trim whitespace from both ends of messages. Disables selector hoisting.')
	.option('-c, --correct', 'Attempt to correct argument names. A source locale must be provided.')
	.addOption(new Option('--no-hoist', 'Do not hoist selectors').hideHelp())
	.addOption(new Option('-q, --quotes <type>', 'Replace quote characters with locale-appropriate characters').choices(['source', 'straight', 'both']))
	.action(async function() {
		formatMessage = (await import('../src/format.js')).formatMessage;
		program.format = true;
		commandOpts = this.opts();
		/*
		program.newlines = opts.newlines;
		program.add = opts.add;
		program.remove = opts.remove;
		program.trim = opts.trim;
		program.quotes = opts.quotes;
		program.dedupe = opts.dedupe
		*/
	});

program
	.command('highlight <key>')
	.description('Output a message with all non-translatable ICU MessageFormat structure highlighted')
	.action(key => {
		program.highlight = key;
	});

await program.parseAsync(process.argv);
const programOpts = program.opts();

if (program.build) {
	await import('../build-locale-data.js');
	process.exit();
}

const pathCombined = programOpts.path || path;
if (!pathCombined) {
	console.error('Must provide a path to the locale files using either the -p option or a config file.');
	process.exit(1);
}

const noSource = () => {
	console.error('Must provide a source locale using either the -s option or a config file.');
	process.exit(1);
};

const localesPaths = glob.sync(pathCombined);
const results = await Promise.all(localesPaths.map(async (localesPath, idx) => {

	const absLocalesPath = `${process.cwd()}/${localesPath}`;

	const { source, locales: configLocales, jsonObj } = await getConfig(absLocalesPath);

	const files = await readdir(absLocalesPath).catch(err => {
		console.log(`Failed to read ${absLocalesPath}\n`);
		throw err;
	});

	const sourceLocale = programOpts.sourceLocale || source || globalSource;
	const allowedLocales = programOpts.locales?.replace(/\s/g, '').split(',') || configLocales || globalLocales;
	const filteredFiles = !allowedLocales ?
		files.filter(file => !(/^\..*/g).test(file)) :
		files.filter(file => allowedLocales.concat(sourceLocale).includes(file.split('.')[0]));
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
		console.log(`Renaming "${programArgs.oldKey}" to "${programArgs.newKey}" in:`, targetLocales.join(', '));
	}

	if (program.format) {
		if (!sourceLocale) noSource();
		//console.log(`Formatting:`, targetLocales.join(', '));
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

	const useJSONObj = programOpts.jsonObj || jsonObj || globalJsonObj;

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

		console.log(chalk.underline(localesPath));
		console.log(`Formatting:`, targetLocales.join(', '));

		const sourceLocaleParsed = locales[sourceLocale].parsed;

		await Promise.all(Object.keys(locales).map(async locale => {
			if (!allowedLocales || allowedLocales.includes(locale)) {

				let localeContents = locales[locale].contents;
				await Promise.all(Object.values(locales[locale].parsed).map(async t => {

					const source = commandOpts.correct ? sourceLocaleParsed[t.key] : null;

					if (localeContents.includes(t)) {
						const baseTabs = t.valSpace.includes('\n') && !commandOpts.newlines
							? t.valSpace.match(/^\n?(?<tabs>\t*)/).groups.tabs
							: t.match(/^\n?(?<tabs>\t*)/).groups.tabs;

						const unescapedValue = t.val.replaceAll(`\\${t.valQuote}`, t.valQuote);
						let newVal = await formatMessage(unescapedValue, {
							locale,
							sourceLocale,
							add: commandOpts.add,
							remove: commandOpts.remove,
							newlines: commandOpts.newlines,
							dedupe: commandOpts.dedupe,
							trim: commandOpts.trim,
							collapse: commandOpts.collapse,
							quotes: commandOpts.quotes,
							expandHashes: true,
							hoist: commandOpts.hoist,

							baseTabs: baseTabs.length + (commandOpts.newlines ? 1 : 0),
							key: t.key,
							source,
							target: t
						});
						const valQuote = commandOpts.newlines && newVal.includes('\n') ? '`' : t.valQuote;
						const valSpace = commandOpts.newlines && newVal.includes('\n') ? `\n\t${baseTabs}` : t.valSpace;

						newVal = newVal.replaceAll(valQuote, `\\${valQuote}`);

						const old = `${t.keyQuote}${t.key}${t.keyQuote}${t.keySpace}:${t.valSpace}${t.valQuote}${t.val}${t.valQuote}${t.comma}${t.comment}`;
						const noo = `${t.keyQuote}${t.key}${t.keyQuote}${t.keySpace}:${valSpace}${valQuote}${newVal}${valQuote}${t.comma}${t.comment}`;

						if (old !== noo) count += 1;
						localeContents = localeContents.replace(old, noo);
					}
				}));

				await writeFile(absLocalesPath + locales[locale].file, localeContents);
			}
		}));

		const cliReport = `\n ${chalk.green('\u2714')} Formatted ${count} messages`;
		console.log(cliReport);

		return;
	}

	if (program.rename) {
		let count = 0;
		await Promise.all(Object.keys(locales).map(async locale => {
			if (!allowedLocales || allowedLocales.includes(locale)) {

				const localeContents = locales[locale].contents;
				const t = locales[locale].parsed[programArgs.oldKey];

				if (localeContents.includes(t)) {
					const old = `${t.keyQuote}${t.key}${t.keyQuote}${t.keySpace}:${t.valSpace}${t.valQuote}${t.val}`;
					const noo = `${t.keyQuote}${programArgs.newKey}${t.keyQuote}${t.keySpace}:${t.valSpace}${t.valQuote}${t.val}`;

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
		const localeFile = `${locales[locale.locale].file}`;
		const localeFilePath = `${localesPath}${localeFile}`;
		if (!allowedLocales || allowedLocales.includes(locale.locale)) {

			if (program.sort ||
				program.removeExtraneous ||
				program.addMissing ||
				program.printMissing ||
				locale.report.totals.errors ||
				locale.report.totals.warnings) {
				console.log((idx > 0 ? '\n' : '') + chalk.underline(localeFilePath));
			}

			if (programOpts.issues) {

				locale.report.totals.ignored = { warnings: 0, errors: 0 };

				if (program.sort) {
					const sorted = Object.values(locales[locale.locale].parsed)
						.reduce((acc, val) => {
							const block = !val.startsWith('\n\n') ? acc.pop() || [] : [];
							block.push(val.replace('\n\n', '\n'));
							acc.push(block);
							return acc;
						}, [])
						.map(block => block.sort(sortFn).join(''))
						.sort(sortFn)
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
						else if (!programOpts.ignore || !programOpts.ignore
							.replace(' ', '')
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
							locale.report.totals.ignored[`${issue.level}s`] += 1;
						}
					});
				}

				if (program.removeExtraneous || program.addMissing || program.sort) {
					await writeFile(localeFilePath, locales[locale.locale].contents);
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
				const ignored = locale.report.totals.ignored.errors + locale.report.totals.ignored.warnings;
				const cliReport = chalk[color](`\n\u2716 ${total} issues (${locale.report.totals.errors} errors, ${locale.report.totals.warnings} warnings)${ignored ? chalk.grey(` - ${ignored} Ignored`) : ''}`);
				console.log(cliReport);
				return;
			}
			else {
				// passed
			}
		}

		locale.report = undefined;

	}));

	const totals = {
		errors: 0,
		warnings: 0,
		ignored: {
			errors: 0,
			warnings: 0
		}
	};

	output.forEach(locale => {
		if (locale.report) {
			totals.errors += locale.report.totals.errors;
			totals.warnings += locale.report.totals.warnings;
			totals.ignored.errors += locale.report.totals.ignored.errors;
			totals.ignored.warnings += locale.report.totals.ignored.warnings;
		}
	});

	if (idx < localesPaths.length - 1) console.log(`\n\n`);

	return totals;
}));

if (results.filter(r => r).length) {

	let exitCode = 0;

	const totals = {
		errors: 0,
		warnings: 0,
		ignored: {
			errors: 0,
			warnings: 0
		}
	};

	results.forEach(result => {
		if (result) {
			totals.errors += result.errors;
			totals.warnings += result.warnings;
			totals.ignored.errors += result.ignored.errors;
			totals.ignored.warnings += result.ignored.warnings;
		}
	});

	console.log(chalk.bold(`\n\nTotal ${chalk.grey(chalk.grey(` ${pathCombined} `))}`));

	if (totals.errors || totals.warnings) {
		const color = totals.errors ? 'red' : 'yellow';
		const total = totals.errors + totals.warnings;
		const ignored = totals.ignored.errors + totals.ignored.warnings;
		const cliReport = chalk[color](`\u2716 ${total} issues (${totals.errors} errors, ${totals.warnings} warnings)${ignored ? chalk.grey(` - ${ignored} Ignored`) : ''}`);
		console.log(chalk.bold(cliReport));
	} else {
		const cliReport = `\n ${chalk.green('\u2714')} Passed`;
		console.log(cliReport);
	}

	if (totals.errors - totals.ignored.errors) {
		console.error('\nErrors were reported in at least one locale. See details above.');
		exitCode = 1;
	}

	process.exit(exitCode);
}
