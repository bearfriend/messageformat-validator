export function Reporter(locale, fileContents = '') {
  this._config = {};
  this._config.locale = locale;
  this._config.fileContents = fileContents;
  this.report = { totals: { errors: 0, warnings: 0 } };
  this.issues = [];
}

Reporter.prototype.config = function(targetMessage, sourceMessage, key) {
  this._config.key = key || targetMessage.key;
  if (typeof targetMessage !== "undefined") this._config.target = targetMessage;
  if (typeof sourceMessage !== "undefined") this._config.source = sourceMessage;
};

Reporter.prototype.log = function(level, type, msg, column = 0, givenLine) {
  const levels = level + 's';
  this.report.totals[levels]++;

  this.report[levels] = this.report[levels] || {};
  this.report[levels][type] = this.report[levels][type] || 0;
  this.report[levels][type]++;

  const start = Math.max(this._config.fileContents.indexOf(this._config.target), 0) + column
  const newlines = this._config.target.split(this._config.target.val)[0].match(/\n/)?.length || 0;
  const line = givenLine || this._config.fileContents.substring(0, start).split('\n').length + newlines;

  const issue = {
    locale: this._config.locale,
    line,
    column,
    type,
    level,
    msg,
    target: this._config.target?.val ?? this._config.target,
    source: this._config.source?.val ?? this._config.source
  };

  if (this._config.key) issue.key = this._config.key;

  this.issues.push(issue);

  return issue;
};

Reporter.prototype.warning = function(type, msg, details = {}) {

  const relativeColumn = details.column || 0;

  let column, keyPos, linePos, valPos;

  const cleanTarget = this._config.target
    .replace(/\n/g, '\\n')
    .replace(/"/g, '\\"');

  if (['split', 'newline'].includes(type)) {
    column = 0;
  }
  else if (this._config.key) {
    keyPos = this._config.fileContents.indexOf(`"${this._config.key}"`);
    valPos = this._config.fileContents.indexOf(`"${cleanTarget}"`, keyPos);
    linePos = this._config.fileContents.lastIndexOf(String.fromCharCode(10), keyPos);
    column = (valPos + 1) - linePos + relativeColumn;

    if (valPos === -1) {
      // the target message likely contains a backslash that does not escape anything
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
  else if (this._config.key) {
    // todo: this seems json-specific
    const keyQuote = this._config.target.keyQuote;
    const valQuote = this._config.target.valQuote;
    keyPos = this._config.fileContents.indexOf(`${keyQuote}${this._config.key}${keyQuote}`);
    valPos = this._config.fileContents.indexOf(`${valQuote}${this._config.target.val}${valQuote}`, keyPos);
    linePos = this._config.fileContents.lastIndexOf(String.fromCharCode(10), keyPos);
    column = (valPos + 1) - linePos + relativeColumn;
    line = (this._config.fileContents.substring(0, linePos + column).match(/\n/g)?.length ?? -1) + 1;
    column -= this._config.target.lastIndexOf('\n', column);

    if (valPos === -1) {
      // the target message likely contains a backslash that does not escape anything
      column = 0;
    }
  }
  return this.log('error', type, msg, column, line);
};
