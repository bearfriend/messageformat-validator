#!/usr/bin/env node

'use strict';

/* eslint-disable no-console */

const fs = require('fs');
const { promisify } = require('util');
const chalk = require('chalk');
const readFile = promisify(fs.readFile);
const commander = require('commander');
const findConfig = require('find-config');
const configPath = findConfig('mfv.config.json');
const { version } = require('../package.json');
const { path, source } = require(configPath);
const { validateLocales } = require('../src/validate');

commander
  .version(version)
  .option('-e, --throw-errors', 'Throw an error if error issues are found')
  .option('--no-issues', 'Don\'t output issues')
  .option('-l, --locales <items>', 'Process only these comma-separated locales', val => val.split(','))
  .option('-p, --path [path]', 'Path to a directory containing locale files')
  .option('-t, --translator-output', 'Output JSON of all source strings that are missing or untranslated in the target')

commander
  .command('remove-extraneous')
  .action(() => {
    commander.removeExtraneous = true;
  })

commander.parse(process.argv);

const localesPath = path || commander.path;
const absLocalesPath = `${process.cwd()}/${localesPath}`;

fs.readdir(absLocalesPath, (err, files) => {
  if (err) console.log(`Failed to read ${absLocalesPath}`);
  let filteredFiles = files;
  if (commander.locales) {
    filteredFiles = files.filter(file => commander.locales.includes(file.replace('.json', '')) || file === source + '.json');
  }
  Promise.all(filteredFiles.map((file) => readFile(absLocalesPath + file, 'utf8')))
  .then((res) => {
    const locales = res.reduce((acc, json, idx) => {
      acc[filteredFiles[idx].replace('.json','')] = json;
      return acc;
    }, {});

    if (commander.removeExtraneous) {
      console.log('Removing extraneous strings from:', filteredFiles.join(', '));
    }

    const output = validateLocales({ locales, sourceLocale: source });
    const translatorOutput = {};

    output.forEach((locale, idx) => {
      if (!commander.locales || commander.locales.includes(locale.locale)) {
        console.log((idx > 0 ? '\n' : '') + chalk.underline(`${absLocalesPath}${locale.locale}.json`));
        if (commander.issues) {

          const localeStrings = JSON.parse(locales[locale.locale]);
          locale.issues.forEach((issue) => {
            if (commander.removeExtraneous) {
              if (issue.type === 'extraneous') {
                delete localeStrings[issue.key];
                console.log('Removed:', issue.key);
              }

            }
            else if (commander.translatorOutput) {
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

          if (commander.removeExtraneous) {
            const localeJSON = JSON.stringify(localeStrings, null, 3).replace(/": "/g, '" : "');
            fs.writeFileSync(absLocalesPath + locale.locale + '.json', localeJSON + '\n');
          }
        }

        if (commander.translatorOutput) {
          console.log(JSON.stringify(translatorOutput, null, 2));
        }

        if (commander.removeExtraneous) {
          const count = locale.report.errors ? locale.report.errors.extraneous || 0 : 0;
          const cliReport = `\n ${chalk.green('\u2714')} Removed ${count} extraneous strings`;
          console.log(cliReport);
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

    if (commander.throwErrors && output.some((locale) => locale.report.totals.errors)) {
      throw new Error('Errors were reported in at least one locale. See details above.');
    }
  })
  .catch((errAll) => {
    console.error(errAll);
    process.exitCode = 1;
  });
});
