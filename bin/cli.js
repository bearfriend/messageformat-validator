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
  .parse(process.argv);


const localesPath = path || commander.path;
const absLocalesPath = `${process.cwd()}/${localesPath}`;

fs.readdir(absLocalesPath, (err, files) => {
  if (err) console.log(`Failed to read ${absLocalesPath}`);
  let filteredFiles = files;
  if (commander.locales) {
    commander.locales.push(source);
    filteredFiles = files.filter(file => commander.locales.includes(file.replace('.json', '')));
  }
  Promise.all(filteredFiles.map((file) => readFile(absLocalesPath + file, 'utf8')))
  .then((res) => {
    const locales = res.reduce((acc, json, idx) => {
      acc[filteredFiles[idx].replace('.json','')] = json;
      return acc;
    }, {});
    const output = validateLocales({ locales, sourceLocale: source });

    output.forEach((locale, idx) => {
      console.log((idx > 0 ? '\n' : '') + chalk.underline(`${absLocalesPath}${locale.locale}.json`));
      if (commander.issues) {
        locale.issues.forEach((issue) => {
          console.log(
            '  ' + chalk.grey(`${issue.line}:${issue.column}`) +
            '  ' + chalk[issue.level == 'error' ? 'red' : 'yellow'](issue.level) +
            ' ' + chalk.grey(issue.type) +
            '  ' + chalk.cyan(issue.key) +
            '  ' + chalk.white(issue.msg)
          );
        });
      }

      if (locale.report.totals.errors || locale.report.totals.warnings) {
        const color = locale.report.totals.errors ? 'red' : 'yellow';
        const total = locale.report.totals.errors + locale.report.totals.warnings;
        const cliReport = chalk[color](`\n\u2716 ${total} issues (${locale.report.totals.errors} errors, ${locale.report.totals.warnings} warnings)`);
        console.log(cliReport);
      }
      else {
        const cliReport = `\n ${chalk.green('\u2714')} Passed`;
        console.log(cliReport);
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
