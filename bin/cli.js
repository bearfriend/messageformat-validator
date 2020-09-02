#!/usr/bin/env node

'use strict';

/* eslint-disable no-console */

const fs = require('fs');
const { promisify } = require('util');
const chalk = require('chalk');
const readFile = promisify(fs.readFile);
const { program } = require('commander');
const findConfig = require('find-config');
const configPath = findConfig('mfv.config.json');
const { version } = require('../package.json');
const { path, source: configSource } = require(configPath);
const { validateLocales } = require('../src/validate');

program
  .version(version)
  .option('-e, --throw-errors', 'Throw an error if error issues are found')
  .option('--no-issues', 'Don\'t output issues')
  .option('-l, --locales <items>', 'Process only these comma-separated locales', val => val.split(','))
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

const localesPath = program.path || path;
const absLocalesPath = `${process.cwd()}/${localesPath}`;

fs.readdir(absLocalesPath, (err, files) => {
  if (err) {
    console.log(`Failed to read ${absLocalesPath}`);
    return;
  }

  const sourceLocale = program.sourceLocale || configSource;
  const filteredFiles = !program.locales ? files : files.filter(file => program.locales.includes(file.replace('.json', '')) || file === sourceLocale + '.json');

  Promise.all(filteredFiles.map((file) => readFile(absLocalesPath + file, 'utf8')))
  .then((res) => {
    const locales = res.reduce((acc, json, idx) => {
      acc[filteredFiles[idx].replace('.json','')] = json;
      return acc;
    }, {});

    const targetLocales = program.locales || filteredFiles.map(file => file.replace('.json', ''));

    if (program.removeExtraneous) {
      console.log('Removing extraneous strings from:', targetLocales.join(', '));
    }

    if (program.addMissing) {
      console.log('Adding missing strings to:', targetLocales.join(', '));
    }

    if (program.rename) {
      console.log(`Renaming "${program.oldKey}" to "${program.newKey}" in:`, targetLocales.join(', '));
      let count = 0;
      Object.keys(locales).forEach((locale, idx) => {
        if (!program.locales || program.locales.includes(locale)) {

          const target = `   "${program.oldKey}" : "`;

          if (locales[locale].includes(target)) {
            count = count + 1;
            const localeJSON = locales[locale].replace(target, `   "${program.newKey}" : "`);
            fs.writeFileSync(absLocalesPath + locale + '.json', localeJSON);
            console.log(`${chalk.green('\u2714')} ${locale}.json - Renamed`);
          }
          else {
            console.log(`${chalk.red('\u2716')} ${locale}.json - Missing`);
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
      if (!program.locales || program.locales.includes(locale.locale)) {
        console.log((idx > 0 ? '\n' : '') + chalk.underline(`${absLocalesPath}${locale.locale}.json`));
        if (program.issues) {

          const localeStrings = JSON.parse(locales[locale.locale]);
          const sourceStrings = JSON.parse(locales[sourceLocale]);
          locale.issues.forEach((issue) => {
            if (program.removeExtraneous) {
              if (issue.type === 'extraneous') {
                delete localeStrings[issue.key];
                console.log('Removed:', issue.key);
              }

            }
            else if (program.addMissing) {
              if (issue.type === 'missing') {
                localeStrings[issue.key] = sourceStrings[issue.key];
                console.log('Added:', issue.key);
              }
            }
            else if (program.translatorOutput) {
              if (['missing', 'untranslated'].includes(issue.type)) {
                translatorOutput[issue.key] = issue.source;
              }
            }
            else {
              console.log(
                '  ' + chalk.grey(`${issue.line}:${issue.column}`) +
                '  ' + chalk[issue.level == 'error' ? 'red' : 'yellow'](issue.level) +
                ' ' + chalk.grey(issue.type) +
                '  ' + chalk.cyan(issue.key) +
                '  ' + chalk.white(issue.msg)
              );
            }
          });

          if (program.removeExtraneous || program.addMissing) {
            const sortedLocale = Object.keys(localeStrings).sort()
              .reduce((acc, k) => {
                acc[k] = localeStrings[k];
                return acc;
              }, {});
            const localeJSON = JSON.stringify(sortedLocale, null, 3).replace(/": "/g, '" : "');
            fs.writeFileSync(absLocalesPath + locale.locale + '.json', localeJSON + '\n');
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
          const cliReport = chalk[color](`\n\u2716 ${total} issues (${locale.report.totals.errors} errors, ${locale.report.totals.warnings} warnings)`);
          console.log(cliReport);
        }
        else {
          const cliReport = `\n ${chalk.green('\u2714')} Passed`;
          console.log(cliReport);
        }
      }
    });

    if (program.throwErrors && output.some((locale) => locale.report.totals.errors)) {
      throw new Error('Errors were reported in at least one locale. See details above.');
    }
  })
  .catch((errAll) => {
    console.error(errAll);
    process.exitCode = 1;
  });
});
