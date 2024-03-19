export function Reporter(locale, fileContents = '') {
  this.config.locale = locale;
  this.config.fileContents = fileContents;
  this.report = { totals: { errors: 0, warnings: 0 } };
  this.issues = [];
}

Reporter.prototype.config = function(targetString, sourceString, key) {
  this.config.key = key || targetString.key;

  if (typeof targetString !== "undefined") this.config.target = targetString.val;
  if (typeof sourceString !== "undefined") this.config.source = sourceString.val;
};

Reporter.prototype.log = function(level, type, msg, column = 0, line) {
  const levels = level + 's';
  this.report.totals[levels]++;

  this.report[levels] = this.report[levels] || {};
  this.report[levels][type] = this.report[levels][type] || 0;
  this.report[levels][type]++;

  const start = Math.max(column || this.config.fileContents.indexOf(this.config.target), 0);
  const newlines = this.config.target.split(this.config.target.value)[0].match(/\n/)?.length || 0;
  line = line || this.config.fileContents.substring(0, start).split('\n').length + newlines;

  const issue = {
    locale: this.config.locale,
    line,
    column,
    type,
    level,
    msg,
    target: this.config.target,
    source: this.config.source
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

  const cleanTarget = this.target
    .replace(/\n/g, '\\n')
    .replace(/"/g, '\\"');

  if (type === 'missing') {
    column = 0;
  }
  else if (this.config.key) {
    // todo: this seems json-specific
    keyPos = this.config.fileContents.indexOf(`"${this.config.key}"`);
    valPos = this.config.fileContents.indexOf(`"${cleanTarget}"`, keyPos);
    linePos = this.config.fileContents.lastIndexOf(String.fromCharCode(10), keyPos);
    column = (valPos + 1) - linePos + relativeColumn;

    if (valPos === -1) {
      // the target string likely contains a backslash that does not escape anything
      column = 0;
    }
  }
  return this.log('error', type, msg, column, line);
};
