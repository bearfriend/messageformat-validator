import { expect } from 'chai';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const cli = resolve(import.meta.dirname, '../bin/cli.js');

const TARGET = [
	'export default {',
	'\tgreeting: "It\'s {n, plural, other {x} one {y}}",',
	'\tbroken: "It\'s {name",',
	'\tnested: "{a, plural, =1 {value 1} one {b} अन्य {च}}",',
	'\tmulti: "{a, plural, one {a cat} other {cats}} and {b, plural, one {a dog} other {dogs}}",',
	'};',
	''
].join('\n');

function run(...args) {
	const dir = mkdtempSync(join(tmpdir(), 'mfv-cli-'));
	mkdirSync(join(dir, 'lang'));
	writeFileSync(join(dir, 'lang', 'en.js'), 'export default {\n\tgreeting: "Hi",\n\tbroken: "Hi",\n\tnested: "Hi",\n\tmulti: "Hi",\n};\n');
	writeFileSync(join(dir, 'lang', 'fr.js'), TARGET);
	execFileSync(process.execPath, ['--no-warnings', cli, '-s', 'en', '-p', 'lang/', '-l', 'fr', 'format', ...args], {
		cwd: dir,
		env: { ...process.env, PWD: dir },
		stdio: 'pipe'
	});
	return readFileSync(join(dir, 'lang', 'fr.js'), 'utf8').split('\n');
}

const line = (lines, key) => lines.find(l => l.includes(`${key}:`));

describe('mfv format (CLI)', function() {
	this.timeout(20000);

	it('rewrites messages with all the default rewrites', () => {
		const lines = run();
		expect(line(lines, 'greeting')).to.equal('\tgreeting: "{n, plural, one {It’s y} other {It’s x}}",');
		expect(line(lines, 'nested')).to.equal('\tnested: "{a, plural, अन्य {च} one {value {a}}}",');
	});

	['', '--quotes straight', '--quotes source'].forEach(flags => {
		it(`leaves a message that cannot be parsed exactly as it was ${flags && `with ${flags}`}`.trim(), () => {
			expect(line(run(...flags.split(' ').filter(Boolean)), 'broken')).to.equal('\tbroken: "It\'s {name",');
		});
	});

	it('--no-essentials leaves messages as they are', () => {
		expect(run('--no-essentials').join('\n')).to.equal(TARGET);
	});

	it('--no-essentials still allows an individual rewrite to be given', () => {
		const lines = run('--no-essentials', '--sort');
		expect(line(lines, 'greeting')).to.equal('\tgreeting: "It\'s {n, plural, one {y} other {x}}",');
		expect(line(lines, 'nested')).to.equal('\tnested: "{a, plural, =1 {value 1} अन्य {च} one {b}}",');
	});

	it('each rewrite can be switched off on its own', () => {
		expect(line(run('--no-apostrophes'), 'greeting')).to.equal('\tgreeting: "{n, plural, one {It\'s y} other {It\'s x}}",');
		expect(line(run('--no-sort'), 'greeting')).to.equal('\tgreeting: "{n, plural, other {It’s x} one {It’s y}}",');
		expect(line(run('--no-normalize-one', '--no-sort'), 'nested')).to.equal('\tnested: "{a, plural, =1 {value 1} one {b} अन्य {च}}",');
		expect(line(run('--no-rename-categories', '--no-sort'), 'nested')).to.equal('\tnested: "{a, plural, one {value {a}} अन्य {च}}",');
		const multi = '\tmulti: "{a, plural, one {a cat} other {cats}} and {b, plural, one {a dog} other {dogs}}",';
		expect(line(run(), 'multi')).to.include('{a, plural, one {{b, plural,');
		expect(line(run('--no-hoist'), 'multi')).to.equal(multi);
	});

	it('does not document the options', () => {
		const help = execFileSync(process.execPath, ['--no-warnings', cli, 'format', '--help'], { stdio: 'pipe' }).toString();
		['essentials', 'apostrophes', 'normalize-one', 'rename-categories', 'sort', 'hoist'].forEach(name => expect(help).to.not.include(`--${name}`).and.not.include(`--no-${name}`));
	});
});

describe('mfv format (CLI), unterminated escape runs', function() {
	this.timeout(20000);

	const target = [
		'export default {',
		'\tplural: "{n, plural, one {l\'<b>{x}</b>} other {y}}",',
		'\ttop: "l\'<b>abc</b>",',
		'\ttwice: "{n, plural, one {l\'<b>abc</b>} other {l\'<b>abc</b>}}",',
		'\tgreater: "t\'> l",',
		'};',
		''
	].join('\n');

	function runWith(...args) {
		const dir = mkdtempSync(join(tmpdir(), 'mfv-cli-'));
		mkdirSync(join(dir, 'lang'));
		writeFileSync(join(dir, 'lang', 'en.js'), 'export default {\n\tplural: "Hi",\n\ttop: "Hi",\n\ttwice: "Hi",\n\tgreater: "Hi",\n};\n');
		writeFileSync(join(dir, 'lang', 'fr.js'), target);
		execFileSync(process.execPath, ['--no-warnings', cli, '-s', 'en', '-p', 'lang/', '-l', 'fr', 'format', ...args], { cwd: dir, env: { ...process.env, PWD: dir }, stdio: 'pipe' });
		return readFileSync(join(dir, 'lang', 'fr.js'), 'utf8').split('\n');
	}

	it('closes them by default', () => {
		const lines = runWith();
		expect(line(lines, 'plural')).to.equal('\tplural: "{n, plural, one {l\'<b>{x}</b>\'} other {y}}",');
		expect(line(lines, 'top')).to.equal('\ttop: "l\'<b>abc</b>\'",');
	});

	it('closes the same quote in each case of a plural, even though the apostrophe in the second case closes the one in the first', () => {
		expect(line(runWith(), 'twice')).to.equal('\ttwice: "{n, plural, one {l\'<b>abc</b>\'} other {l\'<b>abc</b>\'}}",');
	});

	it('does not drop the apostrophe in `\'>`, which is not a quote', () => {
		expect(line(runWith(), 'greater')).to.equal('\tgreater: "t’> l",');
		expect(line(runWith('--no-essentials'), 'greater')).to.equal('\tgreater: "t\'> l",');
	});

	it('--no-close-escape-runs and --no-essentials leave the one that is in a case, which cannot be parsed, exactly as it was', () => {
		['--no-close-escape-runs', '--no-essentials'].forEach(flag => {
			expect(line(runWith(flag), 'plural'), flag).to.equal('\tplural: "{n, plural, one {l\'<b>{x}</b>} other {y}}",');
		});
	});

	it('--no-essentials --close-escape-runs switches it back on', () => {
		expect(line(runWith('--no-essentials', '--close-escape-runs'), 'plural')).to.equal('\tplural: "{n, plural, one {l\'<b>{x}</b>\'} other {y}}",');
	});

	it('does not document the option', () => {
		const help = execFileSync(process.execPath, ['--no-warnings', cli, 'format', '--help'], { stdio: 'pipe' }).toString();
		expect(help).to.not.include('close-escape-runs');
	});
});

describe('mfv format --add (help)', () => {
	it('says it also adds select options from the source, and a missing `other`', () => {
		const help = execFileSync(process.execPath, ['--no-warnings', cli, 'format', '--help'], { stdio: 'pipe' }).toString().replace(/\s+/g, ' ');
		expect(help).to.include('-a, --add Add any supported plural/selectordinal categories or required select options that are missing');
	});
});
