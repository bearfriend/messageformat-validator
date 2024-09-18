import { expect } from 'chai';
import { formatMessage } from '../src/format.js';

describe('formatMessage', () => {

  [
    { locale: 'ar', expected: `This isn’t ”correct“` },
    { locale: 'cy', expected: `This isn’t “correct”` },
    { locale: 'de', expected: `This isn’t „correct“` },
    { locale: 'en', expected: `This isn’t “correct”` },
    { locale: 'en-gb', expected: `This isn’t ‘correct’` },
    { locale: 'fr', expected: `This isn’t «correct»` },
    { locale: 'sv', expected: `This isn’t ”correct”` },
  ].forEach(({ locale, expected }) => {
    it(`should replace straight quotes with "${locale}" quotes with no options`, () => {
      const message = `This isn't "correct"`;
      const formatted = formatMessage(message, { locale });
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

});
