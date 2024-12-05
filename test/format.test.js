import { expect } from 'chai';
import { formatMessage } from '../src/format.js';

describe('formatMessage', () => {

	let locale;
	beforeEach(() => {
		locale = 'en';
	});

	[
		{ locale: 'ar', expected: `This isn’t ”correct“` },
		{ locale: 'cy', expected: `This isn’t “correct”` },
		{ locale: 'de', expected: `This isn’t „correct“` },
		{ locale: 'en', expected: `This isn’t “correct”` },
		{ locale: 'en-gb', expected: `This isn’t ‘correct’` },
		{ locale: 'fr', expected: `This isn’t «\u202fcorrect\u202f»` },
		{ locale: 'sv', expected: `This isn’t ”correct”` },
	].forEach(({ locale, expected }) => {
		it(`should replace straight quotes with "${locale}" quotes when "quotes" option is "straight"`, () => {
			const message = `This isn't "correct"`;
			const formatted = formatMessage(message, { locale, quotes: 'straight' });
			expect(formatted).to.equal(expected);
		});

		it(`should replace source quotes with "${locale}" quotes when "quotes" option is "source"`, () => {
			const message = `This isn’t “correct”`;
			const formatted = formatMessage(message, { locale, sourceLocale: 'en', quotes: 'source' });
			expect(formatted).to.equal(expected);
		});
	});

	[
		{ locale: 'ar', expected:
`{a, plural,
	one {{b, selectordinal,
		other {}
	}}
	two {}
	few {}
	many {}
	other {}
}` },
		{ locale: 'cy', expected:
`{a, plural,
	one {{b, selectordinal,
		one {}
		two {}
		few {}
		many {}
		other {}
	}}
	two {}
	few {}
	many {}
	other {}
}` },
		{ locale: 'es', expected:
`{a, plural,
	one {{b, selectordinal,
		other {}
	}}
	many {}
	other {}
}` },
		{ locale: 'fr', expected:
`{a, plural,
	one {{b, selectordinal,
		one {}
		other {}
	}}
	many {}
	other {}
}` },
		{ locale: 'ja', expected:
`{a, plural,
	other {}
}` },
	].forEach(({ locale, expected }) => {
		it(`should remove plural and selectordinal categories that are unsupported in "${locale}" with the "remove" option`, () => {
			const message =
`{a, plural,
	one {{b, selectordinal, one {} two {} few {} many {} other {}}}
  two {}
  few {}
  many {}
  other {}
}`;
			const formatted = formatMessage(message, { locale, remove: true });
			expect(formatted).to.equal(expected);
		});
	});

	it(`should not remove plural and selectordinal categories that are unsupported without the "remove" option`, () => {
		const message = `{a, plural, one {{b, selectordinal, one {} two {} few {} many {} other {}}}}`;
		const formatted = formatMessage(message, { locale });
		expect(formatted).to.equal(message);
	});

	it(`should insert newslines and tabs with the "newlines" option`, () => {
		const message = `{a, plural, one {{b, selectordinal, one {} two {} few {} many {} other {}}}}`;
		const expected = `{a, plural,\n\tone {{b, selectordinal,\n\t\tone {}\n\t\ttwo {}\n\t\tfew {}\n\t\tmany {}\n\t\tother {}\n\t}}\n}`;
		const formatted = formatMessage(message, { locale, newlines: true });
		expect(formatted).to.equal(expected);
	});

	it(`should insert newslines and tabs if the message structure already contains newlines with no option`, () => {
		const message = `{a, plural,\none {{b, selectordinal, one {} two {} few {} many {} other {}}}}`;
		const expected = `{a, plural,\n\tone {{b, selectordinal,\n\t\tone {}\n\t\ttwo {}\n\t\tfew {}\n\t\tmany {}\n\t\tother {}\n\t}}\n}`;
		const formatted = formatMessage(message, { locale });
		expect(formatted).to.equal(expected);
	});

	it(`should remove categories that are copies of a lower-precedence key with the "dedupe" option`, () => {
		const message = `{a, plural, one {value} other {value}}`;
		const expected = `{a, plural, other {value}}`;
		const formatted = formatMessage(message, { locale, dedupe: true });
		expect(formatted).to.equal(expected);
	});

	it(`should convert "=1" keys to "one" when it contains a literal "1"`, () => {
		const message = `{a, plural, =1 {value 1}}`;
		const expected = `{a, plural, one {value {a}}}`;
		const formatted = formatMessage(message, { locale, dedupe: true });
		expect(formatted).to.equal(expected);
	});

	it(`should remove "=1" cases when they can be converted to a duplicate case with the "dedupe" option`, () => {
		const message = `{a, plural, =1 {value 1} other {value {a}}}`;
		const expected = `{a, plural, other {value {a}}}`;
		const formatted = formatMessage(message, { locale, dedupe: true });
		expect(formatted).to.equal(expected);
	});

	it(`should remove "=1" cases when they can be converted to unsupported "one" cases with the "remove" option`, () => {
		locale = 'ja';
		const message = `{a, plural, =1 {value 1} other {value {a}}}`;
		const expected = `{a, plural, other {value {a}}}`;
		const formatted = formatMessage(message, { locale, remove: true });
		expect(formatted).to.equal(expected);
	});

	it(`should convert unsupported cases to "other" if there are no other cases`, () => {
		locale = 'ja';
		const message = `{a, plural, two {value {a}}}`;
		const expected = `{a, plural, other {value {a}}}`;
		const formatted = formatMessage(message, { locale, remove: true });
		expect(formatted).to.equal(expected);
	});

	it(`should convert "=1" keys to "other" keys when they can be converted to unsupported "one" cases and there are no other keys with the "remove" option`, () => {
		locale = 'ja';
		const message = `{a, plural, =1 {value 1}}}`;
		const expected = `{a, plural, other {value {a}}}}`;
		const formatted = formatMessage(message, { locale, remove: true });
		expect(formatted).to.equal(expected);
	});

	it('should hoist complex selectors to the outside and nest appropriately with no options', () => {
		const message = `\t{a, plural, =1 {a cat} other {{a} cats}} and {b, plural, =1 {a dog} other {{b} dogs}}!`;
		const expected = `{a, plural, =1 {{b, plural, =1 {\ta cat and a dog!} other {\ta cat and {b} dogs!}}} other {{b, plural, =1 {\t{a} cats and a dog!} other {\t{a} cats and {b} dogs!}}}}`;
		const formatted = formatMessage(message, { locale });
		expect(formatted).to.equal(expected);
	});

	it(`should trim whitespace with the "trim" option`, () => {
		const message = `\n{a, plural, other {  value  }}\t`;
		const expected = `{a, plural, other {value}}`;
		const formatted = formatMessage(message, { locale, trim: true });
		expect(formatted).to.equal(expected);
	});

	it(`should not trim internal whitespace with the "trim" option`, () => {
		const message = `\n{a, plural, other { value {value2} value3 }}`;
		const expected = `{a, plural, other {value {value2} value3}}`;
		const formatted = formatMessage(message, { locale, trim: true });
		expect(formatted).to.equal(expected);
	});

	it(`should replace bad plural categories with no options`, () => {
		const message = `{a, plural, one {b} अन्य {च}}`;
		const expected = `{a, plural, one {b} other {च}}`;
		const formatted = formatMessage(message, { locale });
		expect(formatted).to.equal(expected);
	});

	it(`should not replace bad plural categories when ambiguous`, () => {
		const message = `{a, plural, अन्य {च}}`;
		const expected = `{a, plural, अन्य {च}}`;
		const formatted = formatMessage(message, { locale });
		expect(formatted).to.equal(expected);
	});

});
