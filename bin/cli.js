#!/usr/bin/env node

'use strict';

/* eslint-disable no-console */

const fs = require('fs');
const { promisify } = require('util');
const chalk = require('chalk');
const glob = require('glob');
const readFile = promisify(fs.readFile);
const { program } = require('commander');
const findConfig = require('find-config');
const configPath = findConfig('mfv.config.json');
const { version } = require('../package.json');
const { path, source: globalSource, locales: globalLocales, jsonObj: globalJsonObj } = configPath ? require(configPath) : {};
const { validateLocales, structureRegEx } = require('../src/validate');

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
  .option('--json-obj', 'Indicate that the files to be parsed are JSON files with keys that have objects for values')
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
  .command('sort')
  .description('Sort strings alphabetically by key, maintaining any blocks')
  .action(() => {
    program.sort = true;
  });

program
  .command('rename <old-key> <new-key>')
  .description('Rename a string')
  .action((oldKey, newKey) => {
    program.rename = true;
    program.oldKey = oldKey;
    program.newKey = newKey;
  });

program
  .command('highlight <key>')
  .description('Output a string with all non-translatable ICU MessageFormat structure highlighted')
  .action(key => {
    program.highlight = key;
  });

program.parse(process.argv);

const pathCombined = program.path || path;
if (!pathCombined) throw new Error('Must provide a path to the locale files using either the -p option or a config file.');

const localesPaths = glob.sync(pathCombined);
localesPaths.forEach(localesPath => {

  const absLocalesPath = `${process.cwd()}/${localesPath}`;

  const subConfigPath = findConfig('mfv.config.json', { cwd: absLocalesPath });

  const { source, locales: configLocales, jsonObj } = subConfigPath ? require(subConfigPath) : {}; /* eslint-disable-line global-require */

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

        const useJSONObj = program.jsonObj || jsonObj || globalJsonObj;

        const regex = useJSONObj
          //[                             ][  ][         "       ][   key   ][     "    ][             ][:][             ][        "       ][     value    ][        "        ][     ,    ][ // comment ]
          ? /("(?<realKey>.*)"(\s*):(\s*){)*\s+(?<keyQuote>["'`]?)(?<key>.*?)\k<keyQuote>(?<keySpace>\s*):(?<valSpace>\s*)(?<valQuote>["'`])(?<val>(.|\n)*?)(?<!\\)\k<valQuote>(?<comma>,?)(?<comment>.*)/g
          //[  ][         "       ][   key   ][     "    ][             ][:][             ][        "       ][     value    ][        "        ][     ,    ][ // comment ]
          : /\s+(?<keyQuote>["'`]?)(?<key>.*?)\k<keyQuote>(?<keySpace>\s*):(?<valSpace>\s*)(?<valQuote>["'`])(?<val>(.|\n)*?)(?<!\\)\k<valQuote>(?<comma>,?)(?<comment>.*)/g;
        const matches = Array.from(contents.matchAll(regex));

        let findContext = false;
        let findValue = false;

        matches.forEach(match => {

          if (useJSONObj) {
            if (findContext && match.groups.key === 'context') {
              acc[locale].parsed[findContext].comment = match.groups.val;
              findContext = false;
              return;
            }

            if (findValue && match.groups.key === 'translation') {
              acc[locale].parsed[findValue].val = match.groups.val;
              findValue = false;
              return;
            }

            if (match.groups.realKey) {

              if (match.groups.key === 'translation') {
                findContext = match.groups.realKey;
              }
              if (match.groups.key === 'context') {
                match.groups.comment = match.groups.val;
                findValue = match.groups.realKey;
              }

              match.groups.key = match.groups.realKey;
            }
          }

          if (!acc[locale].parsed[match.groups.key]) {
            acc[locale].parsed[match.groups.key] = Object.assign(String(match[0]), match.groups);
          }
        });
        return acc;
      }, {});

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
                    const nextString = locales[locale.locale].parsed[nextKey];
                    const siblingString = nextString || locales[locale.locale].parsed[previousKey] || locales[locale.locale].parsed[targetKeys[targetKeys.length - 1]];
                    const contents = locales[locale.locale].contents;
                    const insertAt = contents.indexOf(siblingString) + Number(!nextString ? String(siblingString).length : 0);
                    const comma = !nextString && !siblingString.comma ? `,${siblingString.comment}` : '';
                    const commaOffset = comma ? siblingString.comment.length : 0;
                    const sourceString = `${comma}${locales[sourceLocale].parsed[issue.key]}`;
                    locales[locale.locale].contents = [contents.slice(0, insertAt - commaOffset), sourceString, contents.slice(insertAt)].join('');
                    console.log('Added:', issue.key);
                    locales[locale.locale].parsed[issue.key] = locales[sourceLocale].parsed[issue.key];
                  }
                }
                else if (program.translatorOutput) {
                  if (['missing', 'untranslated'].includes(issue.type)) {
                    translatorOutput[issue.key] = issue.source;
                  }
                }
                else if (!program.ignoreIssueTypes || !program.ignoreIssueTypes.replace(' ','').split(',').includes(issue.type)) {
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
              fs.writeFileSync(localePath, locales[locale.locale].contents);
            }
          }

          if (program.translatorOutput) {
            console.log(JSON.stringify(translatorOutput, null, 2));
          }

          if (program.removeExtraneous) {
            const count = locale.report.errors ? locale.report.errors.extraneous || 0 : 0;
            const cliReport = `\n ${chalk.green('\u2714')} Removed ${count} extraneous strings`;
            console.log(cliReport);
          }
          else if (program.addMissing) {
            const count = locale.report.errors ? locale.report.errors.missing || 0 : 0;
            const cliReport = `\n ${chalk.green('\u2714')} Added ${count} missing strings`;
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
