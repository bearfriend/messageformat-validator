import { parseLocales, structureRegEx, validateLocales, validateMessage } from '../src/validate.js';
import { Reporter } from '../src/reporter.js';
import { expect } from 'chai';

describe('validate', () => {

	let reporter, sourceLocale, targetLocale;
	beforeEach(() => {
		sourceLocale = 'en';
		targetLocale = 'en-gb';
		reporter = new Reporter(targetLocale);
	});

	describe('structureRegEx', () => {

		[
			{
				name: 'string',
				message: `The octopus’s friend said, “Hello!”`,
				structure: ''
			},
			{
				name: 'simple argument',
				message: 'The animal’s name is {animalName}',
				structure: '{animalName}'
			},
			{
				name: 'multiple simple arguments',
				message: 'The {animalType}’s name is {animalName}',
				structure: '{animalType}{animalName}'
			},
			{
				name: 'select',
				message: `{gender, select,
					male {{animalName} the {animalType} loves his friends}
					female {{animalName} the {animalType} loves her friends}
					other {{animalName} the {animalType} loves their friends}
				}`,
				structure: `{gender, select,
					male {{animalName}{animalType}}
					female {{animalName}{animalType}}
					other {{animalName}{animalType}}
				}`
			},
			{
				name: 'plural',
				message: `{legCount, plural,
					=0 {{animalName} the {animalType} has no legs}
					one {{animalName} the {animalType} has # leg}
					other {{animalName} the {animalType} has # legs}
				}`,
				structure: `{legCount, plural,
					=0 {{animalName}{animalType}}
					one {{animalName}{animalType}#}
					other {{animalName}{animalType}#}
				}`
			},
			{
				name: 'offset',
				message: `{octopusCount, plural, offset:2
					=0 {All octopuses are accounted for}
					=1 {{octopusName} has escaped through the drain!}
					=2 {{octopusName} and {octopus2Name} have escaped through the drain!}
					one {{octopusName}, {octopus2Name}, and # other octopus have escaped through the drain!}
					other {{octopusName}, {octopus2Name}, and # other octopuses have escaped through the drain!}
				}`,
				structure: `{octopusCount, plural, offset:2
					=0 {}
					=1 {{octopusName}}
					=2 {{octopusName}{octopus2Name}}
					one {{octopusName}{octopus2Name}#}
					other {{octopusName}{octopus2Name}#}
				}`
			},
			{
				name: 'selectordinal',
				message: `{rank, selectordinal,
					=1 {The {animalType} is the largest animal in the ocean}
					one {The {animalType} is the #st largest animal in the ocean}
					two {The {animalType} is the #nd largest animal in the ocean}
					few {The {animalType} is the #rd largest animal in the ocean}
					other {The {animalType} is the #th largest animal in the ocean}
				}`,
				structure: `{rank, selectordinal,
					=1 {{animalType}}
					one {{animalType}#}
					two {{animalType}#}
					few {{animalType}#}
					other {{animalType}#}
				}`
			},
			{
				name: 'nested',
				message: `{animalHabitat, select,
					ocean {{rank, selectordinal,
						=1 {The {animalType} is the largest animal in the ocean}
						one {The {animalType} is the #st largest animal in the ocean}
						two {The {animalType} is the #nd largest animal in the ocean}
						few {The {animalType} is the #rd largest animal in the ocean}
						other {The {animalType} is the #th largest animal in the ocean}
					}}
					land {{rank, selectordinal,
						=1 {The {animalType} is the largest animal on land}
						one {The {animalType} is the #st largest animal on land}
						two {The {animalType} is the #nd largest animal on land}
						few {The {animalType} is the #rd largest animal on land}
						other {The {animalType} is the #th largest animal on land}
					}}
					other {{rank, selectordinal,
						=1 {The {animalType} is the largest flying animal}
						one {The {animalType} is the #st largest flying animal}
						two {The {animalType} is the #nd largest flying animal}
						few {The {animalType} is the #rd largest flying animal}
						other {The {animalType} is the #th largest flying animal}
					}}
				}`,
				structure: `{animalHabitat, select,
					ocean {{rank, selectordinal,
						=1 {{animalType}}
						one {{animalType}#}
						two {{animalType}#}
						few {{animalType}#}
						other {{animalType}#}
					}}
					land {{rank, selectordinal,
						=1 {{animalType}}
						one {{animalType}#}
						two {{animalType}#}
						few {{animalType}#}
						other {{animalType}#}
					}}
					other {{rank, selectordinal,
						=1 {{animalType}}
						one {{animalType}#}
						two {{animalType}#}
						few {{animalType}#}
						other {{animalType}#}
					}}
				}`
			},
			{
				name: 'split',
				message: `There {thingCount, plural, =0 {are no} other {are #} one {is #}} {type, select, other {"uncool"} neutral {"mid"} good {"cool"}} things at {name}'s house.`,
				structure: `{thingCount, plural, =0 {} other {#} one {#}}{type, select, other {} neutral {} good {}}{name}`
			},
			{
				name: 'dates & numbers',
				message: `{animalName} the octopus’s birthday is on {birthday, date}. He invited {inviteCount, number} friends to his party, but only {acceptedShare, number, ::percent} can make it.`,
				structure: `{animalName}{birthday, date}{inviteCount, number}{acceptedShare, number, ::percent}`
			},
			{
				name: 'skeletons',
				message: `{animalName} the octopus’s birthday is on {birthday, date, ::cccccMMMMd}. He invited {inviteCount, number, ::K} friends to his party, but only {acceptedShare, number, ::percent .0} can make it.`,
				structure: `{animalName}{birthday, date, ::cccccMMMMd}{inviteCount, number, ::K}{acceptedShare, number, ::percent .0}`
			},
			{
				name: 'escapes',
				message: `An {argument}'s '{escaped}' with #'' '#'; '<b>'{notEscaped} #'</b>' '<' '}' '' <notEscaped> > '{}' '<>'`,
				structure: `{argument}#''{notEscaped}#''<notEscaped>`
			}
		].forEach(({ name, message, structure }) => {
			it(`captures messageformat structure - ${name}`, () => {
				expect((message.match(structureRegEx) ?? []).join('')).to.equal(structure);
			});
		})
	})

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
