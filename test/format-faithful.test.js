import { expect } from 'chai';
import { parse } from '@formatjs/icu-messageformat-parser';
import { formatMessageSync } from '../src/index.js';

// The parser may split the same text into several nodes (around `<br/>`, say), which is not a difference in meaning.
const mergeText = nodes => nodes.reduce((merged, node) => {
	if (node.children) node = { ...node, children: mergeText(node.children) };
	if (node.options) node = { ...node, options: Object.fromEntries(Object.entries(node.options).map(([key, { value }]) => [key, { value: mergeText(value) }])) };
	const last = merged.at(-1);
	if (node.type === 0 && last?.type === 0) last.value += node.value;
	else merged.push(node);
	return merged;
}, []);

const meaning = message => JSON.stringify(mergeText(parse(message, { requiresOtherClause: false })), (key, value) => key === 'location' ? undefined : value);

const format = (message, options = {}) => formatMessageSync(message, { locale: 'en', ...options });

describe('formatting does not change what a message means', () => {

	const messages = [
		// skeleton options
		'{n, number, ::currency/USD}',
		'{n, number, ::compact-short currency/USD unit-width-narrow}',
		'{n, number, ::percent scale/100}',
		'{n, number, ::unit/meter-per-second}',
		'{d, date, ::yyyyMMdd}',
		'{d, date, short}',
		// `#` is only a placeholder directly in a plural
		"{n, plural, one {'#' item} other {'#' items}}",
		"{n, plural, one {# item} other {'#' items}}",
		"{n, plural, other {a '#' b and '#' c}}",
		"{n, plural, other {<b>'#'</b> #}}",
		"{n, plural, other {''#''}}",
		"{n, plural, other {{g, select, a {#} other {x}}}}",
		"{g, select, other {'#' #}}",
		// braces that are text
		"x '{{ y {n}",
		"x '{ y",
		"a '{{' b",
		"'{' {n}",
		"It''s '{x}'",
		"{n, plural, other {a '{' b}}",
		"{g, select, a {it's '{x}'} other {y}}",
		"{n, plural, other {'{'#'}'}}",
		"<b>x '{{ y'</b>",
		"a'{",
		"a'''{'",
		"'{'''x",
		"x '{''",
		"x '{{''",
		"{n, plural, other {'''#'}}",
		"'{'' x",
		// quoted tags and angle brackets
		"Use '<b>' to bold",
		"Use '<b>' to bold {n}",
		"a '<b>' b",
		"'<b>x</b>'",
		"Press '<Enter>' now",
		"'</b>'",
		"x '<i/>' y",
		"{n, plural, one {Use '<b>'} other {Use '<b>' {n}}}",
		"5 > 3 and 2 < 4",
		"'<' and '>'",
		"a <br/> b",
		"'<br/>' x",
		"<i/>#",
		"{n, plural, other {x <br/> #}}",
		"a '<b' c",
		// one quote that holds a tag and an argument (or two tags, or a brace), so more than one thing has to be quoted together
		"Use '<b>{name}</b>' to bold",
		"'<b>{n}</b>'",
		"'{n}<b>x</b>'",
		"'<b>x</b>{n}'",
		"'<b>{'",
		"'{</b>'",
		"{n, plural, one {'<b>{x}</b>'} other {y}}",
		"l'<b>{n}</b>",
		// separate quotes stay separate
		"'<b>x</b>' and '{n}'",
		"Use '<b>' and '{x}' too",
		"'<b>' x '{' y '}'",
		"'{n}' and '<b>x</b>'",
		"x '<b> y''",
		// an apostrophe in text that an argument or the end of an option would otherwise swallow
		"a''{n}",
		"{n, plural, other {a''}}",
		"{n, plural, other {x''{g}}}",
		"{n, plural, other {x''#}}",
		"{n, plural, other {x''<b>y</b>}}",
		"{n, plural, other {x''''}}",
		"Dogs''",
	];

	messages.forEach(message => {
		[{ essentials: false }, { apostrophes: false, hoist: false, normalizeOne: false, renameCategories: false, sort: false }].forEach(options => {
			it(`${JSON.stringify(message)} ${JSON.stringify(options)}`, () => {
				const { message: formatted, error } = format(message, options);
				expect(error).to.equal(undefined);
				expect(meaning(formatted), formatted).to.equal(meaning(message));
				expect(format(formatted, options).message, 'formatting twice').to.equal(formatted);
			});
		});
	});

	describe('exact output', () => {
		const same = [
			"Use '<b>' to bold",
			"Press '<Enter>' now",
			"{n, plural, one {Use '<b>'} other {x}}",
			"Use '<b>{name}</b>' to bold",
			"{n, plural, one {'<b>{x}</b>'} other {y}}",
			"Use '<b>' and '{x}' too",
			"'<b>x</b>' and '{n}'",
			"'<b>\n{n}</b>'",
			"5 > 3 and 2 < 4",
			'{n, number, ::currency/USD}',
			'{n, number, ::compact-short currency/USD unit-width-narrow}',
			"{n, plural, one {'#' item} other {# items}}",
			"{n, plural, other {{g, select, a {#} other {x}}}}",
			"{n, plural, other {a '{x}' b}}",
			"{g, select, a {'{x}'} other {y}}",
			"{n, plural, other {<b>'#'</b> #}}",
		];
		same.forEach(message => {
			it(`keeps ${JSON.stringify(message)} as it is, with every rewrite on`, () => {
				expect(format(message).message).to.equal(message);
			});
		});

		it('quotes braces that an unterminated escape run left in the text', () => {
			expect(format("x '{{ y {n}").message).to.equal("x '{{ y {n}'");
			expect(format("x '{ y", { essentials: false }).message).to.equal("x '{' y");
		});

		it('leaves a `#` that is only text alone, and does not double the apostrophes around it', () => {
			['The \'#\' key', '{g, select, a {The \'#\' key} other {x}}'].forEach(message => {
				expect(format(message, { essentials: false }).message).to.equal(message);
			});
			expect(format("The '#' key").message).to.equal('The ’#’ key');
		});

		it('quotes a literal `<` that would open a tag, but not a self-closing tag, which is only text', () => {
			expect(format("Use '<b>' to bold", { essentials: false }).message).to.equal("Use '<b>' to bold");
			expect(format('a <br/> b', { essentials: false }).message).to.equal('a <br/> b');
			expect(format('{n, plural, other {x <br/> #}}', { essentials: false }).message).to.equal('{n, plural, other {x <br/> #}}');
		});

		it('quotes the apostrophes right after a stray brace along with it', () => {
			// (Formatting the result again is not stable for these, so they are not in the lists above.)
			["}'' <b>x</b>", "}'", "a}'"].forEach(message => {
				const { message: formatted } = format(message, { essentials: false });
				expect(meaning(formatted), formatted).to.equal(meaning(message));
			});
			expect(format("}'' <b>x</b>", { essentials: false }).message).to.equal("'}''' <b>x</b>");
		});

		it('does not guess what an author meant by a lone apostrophe in front of a tag: it quotes the tag, which then shows up as text', () => {
			// `'<` opens a quote that never closes, so the parser reads `<b>abc</b>` as literal text. The formatter keeps that
			// meaning and makes it explicit (a closing quote), rather than turning the apostrophe into text or the tag into markup.
			['essentials', 'defaults'].forEach(mode => {
				const options = mode === 'essentials' ? { essentials: false } : {};
				const { message: formatted } = format("l'<b>abc</b>", options);
				expect(formatted).to.equal("l'<b>abc</b>'");
				expect(format(formatted, options).message, 'formatting twice').to.equal(formatted);
				expect(meaning(formatted)).to.equal(meaning("l'<b>abc</b>"));
				expect(parse(formatted).map(node => node.type), 'one text node, no tag').to.deep.equal([0]);
			});
			// A doubled apostrophe is how an author writes a real one, and that is kept.
			expect(format("l''<b>abc</b>", { essentials: false }).message).to.equal("l''<b>abc</b>");
		});

		it('keeps an apostrophe inside such a quote as a doubled one, even when curling apostrophes', () => {
			expect(format("x '{{ it''s {n}").message).to.equal("x '{{ it’s {n}'");
			expect(format("x '{{ it''s {n}", { essentials: false }).message).to.equal("x '{{ it''s {n}'");
		});

		it('curls each apostrophe inside such a quote once, in any case, and not when they are not being curled', () => {
			expect(format("x '{{ it''s ''ok'' {n}").message).to.equal("x '{{ it’s ’ok’ {n}'");
			expect(format("{g, select, a {l'<b>it''s</b>} other {y}}", { hoist: false }).message).to.equal("{g, select, a {l'<b>it’s</b>'} other {y}}");
			expect(format("x '{{ it''s {n}", { apostrophes: false }).message).to.equal("x '{{ it''s {n}'");
		});

		it('does not leave a single apostrophe in such a quote when `quotes` replaces them instead, as it would close the quote', () => {
			const message = format("x '{{ it''s {n}", { quotes: 'source', sourceLocale: 'en', locale: 'de' }).message;
			expect(message).to.equal("x '{{ it''s {n}'");
			expect(parse(message, { requiresOtherClause: false }).map(node => node.value)).to.deep.equal(["x {{ it's {n}"]);
		});

		it('keeps what the text of such a quote says, when curling', () => {
			const text = message => parse(message, { requiresOtherClause: false }).map(node => node.value ?? '').join('');
			const { message } = format("x '{{ it''s {n}");
			expect(text(message)).to.equal(text("x '{{ it''s {n}").replace("'", '’'));
			expect(format(message).message, 'formatting twice').to.equal(message);
		});

		it('doubles an apostrophe that an argument or the end of an option would swallow, unless apostrophes are being curled', () => {
			expect(format("a''{n}", { essentials: false }).message).to.equal("a''{n}");
			expect(format("{n, plural, other {a''}}", { essentials: false }).message).to.equal("{n, plural, other {a''}}");
			expect(format("a''{n}").message).to.equal('a’{n}');
			expect(format("Dogs''", { essentials: false }).message).to.equal("Dogs'");
		});

		it('curls apostrophes but not the quotes around braces, at any depth', () => {
			expect(format("{g, select, a {it''s '{x}'} other {y}}").message).to.equal("{g, select, a {it’s '{x}'} other {y}}");
			expect(format("{n, plural, one {it''s '{x}'} other {y}}").message).to.equal("{n, plural, one {it’s '{x}'} other {y}}");
		});
	});
});

describe('the "add" option adds a missing `other` to a select', () => {
	const add = (message, options = {}) => formatMessageSync(message, { locale: 'en', add: true, ...options }).message;

	it('copies the last case', () => {
		expect(add('{g, select, male {He} female {She}}')).to.equal('{g, select, male {He} female {She} other {She}}');
	});

	it('does nothing to a select that has `other`, or without the option', () => {
		expect(add('{g, select, male {He} other {They}}')).to.equal('{g, select, male {He} other {They}}');
		expect(format('{g, select, male {He} female {She}}').message).to.equal('{g, select, male {He} female {She}}');
	});

	it('works inside other arguments and keeps newlines', () => {
		expect(add('{n, plural, one {{g, select, a {x}}} other {y}}')).to.equal('{n, plural, one {{g, select, a {x} other {x}}} other {y}}');
		expect(add('{g, select,\n\ta {x}\n\tb {y}\n}')).to.equal('{g, select,\n\ta {x}\n\tb {y}\n\tother {y}\n}');
	});

	it('does not replace an `other` that is not the last case', () => {
		expect(add('{g, select, other {They} male {He}}')).to.equal('{g, select, male {He} other {They}}');
		expect(add('{g, select, other {They} male {He}}', { sort: false })).to.equal('{g, select, other {They} male {He}}');
	});

	it('puts `other` last even when the cases are not sorted', () => {
		expect(add('{g, select, b {B} a {A}}', { sort: false })).to.equal('{g, select, b {B} a {A} other {A}}');
	});

	it('still adds the plural categories, and an `other` that is missing from both', () => {
		expect(add('{n, plural, one {x}}')).to.equal('{n, plural, one {x} other {x}}');
		expect(add('{g, select, a {{n, plural, one {x}}}}')).to.equal('{g, select, a {{n, plural, one {x} other {x}}} other {{n, plural, one {x} other {x}}}}');
	});

	it('leaves the result valid for the validator: no missing `other`', () => {
		expect(parse(add('{g, select, a {A}}'), { requiresOtherClause: true })).to.be.an('array');
	});
});
