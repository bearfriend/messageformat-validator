#!/usr/bin/env node

'use strict';

/* eslint-disable no-console */

const fs = require('fs');
const { promisify } = require('util');
const chalk = require('chalk');
const glob = require("glob");
const readFile = promisify(fs.readFile);
const { program } = require('commander');
const findConfig = require('find-config');
const configPath = findConfig('mfv.config.json');
const { version } = require('../package.json');
const { path, source: globalSource, locales: globalLocales } = configPath ? require(configPath) : {};
const { validateLocales } = require('../src/validate');

require = require('esm')(module) // eslint-disable-line

program
  .version(version)
  .option('-e, --throw-errors', 'Throw an error if error issues are found')
  .option('--no-issues', 'Don\'t output issues')
  .option('-i, --ignoreIssueTypes <items>', 'Ignore these comma-separated issue types')
  .option('-l, --locales <items>', 'Process only these comma-separated locales')
  .option('-p, --path <path>', 'Path to a directory containing locale files')
  .option('-t, --translator-output', 'Output JSON of all source strings that are missing or untranslated in the target')
  .option('-s, --source-locale <locale>', 'The locale to use as the source')
  .command('validate', { isDefault: true, hidden: true })
  .action(() => {
    program.validate = true;
  });

program
  .command('remove-extraneous')
  .description('Remove strings that do not exist in the source locale')
  .action(() => {
    program.removeExtraneous = true;
  });

program
  .command('add-missing')
  .description('Add strings that do not exist in the target locale')
  .action(() => {
    program.addMissing = true;
  });

program
  .command('rename <old-key> <new-key>')
  .description('Rename a string')
  .action((oldKey, newKey) => {
    program.rename = true;
    program.oldKey = oldKey;
    program.newKey = newKey;
  });

program.parse(process.argv);

const localesPaths = glob.sync(program.path || path);
localesPaths.forEach(localesPath => {

  const absLocalesPath = `${process.cwd()}/${localesPath}`;

  const subConfigPath = findConfig('mfv.config.json', { cwd: absLocalesPath });

  const { source, locales: configLocales } = subConfigPath ? require(subConfigPath) : {}; /* eslint-disable-line global-require */

  fs.readdir(absLocalesPath, (err, files) => {
    if (err) {
      console.log(`Failed to read ${absLocalesPath}`);
      return;
    }

    const sourceLocale = program.sourceLocale || source || globalSource;
    const allowedLocalesString = program.locales || configLocales || globalLocales;
    const allowedLocales = allowedLocalesString && allowedLocalesString.split(',').concat(sourceLocale);
    const filteredFiles = !allowedLocales ?
      files.filter(file => !(/^\..*/g).test(file)) :
      files.filter(file => allowedLocales.includes(file.split('.')[0]));
    const targetLocales = filteredFiles.map(file => file.split('.')[0]);

    if (program.removeExtraneous) {
      console.log('Removing extraneous strings from:', targetLocales.join(', '));
    }

    if (program.addMissing) {
      console.log('Adding missing strings to:', targetLocales.join(', '));
    }

    if (program.rename) {
      console.log(`Renaming "${program.oldKey}" to "${program.newKey}" in:`, targetLocales.join(', '));
    }

    Promise.all(filteredFiles.map(file => readFile(absLocalesPath + file, 'utf8')))
    .then(res => {
      const locales = res.reduce((acc, contents, idx) => {
        const file = filteredFiles[idx];
        const locale = file.split('.')[0];
        acc[locale] = {
          contents,
          parsed: {},
          file
        };
        //            [  ][         "       ][   key   ][     "    ][             ][:][             ][        "       ][  value  ][        "        ][     ,    ][ // comment ]
        const regex = /\s+(?<keyQuote>["'`]?)(?<key>.*?)\k<keyQuote>(?<keySpace>\s?):(?<valSpace>\s?)(?<valQuote>["'`])(?<val>.*?)(?<!\\)\k<valQuote>(?<comma>,?)(?<comment>.*)/g;
        const matches = Array.from(contents.matchAll(regex));//.map(m => m.groups);

        matches.forEach(match => {
          acc[locale].parsed[match.groups.key] = Object.assign(String(match[0]), match.groups);
        });
        return acc;
      }, {});

      if (program.rename) {
        let count = 0;
        Object.keys(locales).forEach(locale => {
          if (!allowedLocales || allowedLocales.includes(locale)) {

            const localeContents = locales[locale].contents;
            const t = locales[locale].parsed[program.oldKey];

            if (localeContents.includes(t)) {
              const old = `${t.keyQuote}${t.key}${t.keyQuote}${t.keySpace}:${t.valSpace}${t.valQuote}${t.val}`;
              const noo = `${t.keyQuote}${program.newKey}${t.keyQuote}${t.keySpace}:${t.valSpace}${t.valQuote}${t.val}`;

              count += 1;
              const newLocaleContents = localeContents.replace(old, noo);

              fs.writeFileSync(absLocalesPath + locales[locale].file, newLocaleContents);
              console.log(`${chalk.green('\u2714')} ${locales[locale].file} - Renamed`);
            }
            else {
              console.log(`${chalk.red('\u2716')} ${locales[locale].file} - Missing`);
            }
          }
        });

        const cliReport = `\n ${chalk.green('\u2714')} Renamed ${count} strings`;
        console.log(cliReport);

        return;
      }

      const output = validateLocales({ locales, sourceLocale });
      const translatorOutput = {};

      output.forEach((locale, idx) => {
        const localePath = `${absLocalesPath}${locales[locale.locale].file}`;

        if (!allowedLocales || allowedLocales.includes(locale.locale)) {
          console.log((idx > 0 ? '\n' : '') + chalk.underline(localePath));
          if (program.issues) {

            locale.report.totals.ignored = 0;

            locale.issues.forEach((issue) => {
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
                  const siblingString = locales[locale.locale].parsed[nextKey || previousKey]
                    || locales[locale.locale].parsed[targetKeys[0]];
                  const contents = locales[locale.locale].contents;
                  const insertAt = contents.indexOf(siblingString.split(':')[0]) + Number(!nextKey ? String(siblingString).length : 0);
                  const comma = !nextKey && !siblingString.comma ? `,${siblingString.comment}` : '';
                  const commaOffset = comma ? siblingString.comment.length : 0;
                  const sourceString = `${comma}${locales[sourceLocale].parsed[issue.key]}`;
                  locales[locale.locale].contents = [contents.slice(0, insertAt - commaOffset), sourceString, contents.slice(insertAt)].join('');
                  console.log('Added:', issue.key);
                }
              }
              else if (program.translatorOutput) {
                if (['missing', 'untranslated'].includes(issue.type)) {
                  translatorOutput[issue.key] = issue.source;
                }
              }
              else if (!program.ignoreIssueTypes || !program.ignoreIssueTypes.replace(' ','').split(',').includes(issue.type)) {
                console.log(
                  '  ' + chalk.grey(`${issue.line}:${issue.column}`) +
                  '  ' + chalk[issue.level == 'error' ? 'red' : 'yellow'](issue.level) +
                  ' ' + chalk.grey(issue.type) +
                  '  ' + chalk.cyan(issue.key) +
                  '  ' + chalk.white(issue.msg)
                );
              }
              else {
                locale.report.totals.ignored += 1;
              }
            });

            // todo: reimplement sort
            if (program.removeExtraneous || program.addMissing || program.sort) {
              fs.writeFileSync(localePath, locales[locale.locale].contents);
            }
          }

          if (program.translatorOutput) {
            console.log(JSON.stringify(translatorOutput, null, 2));
          }

          if (program.removeExtraneous || program.addMissing) {
            if (program.removeExtraneous) {
              const count = locale.report.errors ? locale.report.errors.extraneous || 0 : 0;
              const cliReport = `\n ${chalk.green('\u2714')} Removed ${count} extraneous strings`;
              console.log(cliReport);
            }
            if (program.addMissing) {
              const count = locale.report.errors ? locale.report.errors.missing || 0 : 0;
              const cliReport = `\n ${chalk.green('\u2714')} Added ${count} missing strings`;
              console.log(cliReport);
            }
          }
          else if (locale.report.totals.errors || locale.report.totals.warnings) {
            const color = locale.report.totals.errors ? 'red' : 'yellow';
            const total = locale.report.totals.errors + locale.report.totals.warnings;
            const cliReport = chalk[color](`\n\u2716 ${total} issues (${locale.report.totals.errors} errors, ${locale.report.totals.warnings} warnings)${locale.report.totals.ignored ? chalk.grey(` - ${locale.report.totals.ignored} Ignored`) : ''}`);
            console.log(cliReport);
          }
          else {
            const cliReport = `\n ${chalk.green('\u2714')} Passed`;
            console.log(cliReport);
          }
        }
      });

      if (program.throwErrors && output.some(locale => locale.report.totals.errors)) {
        throw new Error('Errors were reported in at least one locale. See details above.');
      }
    })
    .catch((errAll) => {
      console.error(errAll);
      process.exitCode = 1;
    });
  });
});
