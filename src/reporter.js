export function Reporter(locale, fileContents = '') {
  this.config.locale = locale;
  this.config.fileContents = fileContents;
  this.report = { totals: { errors: 0, warnings: 0 } };
  this.issues = [];
}

Reporter.prototype.config = function(targetString, sourceString, key) {
  this.config.key = key || targetString.key;

  if (typeof targetString !== "undefined") this.config.target = targetString;
  if (typeof sourceString !== "undefined") this.config.source = sourceString;
};

Reporter.prototype.log = function(level, type, msg, column = 0, line) {
  const levels = level + 's';
  this.report.totals[levels]++;

  this.report[levels] = this.report[levels] || {};
  this.report[levels][type] = this.report[levels][type] || 0;
  this.report[levels][type]++;

  const start = Math.max(this.config.fileContents.indexOf(this.config.target), 0) + column;
  const newlines = this.config.target.split(this.config.target.val)[0].match(/\n/)?.length || 0;
  if (level === 'error') {
    console.log('Start:', start);
    console.log(newlines);
  }
  line = line || this.config.fileContents.substring(0, start).split('\n').length + newlines;

  const issue = {
    locale: this.config.locale,
    line,
    column,
    type,
    level,
    msg,
    target: this.config.target.val,
    source: this.config.source.val
  };

  if (this.config.key) issue.key = this.config.key;

  this.issues.push(issue);

  return issue;
};

Reporter.prototype.warning = function(type, msg, details = {}) {

  const relativeColumn = details.column || 0;

  let column, keyPos, linePos, valPos;

  const cleanTarget = this.config.target
    .replace(/\n/g, '\\n')
    .replace(/"/g, '\\"');

  if (['split', 'newline'].includes(type)) {
    column = 0;
  }
  else if (this.config.key) {
    keyPos = this.config.fileContents.indexOf(`"${this.config.key}"`);
    valPos = this.config.fileContents.indexOf(`"${cleanTarget}"`, keyPos);
    linePos = this.config.fileContents.lastIndexOf(String.fromCharCode(10), keyPos);
    column = (valPos + 1) - linePos + relativeColumn;

    if (valPos === -1) {
      // the target string likely contains a backslash that does not escape anything
      column = 0;
    }
  }

  return this.log('warning', type, msg, column);
};

Reporter.prototype.error = function(type, msg, details = {}) {

  const relativeColumn = details.column || 0;

  let column = relativeColumn,
  keyPos, line, linePos, valPos;

  if (type === 'missing') {
    column = 0;
  }
  else if (this.config.key) {
    // todo: this seems json-specific
    const keyQuote = this.config.target.keyQuote;
    const valQuote = this.config.target.valQuote;
    keyPos = this.config.fileContents.indexOf(`${keyQuote}${this.config.key}${keyQuote}`);
    valPos = this.config.fileContents.indexOf(`${valQuote}${this.config.target.val}${valQuote}`, keyPos);
    linePos = this.config.fileContents.lastIndexOf(String.fromCharCode(10), keyPos);
    column = (valPos + 1) - linePos + relativeColumn;
    line = this.config.fileContents.substring(0, linePos + column).match(/\n/g).length + 1;
    column -= this.config.target.lastIndexOf('\n', column);

    if (valPos === -1) {
      // the target string likely contains a backslash that does not escape anything
      column = 0;
    }
  }
  return this.log('error', type, msg, column, line);
};
