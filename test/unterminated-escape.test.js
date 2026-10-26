import { expect } from 'chai';
import { parse } from '@formatjs/icu-messageformat-parser';
import { findUnterminatedEscapeRuns, formatMessageSync, validateMessage } from '../src/index.js';

// An escape run (text in apostrophes, a "quote") opens at an apostrophe in front of `{`, `}` or `<`, and only a single apostrophe closes it (`''` is an apostrophe).
// One that is never closed swallows the rest of the message, including the brace that closes the case it is in. One that a later
// apostrophe closes, in another case or outside the tag it is in, is as good as never closed: it swallows the end of what it is in.
// (`'>` is no quote. The parser reads it as one, but it is an apostrophe followed by `>`.)

describe('findUnterminatedEscapeRuns', () => {
	const find = message => findUnterminatedEscapeRuns(message)[0];
	const findAll = message => findUnterminatedEscapeRuns(message);

	it('finds the apostrophe that opens it, and the end of the message when it is not inside a case', () => {
		expect(find("l'<b>abc</b>")).to.deep.equal({ start: 1, end: 12 });
		expect(find("l'{n}")).to.deep.equal({ start: 1, end: 5 });
		expect(find("'}")).to.deep.equal({ start: 0, end: 2 });
	});

	it('ends it before the brace that closes the case it is in', () => {
		const plural = "{n, plural, one {l'<b>{x}</b>} other {y}}";
		expect(find(plural)).to.deep.equal({ start: plural.indexOf("'"), end: plural.indexOf('</b>}') + 4 });
		const select = "{g, select, a {l'<b>x</b>} other {y}}";
		expect(find(select)).to.deep.equal({ start: select.indexOf("'"), end: select.indexOf('</b>}') + 4 });
		const nested = "{g, select, a {{n, plural, one {l'{x}} other {y}}} other {z}}";
		expect(find(nested)).to.deep.equal({ start: nested.indexOf("'"), end: nested.indexOf('{x}}') + 3 });
	});

	it('does not count braces that the quote itself holds', () => {
		const message = "{n, plural, one {l'{a}{b} c} other {y}}";
		expect(find(message).end).to.equal(message.indexOf(' c}') + 2);
	});

	it('ends it before the closing tag of a tag it is in', () => {
		const message = "<b>l'<i>x</i></b>";
		expect(find(message)).to.deep.equal({ start: 4, end: message.lastIndexOf('</b>') });
	});

	it('ends it after a self-closing tag that it opens at, as that is all it needs to hold', () => {
		const message = "<b>l'<br/>x</b>";
		expect(find(message)).to.deep.equal({ start: 4, end: message.lastIndexOf('<br/>') + 5 });
		expect(find("l'<br/>x")).to.deep.equal({ start: 1, end: 7 });
		expect(find("{n, plural, one {l'<br/>x} other {y}}")).to.deep.equal({ start: 18, end: 24 });
	});

	it('is not fooled by self-closing tags that are not where it opens', () => {
		const message = "<b>l'<i>x<br/>y</i></b>";
		expect(find(message)).to.deep.equal({ start: 4, end: message.lastIndexOf('</b>') });
	});

	it('does not find a quote that holds a self-closing tag and more, and is closed', () => {
		expect(find("'<br/>text' x")).to.equal(undefined);
	});

	it("treats `''` inside the quote as an apostrophe that does not close it", () => {
		expect(find("'<b>''x</b>")).to.deep.equal({ start: 0, end: 11 });
		expect(find("'<b''> x")).to.deep.equal({ start: 0, end: 8 });
		expect(find("'{x''y} z")).to.deep.equal({ start: 0, end: 9 });
		expect(find("'''<b>")).to.deep.equal({ start: 2, end: 6 });
		expect(find("'<b>''x</b>'"), 'closed by a single apostrophe after it').to.equal(undefined);
	});

	it('finds a quote that opens at each of `{`, `}` and `<`', () => {
		expect(find("a'{b")).to.deep.equal({ start: 1, end: 4 });
		expect(find("a'}b")).to.deep.equal({ start: 1, end: 4 });
		expect(find("a'<b")).to.deep.equal({ start: 1, end: 4 });
		expect(find("a'xb")).to.equal(undefined);
	});

	it('does not take `>` for something that opens a quote: `\'>` is an apostrophe', () => {
		expect(find("t'> l")).to.equal(undefined);
		expect(find("a'>b")).to.equal(undefined);
		expect(find("{n, plural, one {t'> l} other {y}}")).to.equal(undefined);
		expect(find("'<b>'> x")).to.equal(undefined);
	});

	describe('a quote that a later apostrophe closes beyond the end of what it is in', () => {
		it('is found: the same text in two cases is two quotes, not one quote that spans from the first case to the second', () => {
			const message = "{n, plural, one {l'<b>abc</b>} other {l'<b>abc</b>}}";
			const first = message.indexOf("'");
			const second = message.lastIndexOf("'");
			expect(findAll(message)).to.deep.equal([
				{ start: first, end: message.indexOf('</b>}') + 4 },
				{ start: second, end: message.lastIndexOf('</b>}') + 4 },
			]);
		});

		it('is found when the apostrophe that closes it is ordinary text in the next case', () => {
			const message = "{n, plural, one {l'<b>abc</b>} other {it's}}";
			expect(findAll(message)).to.deep.equal([{ start: message.indexOf("'"), end: message.indexOf('</b>}') + 4 }]);
		});

		it('is found in a select, and in a nested case', () => {
			const select = "{g, select, a {l'<b>x</b>} other {l'{y}}}";
			expect(findAll(select).map(quote => quote.start)).to.deep.equal([select.indexOf("'"), select.lastIndexOf("'")]);
			const nested = "{g, select, a {{n, plural, one {l'{x}} other {it's}}} other {z}}";
			expect(findAll(nested)).to.deep.equal([{ start: nested.indexOf("'"), end: nested.indexOf('{x}}') + 3 }]);
		});

		it('is found when it is closed beyond the end of the tag it is in', () => {
			const message = "<b>l'<i>x</i></b> and it's";
			expect(findAll(message)).to.deep.equal([{ start: message.indexOf("'"), end: message.indexOf('</b>') }]);
		});

		it('is not found when it is closed in time, in any case', () => {
			[
				"{n, plural, one {l'<b>abc</b>'} other {l'<b>abc</b>'}}",
				"{n, plural, one {'<b>{x}</b>'} other {it's}}",
				"{n, plural, one {a '{' b} other {c '}' d}}",
				"<b>l'<i>x</i>'</b> and it's",
			].forEach(message => expect(findAll(message), message).to.deep.equal([]));
		});
	});

	it('finds every quote that is not closed, with its own end', () => {
		expect(findAll("a'{x} b'<i>y")).to.deep.equal([]);
		expect(findAll("{a, select, x {l'{p}} y {l'{q}} other {z}}")).to.deep.equal([{ start: 16, end: 20 }, { start: 26, end: 30 }]);
	});

	it('does not take a `}` or a closing tag in a quote for the end of what the quote is in, when it is not in anything', () => {
		["'</b>'", "'{</b>'", "x '</b> y'", "'}' x", "a '}' b '}' c", "{n, plural, one {a} other {'}' x}}"].forEach(message => {
			expect(findAll(message), message).to.deep.equal([]);
		});
		const message = "<b>'</b>'";
		expect(findAll(message), 'but it does, in a tag').to.deep.equal([{ start: 3, end: 4 }]);
	});

	it('does not count a quote that a later apostrophe closes in time, in a case that is not the last', () => {
		expect(findAll("{n, plural, one {'{x}' it's} other {l'<b>y</b>' and it's}}")).to.deep.equal([]);
	});

	describe('what a `}` or a closing tag ends', () => {
		it('is only what was opened before the quote: not an argument or a tag that is already closed', () => {
			expect(findAll("{x} '<b>}' y"), 'an argument').to.deep.equal([]);
			expect(findAll("<b>x</b> and '</b>' y"), 'a tag').to.deep.equal([]);
			expect(findAll("<br/> '</b>' y"), 'a tag that is not one').to.deep.equal([]);
			expect(findAll("'<b>}' y"), 'nothing').to.deep.equal([]);
		});

		it('is only what is open, however many closing braces and tags there were before', () => {
			const braces = "a} {l'<b>x</b>} z";
			expect(find(braces)).to.deep.equal({ start: braces.indexOf("'"), end: braces.indexOf('} z') });
			const tags = "</a><b>l'<i>x</i></b>";
			expect(find(tags)).to.deep.equal({ start: tags.indexOf("'"), end: tags.lastIndexOf('</b>') });
		});

		it('is not a `}` after the quote ends: the next quote is found as if the first were closed', () => {
			const message = "{n, plural, one {l'<b>y</b>} other {z}} and '<b>}' x";
			expect(findAll(message)).to.deep.equal([{ start: 18, end: 27 }]);
		});

		it('is not a tag that has no name to speak of', () => {
			expect(find("<b>l'<1></b>")).to.deep.equal({ start: 4, end: 8 });
		});
	});

	describe('a `#` in a plural', () => {
		it('starts a quote there, in a selectordinal too, and not elsewhere', () => {
			expect(findAll("{n, plural, one {'# items'} other {y}}")).to.deep.equal([]);
			expect(findAll("{n, selectordinal, one {'# th'} other {y}}")).to.deep.equal([]);
			expect(findAll("{n, plural, one {'# items} other {y}}")).to.have.length(1);
			expect(findAll("{n, selectordinal, one {'# th} other {y}}")).to.have.length(1);
		});

		it('is only one after a plural: before one, or without one, it is text, and the apostrophe is not a quote', () => {
			expect(findAll("a'#1 '{x} y")).to.deep.equal([{ start: 5, end: 11 }]);
			expect(findAll("a'#1 '{x} y {n, plural, one {q} other {r}}")).to.deep.equal([{ start: 5, end: 42 }]);
		});
	});

	it('finds nothing in messages without one', () => {
		[
			"it's", "rock 'n' roll", "5 o'clock {n}", "x'", "'", "''", "l''<b>abc</b>", "l''{n}",
			"'<b>' x", "'{n}'", "a '{' b '}'", "Use '<b>{name}</b>' to bold", "'<b>' and '{x}' too",
			"{n, plural, one {'<b>{x}</b>'} other {y}}", "{n, plural, one {it''s} other {y}}",
			'Hello {name}', '',
		].forEach(message => expect(find(message), message).to.equal(undefined));
	});

	it('does not see a quote that a later apostrophe closes, as the parser does not either', () => {
		expect(find("l'<b>x</b> and it's")).to.equal(undefined);
	});

	it('agrees with the parser: an unterminated escape run is a quote that the parser reads as running to the end', () => {
		const text = message => parse(message, { requiresOtherClause: false })[0].value;
		expect(text("l'<b>abc</b>")).to.equal('l<b>abc</b>');
		const closed = "l'<b>abc</b>'";
		expect(find(closed)).to.equal(undefined);
		expect(text(closed)).to.equal('l<b>abc</b>');
	});
});

describe('validating an unterminated escape run', () => {
	const run = (targetMessage, options = {}) => {
		const calls = [];
		const reporter = {
			error: (type, msg, details) => calls.push({ level: 'error', type, msg, details }),
			warning: (type, msg, details) => calls.push({ level: 'warning', type, msg, details }),
			config() {},
		};
		validateMessage({ targetMessage, targetLocale: 'en', sourceLocale: 'en', ...options }, reporter);
		return calls;
	};
	const escapes = calls => calls.filter(call => call.type === 'escape');

	it('warns, pointing at the apostrophe that opens it', () => {
		const calls = escapes(run("l'<b>abc</b>", { sourceMessage: undefined }));
		expect(calls).to.have.length(1);
		expect(calls[0].level).to.equal('warning');
		expect(calls[0].type).to.equal('escape');
		expect(calls[0].details).to.include({ column: 1, offset: 1, length: 1 });
		expect(calls[0].msg).to.match(/^Unterminated escape run before "<b"\./);
		expect(calls[0].msg).to.include(`Close it with another "'"`);
	});

	it('names the one or two characters that follow the apostrophe, also at the end of the message', () => {
		expect(escapes(run("a'{"))[0].msg).to.include('before "{"');
		expect(escapes(run("a'<"))[0].msg).to.include('before "<"');
		expect(escapes(run("a'{x"))[0].msg).to.include('before "{x"');
	});

	it('does not warn for `\'>`, which is an apostrophe', () => {
		expect(escapes(run("t'> l"))).to.deep.equal([]);
		expect(escapes(run("<b>t'> l</b>"))).to.deep.equal([]);
		expect(escapes(run("{n, plural, one {t'> l} other {y}}"))).to.deep.equal([]);
	});

	it('warns for each quote, as the same text in two cases is two quotes and not one that spans from the first case to the second', () => {
		const message = "{n, plural, one {l'<b>abc</b>} other {l'<b>abc</b>}}";
		const calls = escapes(run(message, { sourceMessage: undefined }));
		expect(calls.map(call => call.details.offset)).to.deep.equal([message.indexOf("'"), message.lastIndexOf("'")]);
		calls.forEach(call => expect(call.level).to.equal('warning'));
	});

	it('warns for a quote that a later apostrophe closes beyond the end of the case it is in', () => {
		const message = "{n, plural, one {l'<b>abc</b>} other {it's}}";
		expect(escapes(run(message, { sourceMessage: undefined })).map(call => call.details.offset)).to.deep.equal([message.indexOf("'")]);
	});

	it('does not warn for the apostrophes that close a quote that starts at `#` of a plural', () => {
		expect(escapes(run("{n, plural, one {'# items'} other {y}}", { sourceMessage: undefined }))).to.deep.equal([]);
	});

	it('warns for a quote that starts at `#` of a plural, and never closes', () => {
		const message = "{n, plural, one {'# items} other {y}}";
		expect(escapes(run(message, { sourceMessage: undefined })).map(call => call.details.offset)).to.deep.equal([message.indexOf("'")]);
	});

	it('warns when there is a source message too', () => {
		expect(escapes(run("l'<b>abc</b>", { sourceMessage: "l''<b>abc</b>" }))).to.have.length(1);
	});

	it('names the cause of a parse error it leads to, as well as reporting the error', () => {
		const message = "{n, plural, one {l'<b>{x}</b>} other {y}}";
		const calls = run(message, { sourceMessage: undefined });
		expect(escapes(calls)).to.have.length(1);
		expect(escapes(calls)[0].details.offset).to.equal(message.indexOf("'"));
		expect(calls.some(call => call.level === 'error' && ['parse', 'brace'].includes(call.type))).to.equal(true);
	});

	it('does not report it under the old name', () => {
		expect(run("l'<b>abc</b>", { sourceMessage: undefined }).filter(call => call.type === 'quote')).to.deep.equal([]);
		expect(run("l'<b>abc</b>", { sourceMessage: undefined }).filter(call => /Unterminated quote/.test(call.msg))).to.deep.equal([]);
	});

	it('says nothing about quotes that are closed, doubled, or only apostrophes', () => {
		["it's", "l''<b>abc</b>", "'<b>' x", "Use '<b>{name}</b>' to bold", "rock 'n' roll", "{n, plural, one {'<b>{x}</b>'} other {y}}"].forEach(message => {
			expect(escapes(run(message, { sourceMessage: undefined })), message).to.deep.equal([]);
		});
	});
});

describe('formatting an unterminated escape run', () => {
	const format = (message, options = {}) => formatMessageSync(message, { locale: 'en', ...options });
	const textOf = (message, ...path) => path.reduce((node, key) => node.options[key].value[0], parse(message, { requiresOtherClause: false })[0]).value;

	it('closes it at the end of the message', () => {
		expect(format("l'<b>abc</b>").message).to.equal("l'<b>abc</b>'");
		expect(format("l'<b>abc</b>", { essentials: false }).message).to.equal("l'<b>abc</b>'");
	});

	it('keeps the quoted braces the author wrote elsewhere in the message when it closes one', () => {
		for (const quoted of ["'{x}'", "'{'", "'}'"]) {
			const message = `{n, plural, one {${quoted} l'<b>y</b>} other {z}}`;
			expect(format(message, { hoist: false }).message).to.equal(`{n, plural, one {${quoted} l'<b>y</b>'} other {z}}`);
		}
	});

	it('does not close it when apostrophes are to be kept as they are (`quotes: "straight"`), as there it is no quote', () => {
		const message = "{n, plural, one {l'<b>x</b>} other {y}}";
		const result = format(message, { hoist: false, quotes: 'straight' });
		expect(result.error).to.not.equal(undefined);
		expect(result.message).to.equal(message);
	});

	describe('`\'>`', () => {
		// The parser reads it as a quote and drops the apostrophe. It is an apostrophe followed by `>`, and is formatted as one.
		it('is left as it is, when nothing is to be changed', () => {
			[
				"t'> l", "{n, plural, one {t'> l} other {y}}", "{n, plural, one {t'> l} other {it's}}",
				"{g, select, a {t'> l} other {l'> b}}", "<b>t'> l</b>", "a ''> b", "'<b>'> x",
			].forEach(message => {
				const result = format(message, { essentials: false, hoist: false });
				expect(result.error, message).to.equal(undefined);
				expect(result.message, message).to.equal(message);
			});
		});

		it('is not closed as a quote, and not given an apostrophe more than the one it has', () => {
			expect(format("{n, plural, one {t'> l} other {y}}", { hoist: false }).message).to.equal("{n, plural, one {t’> l} other {y}}");
			expect(format("t'> l'", { essentials: false }).message, 'not a quote that the second apostrophe closes').to.equal("t'> l'");
		});

		it('is an apostrophe like any other for the `apostrophes` rewrite', () => {
			expect(format("t'> l").message).to.equal(format("t'x l").message.replace('x', '>'));
			expect(format("t'> l").message).to.equal('t’> l');
		});

		it('is an apostrophe like any other for `quotes`', () => {
			[{ quotes: 'straight' }, { quotes: 'straight', locale: 'de' }, { quotes: 'straight', locale: 'fr' }].forEach(options => {
				expect(format("t'> l", options).message, JSON.stringify(options)).to.equal(format("t'x l", options).message.replace('x', '>'));
				expect(format("t'> l", options).message, JSON.stringify(options)).to.not.include("'");
			});
			const withSource = { quotes: 'source', sourceLocale: 'en', locale: 'de' };
			expect(format("t'> l", withSource).message).to.equal(format("t'x l", withSource).message.replace('x', '>'));
		});

		it('is told from `\'\'>`, an apostrophe written as one, which is still written as one', () => {
			expect(format("a ''> b", { essentials: false }).message).to.equal("a ''> b");
			expect(format("a '> b ''> c", { essentials: false }).message).to.equal("a '> b ''> c");
		});

		it('does not change the apostrophe that closes a quote that opened at `<`', () => {
			expect(format("'<b>'> x", { essentials: false }).message).to.equal("'<b>'> x");
		});
	});

	describe('a quote that a later apostrophe closes beyond the end of the case it is in', () => {
		it('is closed where the case ends, in each case', () => {
			const result = format("{n, plural, one {l'<b>abc</b>} other {l'<b>abc</b>}}", { hoist: false });
			expect(result.error).to.equal(undefined);
			expect(result.message).to.equal("{n, plural, one {l'<b>abc</b>'} other {l'<b>abc</b>'}}");
			expect(textOf(result.message, 'one')).to.equal('l<b>abc</b>');
			expect(textOf(result.message, 'other')).to.equal('l<b>abc</b>');
			expect(format(result.message, { hoist: false }).message, 'formatting twice').to.equal(result.message);
		});

		it('is closed when the apostrophe that closes it is a real apostrophe in the next case', () => {
			const result = format("{n, plural, one {l'<b>abc</b>} other {it's}}", { hoist: false });
			expect(result.message).to.equal("{n, plural, one {l'<b>abc</b>'} other {it’s}}");
			expect(textOf(result.message, 'other')).to.equal('it’s');
		});

		it('is closed in a select, and where it is not the first thing in the message', () => {
			expect(format("{g, select, a {l'<b>x</b>} other {l'{y}}}", { hoist: false }).message).to.equal("{g, select, a {l'<b>x</b>'} other {l'{y}'}}");
			expect(format("hi {n, plural, one {l'<b>abc</b>} other {l'<b>abc</b>}} bye", { hoist: false }).message)
				.to.equal("hi {n, plural, one {l'<b>abc</b>'} other {l'<b>abc</b>'}} bye");
		});

		it('is closed before the closing tag it would otherwise pass', () => {
			expect(format("<b>l'<i>x</i></b> and it's", { hoist: false }).message).to.equal("<b>l'<i>x</i>'</b> and it’s");
		});

		it('is left alone by `closeEscapeRuns: false`, and by `essentials: false`', () => {
			const message = "{n, plural, one {l'<b>abc</b>} other {l'<b>abc</b>}}";
			[{ closeEscapeRuns: false }, { essentials: false }].forEach(options => {
				const result = format(message, { hoist: false, ...options });
				expect(result.message, JSON.stringify(options)).to.not.equal("{n, plural, one {l'<b>abc</b>'} other {l'<b>abc</b>'}}");
			});
		});
	});

	it('does not close the apostrophes that close a quote that starts at `#` of a plural', () => {
		const result = format("{n, plural, one {'# items'} other {y}}", { hoist: false, essentials: false });
		expect(result.error).to.equal(undefined);
		expect(textOf(result.message, 'one'), 'the text of the quote is all there, and the plural is not cut short').to.equal('# items');
		expect(textOf(result.message, 'other')).to.equal('y');
	});

	it('closes it at the end of the plural case it is in, so the quote holds what the author wrote and no more', () => {
		const result = format("{n, plural, one {l'<b>{x}</b>} other {y}}");
		expect(result.error).to.equal(undefined);
		expect(result.message).to.equal("{n, plural, one {l'<b>{x}</b>'} other {y}}");
		expect(textOf(result.message, 'one')).to.equal('l<b>{x}</b>');
		expect(textOf(result.message, 'other')).to.equal('y');
		expect(format(result.message).message, 'formatting twice').to.equal(result.message);
	});

	it('closes it at the end of a select case, and a nested case', () => {
		expect(format("{g, select, a {l'<b>x</b>} other {y}}").message).to.equal("{g, select, a {l'<b>x</b>'} other {y}}");
		expect(format("{g, select, a {{n, plural, one {l'{x}} other {y}}} other {z}}").message).to.equal("{g, select, a {{n, plural, one {l'{x}'} other {y}}} other {z}}");
	});

	it('closes it in the last case too, and does not guess that the apostrophe was meant as text', () => {
		const result = format("{n, plural, one {a} other {l'{x}}}");
		expect(result.message).to.equal("{n, plural, one {a} other {l'{x}'}}");
		expect(textOf(result.message, 'other')).to.equal('l{x}');
	});

	it('closes it before the closing tag of the tag it is in', () => {
		expect(format("<b>l'<i>x</i></b>").message).to.equal("<b>l'<i>x</i>'</b>");
	});

	it('closes it in a message that has an argument before it', () => {
		expect(format("{name}: {n, plural, one {l'<b>x</b>} other {y}}", { hoist: false }).message).to.equal("{name}: {n, plural, one {l'<b>x</b>'} other {y}}");
		expect(format("{name}: {n, plural, one {l'<b>x</b>} other {y}}").message, 'hoisted, as it would be anyway').to.equal("{n, plural, one {{name}: l'<b>x</b>'} other {{name}: y}}");
	});

	it('leaves a message with a doubled apostrophe, or a closed quote, as it was', () => {
		expect(format("{n, plural, one {l''<b>x</b>} other {y}}", { essentials: false }).message).to.equal("{n, plural, one {l''<b>x</b>} other {y}}");
		expect(format("{n, plural, one {l'<b>x</b>'} other {y}}", { essentials: false }).message).to.equal("{n, plural, one {l'<b>x</b>'} other {y}}");
	});

	describe('the `closeEscapeRuns` rewrite', () => {
		const message = "{n, plural, one {l'<b>{x}</b>} other {y}}";

		it('is one of the essentials, so `essentials: false` and `closeEscapeRuns: false` leave the message alone, with its parse error', () => {
			[{ essentials: false }, { closeEscapeRuns: false }].forEach(options => {
				const result = format(message, options);
				expect(result.error, JSON.stringify(options)).to.be.an('error');
				expect(result.message).to.equal(message);
			});
		});

		it('can be switched back on by itself', () => {
			expect(format(message, { essentials: false, closeEscapeRuns: true }).message).to.equal("{n, plural, one {l'<b>{x}</b>'} other {y}}");
		});
	});

	it('still reports a message that is broken in some other way', () => {
		expect(format('Hello {name').error).to.be.an('error');
		expect(format("{n, plural, one {l'<b>x</b>} other {y}", {}).error, 'unclosed argument as well').to.be.an('error');
	});
});
