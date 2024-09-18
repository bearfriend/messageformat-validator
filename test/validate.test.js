import { parseLocales, validateLocales, validateMessage } from '../src/validate.js';
import { Reporter } from '../src/reporter.js';
import { expect } from 'chai';

describe('validate', () => {

  let reporter, sourceLocale, targetLocale;
  beforeEach(() => {
    sourceLocale = 'en';
    targetLocale = 'en-gb';
    reporter = new Reporter(targetLocale);
  });


  describe('validateMessage', () => {

    // untranslated

    it('generates no issues with identical same-language messages', () => {
      const sourceString = 'An {arg}';
      const targetString = 'An {arg}';
      reporter.config(targetString, sourceString, 'key');
      validateMessage({ targetString, targetLocale, sourceString, sourceLocale }, reporter);
      expect(reporter.issues.length).to.equal(0);
    });

    it('generates an untranslated warning when messages are the same and languages are different', () => {
      targetLocale = 'es-mx';
      const sourceString = 'An {arg}';
      const targetString = 'An {arg}';
      reporter.config(targetString, sourceString, 'key');
      reporter._config.locale = targetLocale;
      validateMessage({ targetString, targetLocale, sourceString, sourceLocale }, reporter);
      expect(reporter.issues.length).to.equal(1);
      expect(reporter.issues[0].type).to.equal('untranslated');
      expect(reporter.issues[0].level).to.equal('warning');
      expect(reporter.issues[0].msg).to.equal('String has not been translated.');
    });

    // categories

    it('generates a categories warning when a target message is missing supported plural categories', () => {
      targetLocale = 'cy-gb';
      const sourceString = '{a, plural, one {} other {}}';
      const targetString = '{a, plural, one {} other {}}';
      reporter.config(targetString, sourceString, 'key');
      reporter._config.locale = targetLocale;
      validateMessage({ targetString, targetLocale, sourceString, sourceLocale }, reporter);
      expect(reporter.issues.length).to.equal(1);
      expect(reporter.issues[0].type).to.equal('categories');
      expect(reporter.issues[0].level).to.equal('warning');
      expect(reporter.issues[0].msg).to.equal('Missing categories: ["zero","two","few","many"]');
    });

    // plural-key

    it('generates a plural-key error when a target message uses unsupported plural categories', () => {
      const sourceString = '{a, plural, one {} other {}}';
      const targetString = '{a, plural, one {} two {} few {} many {} other {}}';
      reporter.config(targetString, sourceString, 'key');
      validateMessage({ targetString, targetLocale, sourceString, sourceLocale }, reporter);
      expect(reporter.issues.length).to.equal(1);
      expect(reporter.issues[0].type).to.equal('plural-key');
      expect(reporter.issues[0].level).to.equal('error');
      expect(reporter.issues[0].msg).to.equal('Invalid key `two` for argument `a`. Valid plural keys for this locale are `one`, `other`, and explicit keys like `=0`.');
    });

    // split

    it('generates a plural-key error when a source message is split by a complex arguemnt', () => {
      targetLocale = 'en';
      const sourceString = '{a, plural, one {} other {}} b';
      const targetString = '{a, plural, one {} other {}} b';
      reporter.config(targetString, sourceString, 'key');
      reporter._config.locale = targetLocale;
      validateMessage({ targetString, targetLocale, sourceString, sourceLocale }, reporter);
      expect(reporter.issues.length).to.equal(1);
      expect(reporter.issues[0].type).to.equal('split');
      expect(reporter.issues[0].level).to.equal('warning');
      expect(reporter.issues[0].msg).to.equal('String split by non-argument (e.g. select; plural).');
    });

    // arg

    it('generates an argument error with unrecognized argument', () => {
      const sourceString = 'An {arg}';
      const targetString = 'An {arG}';
      reporter.config(targetString, sourceString, 'key');
      validateMessage({ targetString, targetLocale, sourceString, sourceLocale }, reporter);
      expect(reporter.issues.length).to.equal(1);
      expect(reporter.issues[0].type).to.equal('argument');
      expect(reporter.issues[0].level).to.equal('error');
      expect(reporter.issues[0].msg).to.equal('Unrecognized arguments ["arG"]');
    });

    // brace

    it.skip('does not generate a brace error with parseable mismatched braces', () => {
      const sourceString = 'An {arg}';
      const targetString = 'An {arg}}';
      reporter.config(targetString, sourceString, 'key');
      validateMessage({ targetString, targetLocale, sourceString, sourceLocale }, reporter);
      expect(reporter.issues.length).to.equal(0);
    });

    it('generates a brace error with unparseable mismatched braces', () => {
      const sourceString = '{a, plural, one {An {arg}} other {}}';
      const targetString = '{a, plural, one {An {arg} other {}}';
      reporter.config(targetString, sourceString, 'key');
      validateMessage({ targetString, targetLocale, sourceString, sourceLocale }, reporter);
      expect(reporter.issues.length).to.equal(1);
      expect(reporter.issues[0].type).to.equal('brace');
      expect(reporter.issues[0].level).to.equal('error');
      expect(reporter.issues[0].msg).to.equal('Mismatched braces (i.e. {}). Expected identifier but "}" found.');
    });

    it('does not generate a brace error with escaped mismatched braces', () => {
      const sourceString = '{a, plural, one {An {arg}} other {}}';
      const targetString = '{a, plural, one {An {arg}\'}\'} other {}}';
      reporter.config(targetString, sourceString, 'key');
      validateMessage({ targetString, targetLocale, sourceString, sourceLocale }, reporter);
      expect(reporter.issues.length).to.equal(0);
    });

    // case

    it('generates a case error with unrecognized cases in select arguments', () => {
      const sourceString = '{a, select, other {}}';
      const targetString = '{a, select, b {} other {}}';
      reporter.config(targetString, sourceString, 'key');
      validateMessage({ targetString, targetLocale, sourceString, sourceLocale }, reporter);
      expect(reporter.issues.length).to.equal(1);
      expect(reporter.issues[0].type).to.equal('case');
      expect(reporter.issues[0].level).to.equal('error');
      expect(reporter.issues[0].msg).to.equal('Unrecognized cases ["b"]');
    });

    it.skip('generates a case error with missing cases in select arguments', () => {
      const sourceString = '{a, select, b {} other {}}';
      const targetString = '{a, select, other {}}';
      reporter.config(targetString, sourceString, 'key');
      validateMessage({ targetString, targetLocale, sourceString, sourceLocale }, reporter);
      expect(reporter.issues.length).to.equal(1);
      expect(reporter.issues[0].type).to.equal('case');
      expect(reporter.issues[0].level).to.equal('error');
      expect(reporter.issues[0].msg).to.equal('Missing cases ["b"]');
    });

    // nbsp

    it('generates an nbsp error with non-breaking space in the messageformat structure', () => {
      const sourceString = '{a, select, other {}}';
      const targetString = '{a, select,\u00A0other {}}';
      reporter.config(targetString, sourceString, 'key');
      validateMessage({ targetString, targetLocale, sourceString, sourceLocale }, reporter);
      expect(reporter.issues.length).to.equal(2);
      expect(reporter.issues[0].type).to.equal('nbsp');
      expect(reporter.issues[0].level).to.equal('error');
      expect(reporter.issues[0].msg).to.equal('String contains invalid non-breaking space at position 11.');

      expect(reporter.issues[1].type).to.equal('case');
      expect(reporter.issues[1].level).to.equal('error');
      expect(reporter.issues[1].msg).to.equal('Unrecognized cases ["\u00A0other"]');
    });

    // nest

    it('generates a nest-order error with mismatched complex argument order', () => {
      const sourceString = '{a, select, other {{b, select, other {}}}}';
      const targetString = '{b, select, other {{a, select, other {}}}}';
      reporter.config(targetString, sourceString, 'key');
      validateMessage({ targetString, targetLocale, sourceString, sourceLocale }, reporter);
      expect(reporter.issues.length).to.equal(1);
      expect(reporter.issues[0].type).to.equal('nest-order');
      expect(reporter.issues[0].level).to.equal('warning');
      expect(reporter.issues[0].msg).to.equal('Nesting order does not match source.');
    });

    it('generates a nest-ideal error with plural inside select', () => {
      const sourceString = '{a, plural, one {} other {{b, select, other {}}}}';
      const targetString = '{a, plural, one {} other {{b, select, other {}}}}';
      reporter.config(targetString, sourceString, 'key');
      validateMessage({ targetString, targetLocale, sourceString, sourceLocale }, reporter);
      expect(reporter.issues.length).to.equal(1);
      expect(reporter.issues[0].type).to.equal('nest-ideal');
      expect(reporter.issues[0].level).to.equal('warning');
      expect(reporter.issues[0].msg).to.equal('"plural" and "selectordinal" should always nest inside "select".');
    });

    // other

    it('generates an other error with missing other case', () => {
      const sourceString = '{a, select, b {}}';
      const targetString = '{a, select, b {}}';
      reporter.config(targetString, sourceString, 'key');
      validateMessage({ targetString, targetLocale, sourceString, sourceLocale }, reporter);
      expect(reporter.issues.length).to.equal(1);
      expect(reporter.issues[0].type).to.equal('other');
      expect(reporter.issues[0].level).to.equal('error');
      expect(reporter.issues[0].msg).to.equal('Missing "other" case');
    });

    // parse

    it('generates a parse error with an unparseable target message', () => {
      const sourceString = '{a, select, b {}}';
      const targetString = '{a, select b {}}';
      reporter.config(targetString, sourceString, 'key');
      validateMessage({ targetString, targetLocale, sourceString, sourceLocale }, reporter);
      expect(reporter.issues.length).to.equal(1);
      expect(reporter.issues[0].type).to.equal('parse');
      expect(reporter.issues[0].level).to.equal('error');
      expect(reporter.issues[0].msg).to.equal('Expected "," but "b" found.');
    });

    // source

    it('generates a source-error error an unparseable source message', () => {
      const sourceString = '{a, select b {}}';
      const targetString = '{a, select, b {}}';
      reporter.config(targetString, sourceString, 'key');
      validateMessage({ targetString, targetLocale, sourceString, sourceLocale }, reporter);
      expect(reporter.issues.length).to.equal(1);
      expect(reporter.issues[0].type).to.equal('source-error');
      expect(reporter.issues[0].level).to.equal('error');
      expect(reporter.issues[0].msg).to.equal('Failed to parse source string.');
    });

  });

  describe('validateLocales', () => {

    // extraneous

    it('generates an extraneous error with unexpected message in target locale', () => {
      const sourceString = '{a, select, other {}}';
      const targetString = '{a, select, other {}}';
      const locales = parseLocales([{
        file: `${targetLocale}.json`,
        contents: JSON.stringify({
          a: targetString,
          b: targetString
        }, null, '\t')
      },
      {
        file: `${sourceLocale}.json`,
        contents: JSON.stringify({
          a: sourceString
        }, null, '\t')
      }]);

      validateLocales({ locales, sourceLocale }, reporter);
      expect(reporter.issues.length).to.equal(1);
      expect(reporter.issues[0].type).to.equal('extraneous');
      expect(reporter.issues[0].level).to.equal('error');
      expect(reporter.issues[0].msg).to.equal('This string does not exist in the source file.');
    });

    // missing

    it('generates a missing error with missing message in the target locale', () => {
      const sourceString = '{a, select, other {}}';
      const targetString = '{a, select, other {}}';
      const locales = parseLocales([{
        file: `${targetLocale}.json`,
        contents: JSON.stringify({
          a: targetString
        }, null, '\t')
      },
      {
        file: `${sourceLocale}.json`,
        contents: JSON.stringify({
          a: sourceString,
          b: sourceString
        }, null, '\t')
      }]);

      validateLocales({ locales, sourceLocale }, reporter);
      expect(reporter.issues.length).to.equal(1);
      expect(reporter.issues[0].type).to.equal('missing');
      expect(reporter.issues[0].level).to.equal('error');
      expect(reporter.issues[0].msg).to.equal('String missing from locale file.');
    });

    // duplicate-keys

    it('generates a duplicate-keys error with duplicate messages in the target locale', () => {
      const sourceString = '{a, select, other {}}';
      const targetString = '{a, select, other {}}';
      const locales = parseLocales([{
        file: `${targetLocale}.json`,
        contents: `{
          "a": "${sourceString}",
          "a": "${sourceString}"
        }`
      },
      {
        file: `${sourceLocale}.json`,
        contents: `{
          "a": "${targetString}"
        }`
      }]);

      validateLocales({ locales, sourceLocale }, reporter);
      expect(reporter.issues.length).to.equal(1);
      expect(reporter.issues[0].type).to.equal('duplicate-keys');
      expect(reporter.issues[0].level).to.equal('error');
      expect(reporter.issues[0].msg).to.equal('Key appears multiple times');
    });

  });
});
