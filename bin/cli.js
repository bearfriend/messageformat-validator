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

  const { source, format = 'json', namedExport = 'default', locales: configLocales } = subConfigPath ? require(subConfigPath) : {}; /* eslint-disable-line global-require */
  const ext = format.split('-')[0];

  fs.readdir(absLocalesPath, (err, files) => {
    if (err) {
      console.log(`Failed to read ${absLocalesPath}`);
      return;
    }

    const sourceLocale = program.sourceLocale || source || globalSource;
    const allowedLocalesString = program.locales || configLocales || globalLocales;
    const allowedLocales = allowedLocalesString && allowedLocalesString.split(',');
    const filteredFiles = !allowedLocales ?
      files.filter(file => !(/^\..*/g).test(file)) :
      files.filter(file => allowedLocales.includes(file.replace(`.${ext}`, '')) || file === sourceLocale + `.${ext}`);

    Promise.all(filteredFiles.map(file => readFile(absLocalesPath + file, 'utf8')))
    .then((res) => {
      const locales = res.reduce((acc, contents, idx) => {
        const locale = filteredFiles[idx].replace(`.${ext}`,'');
        acc[locale] = {
          contents,
          parsed: ext === 'js' && require(absLocalesPath + filteredFiles[idx])[namedExport] /* eslint-disable-line global-require */
        };
        acc[locale].comments = {};
        Object.keys(acc[locale].parsed).forEach(key => {
          const match = new RegExp(`${key}["']?\\s?:\\s?".+?",?(?<comment>.*)`);
          acc[locale].comments[key] = acc[locale].contents.match(match).groups.comment;
        })
        return acc;
      }, {});

      const targetLocales = filteredFiles.map(file => file.replace(`.${ext}`, ''));

      if (program.removeExtraneous) {
        console.log('Removing extraneous strings from:', targetLocales.join(', '));
      }

      if (program.addMissing) {
        console.log('Adding missing strings to:', targetLocales.join(', '));
      }

      if (program.rename) {
        console.log(`Renaming "${program.oldKey}" to "${program.newKey}" in:`, targetLocales.join(', '));
        let count = 0;
        Object.keys(locales).forEach((locale) => {
          if (!allowedLocales || allowedLocales.includes(locale)) {

            const target1 = `"${program.oldKey}" : "`;
            const target2 = `"${program.oldKey}": "`;
            const target3 = `${program.oldKey} : "`;
            const target4 = `${program.oldKey}: "`;

            const target = new RegExp(`${target1}|${target2}|${target3}|${target4}`);

            const localeContents = locales[locale].contents;
            if (localeContents.match(target)) {
              count += 1;
              let newLocaleContents;
              switch(format) {
                case 'js':
                newLocaleContents = localeContents.replace(target, `${program.newKey}: "`);
                break;

                case 'js-single-quoted':
                newLocaleContents = localeContents.replace(target, `'${program.newKey}': "`);
                break;

                case "json":
                newLocaleContents = localeContents.replace(target, `"${program.newKey}" : "`);
                break;

                case "js-quoted":
                newLocaleContents = localeContents.replace(target, `"${program.newKey}": "`);
                break;
              }

              fs.writeFileSync(absLocalesPath + locale + `.${ext}`, newLocaleContents);
              console.log(`${chalk.green('\u2714')} ${locale}.${ext} - Renamed`);
            }
            else {
              console.log(`${chalk.red('\u2716')} ${locale}.${ext} - Missing`);
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
        const localePath = `${absLocalesPath}${locale.locale}.${ext}`;

        if (!allowedLocales || allowedLocales.includes(locale.locale)) {
          console.log((idx > 0 ? '\n' : '') + chalk.underline(`${absLocalesPath}${locale.locale}.${ext}`));
          if (program.issues) {
            const JSONlocaleStrings = require(localePath); /* eslint-disable-line global-require */
            const JSONsourceStrings = require(`${absLocalesPath}${sourceLocale}.${ext}`); /* eslint-disable-line global-require */
            const { [namedExport]: localeStrings = JSONlocaleStrings } = JSONlocaleStrings;
            const { [namedExport]: sourceStrings = JSONsourceStrings } = JSONsourceStrings;

            locale.report.totals.ignored = 0;

            locale.issues.forEach((issue) => {
              if (program.removeExtraneous) {
                if (issue.type === 'extraneous') {
                  Reflect.deleteProperty(localeStrings, issue.key);
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

            if (program.removeExtraneous || program.addMissing || program.sort) {
              const keys = Object.keys(localeStrings);
              const sortedLocale = keys.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
                .reduce((acc, k) => {
                  acc[k] = localeStrings[k];
                  return acc;
                }, {});
              let newLocaleContents = JSON.stringify(sortedLocale, null, ext === 'js' ? 2 : 3);

              newLocaleContents.replace();

              const formatJS = contents => {
                return contents.replace(/"(.+)":(.*)/g, (line, key) => {
                  return line.replace(/".+":/g, `${key}:`) + locales[sourceLocale].comments[key];
                });
              };

              const exportPrefix = `export ${namedExport === 'default' ? 'default' : `const ${namedExport} =`}`;
              //const contextComment = '';
              switch(format) {
                case 'js':
                newLocaleContents = `${exportPrefix} ${formatJS(newLocaleContents)};`;
                break;

                case "js-quoted":
                newLocaleContents = `${exportPrefix} ${newLocaleContents};`
                break;

                case 'js-single-quoted':
                newLocaleContents = `${exportPrefix} ${newLocaleContents.replace(/"(.+)":/g, "'$1:'")};`;
                break;

                case "json":
                newLocaleContents = newLocaleContents.replace(/": "/g, '" : "');
                break;

                default:
                break;
              }

              fs.writeFileSync(localePath, newLocaleContents + '\n');
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
            const cliReport = chalk[color](`\n\u2716 ${total} issues (${locale.report.totals.errors} errors, ${locale.report.totals.warnings} warnings)${ locale.report.totals.ignored ? chalk.grey(` - ${locale.report.totals.ignored} Ignored`) : ''}`);
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
});
