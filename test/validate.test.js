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
			const sourceMessage = 'An {arg}';
			const targetMessage = 'An {arg}';
			reporter.config(targetMessage, sourceMessage, 'key');
			validateMessage({ targetMessage, targetLocale, sourceMessage, sourceLocale }, reporter);
			expect(reporter.issues.length).to.equal(0);
		});

		it('generates an "untranslated" warning when messages are the same and languages are different', () => {
			targetLocale = 'es-mx';
			const sourceMessage = 'An {arg}';
			const targetMessage = 'An {arg}';
			reporter.config(targetMessage, sourceMessage, 'key');
			reporter._config.locale = targetLocale;
			validateMessage({ targetMessage, targetLocale, sourceMessage, sourceLocale }, reporter);
			expect(reporter.issues.length).to.equal(1);
			expect(reporter.issues[0].type).to.equal('untranslated');
			expect(reporter.issues[0].level).to.equal('warning');
			expect(reporter.issues[0].msg).to.equal('Message has not been translated.');
		});

		// categories

		it('generates a "categories" warning when a target message is missing supported plural categories', () => {
			targetLocale = 'cy-gb';
			const sourceMessage = '{a, plural, one {} other {}}';
			const targetMessage = '{a, plural, one {} other {}}';
			reporter.config(targetMessage, sourceMessage, 'key');
			reporter._config.locale = targetLocale;
			validateMessage({ targetMessage, targetLocale, sourceMessage, sourceLocale }, reporter);
			expect(reporter.issues.length).to.equal(1);
			expect(reporter.issues[0].type).to.equal('categories');
			expect(reporter.issues[0].level).to.equal('warning');
			expect(reporter.issues[0].msg).to.equal('Missing categories "zero", "two", "few", and "many"');
		});

		it('generates "categories" errors when a target message uses unsupported plural categories', () => {
			const sourceMessage = '{a, plural, one {} other {}}';
			const targetMessage = '{a, plural, =1 {} one {} two {} few {} many {} other {}}';
			reporter.config(targetMessage, sourceMessage, 'key');
			validateMessage({ targetMessage, targetLocale, sourceMessage, sourceLocale }, reporter);

			expect(reporter.issues.length).to.equal(3);

			expect(reporter.issues[0].type).to.equal('categories');
			expect(reporter.issues[0].level).to.equal('error');
			expect(reporter.issues[0].msg).to.equal('Unsupported category "two". Must be one of: "one", "other", or explicit keys like "=0"');

			expect(reporter.issues[1].type).to.equal('categories');
			expect(reporter.issues[1].level).to.equal('error');
			expect(reporter.issues[1].msg).to.equal('Unsupported category "few". Must be one of: "one", "other", or explicit keys like "=0"');

			expect(reporter.issues[2].type).to.equal('categories');
			expect(reporter.issues[2].level).to.equal('error');
			expect(reporter.issues[2].msg).to.equal('Unsupported category "many". Must be one of: "one", "other", or explicit keys like "=0"');
		});

		it('generates "categories" errors when a target message uses nested unsupported plural categories', () => {
			const sourceMessage = '{a, plural, one {} other {}}';
			const targetMessage = '{a, plural, one {{a, plural, one {} two {} other {}}} other {}}';
			reporter.config(targetMessage, sourceMessage, 'key');
			validateMessage({ targetMessage, targetLocale, sourceMessage, sourceLocale }, reporter);

			expect(reporter.issues.length).to.equal(1);
			expect(reporter.issues[0].type).to.equal('categories');
			expect(reporter.issues[0].level).to.equal('error');
			expect(reporter.issues[0].msg).to.equal('Unsupported category "two". Must be one of: "one", "other", or explicit keys like "=0"');
		});

		// split

		it('generates a "split" error when a source message is split by a complex argument', () => {
			targetLocale = 'en';
			const sourceMessage = '{a, plural, one {} other {}} b';
			const targetMessage = '{a, plural, one {} other {}} b';
			reporter.config(targetMessage, sourceMessage, 'key');
			reporter._config.locale = targetLocale;
			validateMessage({ targetMessage, targetLocale, sourceMessage, sourceLocale }, reporter);
			expect(reporter.issues.length).to.equal(1);
			expect(reporter.issues[0].type).to.equal('split');
			expect(reporter.issues[0].level).to.equal('warning');
			expect(reporter.issues[0].msg).to.equal('Message split by complex argument');
		});

		// arg

		it('generates an "argument" error with unrecognized argument', () => {
			const sourceMessage = 'An {arg}';
			const targetMessage = 'An {arG}';
			reporter.config(targetMessage, sourceMessage, 'key');
			validateMessage({ targetMessage, targetLocale, sourceMessage, sourceLocale }, reporter);
			expect(reporter.issues.length).to.equal(1);
			expect(reporter.issues[0].type).to.equal('argument');
			expect(reporter.issues[0].level).to.equal('error');
			expect(reporter.issues[0].msg).to.equal('Unrecognized arguments: arG. Must be one of: arg');
		});

		// brace

		it('does not generate a "brace" error with parseable mismatched braces', () => {
			const sourceMessage = 'An {arg}';
			const targetMessage = 'An {arg}}';
			reporter.config(targetMessage, sourceMessage, 'key');
			validateMessage({ targetMessage, targetLocale, sourceMessage, sourceLocale }, reporter);
			expect(reporter.issues.length).to.equal(0);
		});

		it('generates a "brace" error with unparseable mismatched braces', () => {
			const sourceMessage = '{a, plural, one {An {arg}} other {{a} args}}';
			const targetMessage = '{a, plural, one {An {arg} other {{a} args}';
			reporter.config(targetMessage, sourceMessage, 'key');
			validateMessage({ targetMessage, targetLocale, sourceMessage, sourceLocale }, reporter);
			expect(reporter.issues.length).to.equal(1);
			expect(reporter.issues[0].type).to.equal('brace');
			expect(reporter.issues[0].level).to.equal('error');
			expect(reporter.issues[0].msg).to.equal('Mismatched braces');
		});

		it('does not generate a "brace" error with escaped mismatched braces', () => {
			const sourceMessage = '{a, plural, one {An {arg}} other {}}';
			const targetMessage = '{a, plural, one {An {arg}\'}\'} other {}}';
			reporter.config(targetMessage, sourceMessage, 'key');
			validateMessage({ targetMessage, targetLocale, sourceMessage, sourceLocale }, reporter);
			expect(reporter.issues.length).to.equal(0);
		});

		// option

		it('generates "option" errors with unrecognized cases in select arguments', () => {
			const sourceMessage = '{a, select, b {} other {}}';
			const targetMessage = '{a, select, B {} C {} other {}}';
			reporter.config(targetMessage, sourceMessage, 'key');
			validateMessage({ targetMessage, targetLocale, sourceMessage, sourceLocale }, reporter);

			expect(reporter.issues.length).to.equal(2);

			expect(reporter.issues[0].type).to.equal('option');
			expect(reporter.issues[0].level).to.equal('error');
			expect(reporter.issues[0].msg).to.equal('Unrecognized option "B". Must be one of "b", "other".');

			expect(reporter.issues[1].type).to.equal('option');
			expect(reporter.issues[1].level).to.equal('error');
			expect(reporter.issues[1].msg).to.equal('Unrecognized option "C". Must be one of "b", "other".');
		});

		it.skip('generates a "option" error with missing cases in select arguments', () => {
			const sourceMessage = '{a, select, b {} other {}}';
			const targetMessage = '{a, select, other {}}';
			reporter.config(targetMessage, sourceMessage, 'key');
			validateMessage({ targetMessage, targetLocale, sourceMessage, sourceLocale }, reporter);
			expect(reporter.issues.length).to.equal(1);
			expect(reporter.issues[0].type).to.equal('option');
			expect(reporter.issues[0].level).to.equal('error');
			expect(reporter.issues[0].msg).to.equal('Missing cases ["b"]');
		});

		// nbsp

		it('generates an "nbsp" error with non-breaking space in the messageformat structure', () => {
			const sourceMessage = '{a, select, a {} other {}}';
			const targetMessage = '{a, select,\u00A0a {} other {}}';
			reporter.config(targetMessage, sourceMessage, 'key');
			validateMessage({ targetMessage, targetLocale, sourceMessage, sourceLocale }, reporter);

			expect(reporter.issues.length).to.equal(1);
			expect(reporter.issues[0].type).to.equal('nbsp');
			expect(reporter.issues[0].level).to.equal('error');
			expect(reporter.issues[0].msg).to.equal('Message contains invalid non-breaking space at position 11.');
		});

		// nest

		it('generates a "nest-order" error with mismatched complex argument order', () => {
			const sourceMessage = '{a, select, other {{b, select, other {}}}}';
			const targetMessage = '{b, select, other {{a, select, other {}}}}';
			reporter.config(targetMessage, sourceMessage, 'key');
			validateMessage({ targetMessage, targetLocale, sourceMessage, sourceLocale }, reporter);
			expect(reporter.issues.length).to.equal(1);
			expect(reporter.issues[0].type).to.equal('nest-order');
			expect(reporter.issues[0].level).to.equal('warning');
			expect(reporter.issues[0].msg).to.equal('Nesting order does not match source.');
		});

		it('generates a "nest-ideal" error with plural inside select', () => {
			const sourceMessage = '{a, plural, one {} other {{b, select, other {}}}}';
			const targetMessage = '{a, plural, one {} other {{b, select, other {}}}}';
			reporter.config(targetMessage, sourceMessage, 'key');
			validateMessage({ targetMessage, targetLocale, sourceMessage, sourceLocale }, reporter);
			expect(reporter.issues.length).to.equal(1);
			expect(reporter.issues[0].type).to.equal('nest-ideal');
			expect(reporter.issues[0].level).to.equal('warning');
			expect(reporter.issues[0].msg).to.equal('"plural" and "selectordinal" should always nest inside "select".');
		});

		// other

		it('generates an "other" error with missing other case', () => {
			const sourceMessage = '{a, select, b {}}';
			const targetMessage = '{a, select, b {}}';
			reporter.config(targetMessage, sourceMessage, 'key');
			validateMessage({ targetMessage, targetLocale, sourceMessage, sourceLocale }, reporter);

			expect(reporter.issues.length).to.equal(1);
			expect(reporter.issues[0].type).to.equal('other');
			expect(reporter.issues[0].level).to.equal('error');
			expect(reporter.issues[0].msg).to.equal('Missing "other" option');
		});

		it('generates an "other" error with missing nested other case', () => {
			const sourceMessage = '{a, select, other {{c, select, b {}}}}';
			const targetMessage = '{a, select, other {{c, select, b {}}}}';
			reporter.config(targetMessage, sourceMessage, 'key');
			validateMessage({ targetMessage, targetLocale, sourceMessage, sourceLocale }, reporter);

			expect(reporter.issues.length).to.equal(1);
			expect(reporter.issues[0].type).to.equal('other');
			expect(reporter.issues[0].level).to.equal('error');
			expect(reporter.issues[0].msg).to.equal('Missing "other" option');
		});

		// parse

		it('generates a "parse" error with an unparseable target message', () => {
			const sourceMessage = '{a, select, b {}}';
			const targetMessage = '{a, select b {}}';
			reporter.config(targetMessage, sourceMessage, 'key');
			validateMessage({ targetMessage, targetLocale, sourceMessage, sourceLocale }, reporter);
			expect(reporter.issues.length).to.equal(1);
			expect(reporter.issues[0].type).to.equal('parse');
			expect(reporter.issues[0].level).to.equal('error');
			expect(reporter.issues[0].msg).to.equal('Expected "," but "b" found');
		});

		// source

		it('generates a "source-error" error an unparseable source message', () => {
			const sourceMessage = '{a, select other {}}';
			const targetMessage = '{a, select, other {}}';
			reporter.config(targetMessage, sourceMessage, 'key');
			validateMessage({ targetMessage, targetLocale, sourceMessage, sourceLocale }, reporter);
			expect(reporter.issues.length).to.equal(1);
			expect(reporter.issues[0].type).to.equal('source-error');
			expect(reporter.issues[0].level).to.equal('error');
			expect(reporter.issues[0].msg).to.equal('Failed to parse source message.');
		});

	});

	describe('validateLocales', () => {

		// extraneous

		it('generates an "extraneous" error with unexpected message in target locale', () => {
			const sourceMessage = '{a, select, other {}}';
			const targetMessage = '{a, select, other {}}';
			const locales = parseLocales([{
				file: `${targetLocale}.json`,
				contents: JSON.stringify({
					a: targetMessage,
					b: targetMessage
				}, null, '\t')
			},
			{
				file: `${sourceLocale}.json`,
				contents: JSON.stringify({
					a: sourceMessage
				}, null, '\t')
			}]);

			validateLocales({ locales, sourceLocale }, reporter);
			expect(reporter.issues.length).to.equal(1);
			expect(reporter.issues[0].type).to.equal('extraneous');
			expect(reporter.issues[0].level).to.equal('error');
			expect(reporter.issues[0].msg).to.equal('Message does not exist in the source file.');
		});

		// missing

		it('generates a "missing" error with missing message in the target locale', () => {
			const sourceMessage = '{a, select, other {}}';
			const targetMessage = '{a, select, other {}}';
			const locales = parseLocales([{
				file: `${targetLocale}.json`,
				contents: JSON.stringify({
					a: targetMessage
				}, null, '\t')
			},
			{
				file: `${sourceLocale}.json`,
				contents: JSON.stringify({
					a: sourceMessage,
					b: sourceMessage
				}, null, '\t')
			}]);

			validateLocales({ locales, sourceLocale }, reporter);
			expect(reporter.issues.length).to.equal(1);
			expect(reporter.issues[0].type).to.equal('missing');
			expect(reporter.issues[0].level).to.equal('error');
			expect(reporter.issues[0].msg).to.equal('Message missing from locale file.');
		});

		// duplicate-keys

		it('generates a "duplicate-keys" error with duplicate messages in the target locale', () => {
			const sourceMessage = '{a, select, other {}}';
			const targetMessage = '{a, select, other {}}';
			const locales = parseLocales([{
				file: `${targetLocale}.json`,
				contents: `{
          "a": "${sourceMessage}",
          "a": "${sourceMessage}"
        }`
			},
			{
				file: `${sourceLocale}.json`,
				contents: `{
          "a": "${targetMessage}"
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
