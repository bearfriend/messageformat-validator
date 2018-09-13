'use strict';

const fs = require('fs');
const requireDir = require('require-dir');
const localeResources = requireDir('../test/locales/json'); // TODO: make dynamic
const parse = require('messageformat-parser').parse;
const pluralCats = require('make-plural/umd/pluralCategories');

exports.validate = function(target, source, lang) {

  const build = process.argv.includes('--build');
  const verbose = process.argv.includes('--verbose');

  const targetResources = {};

  if (build) {
    Object.assign(targetResources, { en: localeResources.en });
  }
  else {
    Object.assign(targetResources, localeResources);
  }

  function Reporter(lang) {
    this.lang = lang;
    this.report = {};
  }

  Reporter.prototype.config = function({key, target, source}) {
    this.key = key;
    this.target = target;
    this.source = source;
  };

  Reporter.prototype.log = function(level, type, msg, column) {

    //if (this.report[level]) {
    this.report[level] = this.report[level] || {};
    this.report[level][type] = this.report[level][type] || 0;
    this.report[level][type]++;
    //}

    if (level === 'error' || verbose) {

      fs.readFile(`./test/locales/json/${this.lang}.json`, 'utf8', (err, fileContents) => {
        if (err) throw err;

        console.log(fileContents);

        const line = fileContents.substring(0, fileContents.indexOf(`"${this.key}"`)).split('\n').length;

        const check = {
          path: `${this.lang}.json`,
          start_line: (line-1),
          end_line: line+1,
          annotation_level: level,
          message: msg
        };

        console[level](
          `\n${type} ${level}\n`,
          `  Message: ${msg}\n`,
          `  File: ${this.lang}.json\n`,
          `  Line: ${line}:${column}\n`,
          `  Key: ${this.key}\n`,
          `  ${(build ? 'String' : 'Target')}: "${this.target}"`
        );

        if (!build) console[level](`  (Source: "${this.source}")`);


      });
    }
  };

  Reporter.prototype.warn = function(type, msg) {
    this.log('warn', type, msg);
  };

  Reporter.prototype.error = function(type, msg, err) {

    const column = err ? err.location.start.column + this.key.length + 7 : '?';

    this.log('error', type, msg, column);
    if (build) {
      throw err || msg;
    }
  };

  const finalReport = {};
  const sourceStrings = targetResources['en'];

  Object.keys(targetResources).forEach((lang) => {

    const reporter = new Reporter(lang);
    const targetStrings = targetResources[lang];

    const checkedKeys = [];

    Object.keys(targetStrings).forEach((key) => {

      checkedKeys.push(key);

      const target = targetStrings[key].replace(/\n/g,'');
      const source = sourceStrings[key].replace(/\n/g,'');
      reporter.config({ key, target, source });

      if (lang != 'en' && target === source) {
        reporter.warn('untranslated', `String has not been translated.`)
        return;
      }

      let parsedTarget;

      try {
        parsedTarget = Object.freeze(parse(target, pluralCats[lang] || pluralCats[lang.split('-')[0]]));
      }
      catch(e) {

        if (e.message.indexOf('Invalid key') === 0) {
          reporter.error('plural-key', e.message, e);
        }
        else if ((target.match(/{/g) || 0).length !== (target.match(/}/g) || 0).length) {
          const charInstead = ''
          reporter.error('brace', 'Mismatched braces (i.e. {}). ' + e.message, e);
        }
        else {
          reporter.error('parse', e.message, e);
        }
      }

      if (parsedTarget) {

        const targetTokens = parsedTarget;
        const sourceTokens = parse(source, pluralCats.en);

        const map = (tokens, partsMap = { flatMap: [], arguments: new Set(), cases: [] }) => {

          tokens.forEach((token) => {

            if (typeof token !== 'string') {

              if (token.arg) {
                partsMap.arguments.add(token.arg);
              }

              if (token.cases) {
                token.cases.forEach((case_) => {

                  switch (token.type) {
                    case 'select':

                    partsMap.cases.push('select', case_.key);

                    break;
                    case 'plural':

                    partsMap.cases.push('plural');

                    break;
                  }

                  map(case_.tokens, partsMap);
                });
              }
            }

          });

          return partsMap;

        };

        const targetMap = map(targetTokens);
        const sourceMap = map(sourceTokens);

        const diff = Array.from(targetMap.arguments).filter(arg => !Array.from(sourceMap.arguments).includes(arg));

        if (diff.length) {
          reporter.error('argument', `Unrecognized arguments ${JSON.stringify(diff)}`);
        }

        if (targetMap.cases.join(',') !== sourceMap.cases.join(',')) {
          reporter.error('case', 'Case or nesting order does not match.');
        }

        if (targetMap.cases.indexOf('select') > 0) {
          reporter.warn('nest', 'Plurals should always nest inside selects.');
        }

        if (targetTokens.length > 1) {

          if (lang == 'en' && targetTokens.find((token) => typeof token !== 'string' && token.type.match(/plural|select/))) {
            reporter.warn('split','String split by non-argument (e.g. select; plural).')
          }
        }
      }

    });

    const missingKeys = Object.keys(sourceStrings).filter(arg => !checkedKeys.includes(arg));

    if (missingKeys.length) {
      missingKeys.forEach((key) => {
        reporter.config({ key, target: '', source: sourceStrings[key] });
        reporter.error('missing', `String missing from locale file.`)
      })
    }

    console.log(`\nLocale report for "${reporter.lang}":`);
    console.log(JSON.stringify(reporter.report, null, 2));

    Object.keys(reporter.report).forEach((key) => {
      finalReport[key] = finalReport[key] || 0;
      finalReport[key] += Object.values(reporter.report[key]).reduce((t,v) => t+v);
    });

  });

  if (!build) console.log('\nFINAL REPORT:\n',JSON.stringify(finalReport, null, 2),'\n');
}
