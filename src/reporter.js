'use strict';

//const fs = require('fs');

//const build = process.env.BUILD;

function Reporter(locale, fileContents) {
  this.locale = locale;
  this.fileContents = fileContents;
  this.report = { totals: { errors: 0, warnings: 0 } };
  this.issues = [];
}

Reporter.prototype.config = function({ key, targetString, sourceString }) {
  this.key = key;

  if (typeof targetString !== "undefined") this.target = targetString.replace(/\n/g, '\n');
  if (typeof sourceString !== "undefined") this.source = sourceString.replace(/\n/g, '\n');
};

Reporter.prototype.log = function(level, type, msg, column = 0, line) {

  const levels = level + 's';
  this.report.totals[levels]++;

  this.report[levels] = this.report[levels] || {};
  this.report[levels][type] = this.report[levels][type] || 0;
  this.report[levels][type]++;

  const start = this.key ? this.fileContents.indexOf(`"${this.key}"`) : column;
  line = line || this.fileContents.substring(0, start).split('\n').length;

  const issue = {
    locale: this.locale,
    line,
    column,
    type,
    level,
    msg,
    target: this.target,
    source: this.source
  };

  if (this.key) issue.key = this.key;

  this.issues.push(issue);

  return issue;
};

Reporter.prototype.warning = function(type, msg, details = {}) {

  const relativeColumn = details.column || 0;

  let column, keyPos, linePos, valPos;

  const cleanTarget = this.target
    .replace(/\n/g, '\\n')
    .replace(/"/g, '\\"');

  if (type.match(/split|newline/)) {
    column = 0;
  }
  else if (this.key) {
    keyPos = this.fileContents.indexOf(`"${this.key}"`);
    valPos = this.fileContents.indexOf(`"${cleanTarget}"`, keyPos);
    linePos = this.fileContents.lastIndexOf(String.fromCharCode(10), keyPos);
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

  if (this.string) {
    const cleanTarget = this.target
      .replace(/\n/g, '\\n')
      .replace(/"/g, '\\"');

    if (type === 'missing') {
      column = 0;
    }
    else if (this.key) {
      keyPos = this.fileContents.indexOf(`"${this.key}"`);
      valPos = this.fileContents.indexOf(`"${cleanTarget}"`, keyPos);
      linePos = this.fileContents.lastIndexOf(String.fromCharCode(10), keyPos);
      column = (valPos + 1) - linePos + relativeColumn;

      if (valPos === -1) {
        // the target string likely contains a backslash that does not escape anything
        column = 0;
      }
    }
  }
  else if (type === 'json-parse' || type === 'json-parse-fatal') {
    line = this.fileContents.substring(0, relativeColumn).split('\n').length;
    column = relativeColumn - this.fileContents.substring(0, relativeColumn).lastIndexOf('\n');
  }

  return this.log('error', type, msg, column, line);
};

module.exports = { Reporter };
