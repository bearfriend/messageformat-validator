'use strict';

//const fs = require('fs');

const build = process.env.BUILD;

function Reporter(locale, fileContents) {
  this.locale = locale;
  this.fileContents = fileContents;
  this.report = { totals: { errors: 0, warnings: 0 } };
  this.issues = [];
}

Reporter.prototype.config = function({ key, targetString, sourceString }) {
  this.key = key;
  this.target = targetString;
  this.source = sourceString;
};

Reporter.prototype.log = function(level, type, msg, column) {

  const levels = level + 's';
  this.report.totals[levels]++;

  this.report[levels] = this.report[levels] || {};
  this.report[levels][type] = this.report[levels][type] || 0;
  this.report[levels][type]++;

  //if (level === 'error' || process.env.verbose) {

    const line = this.fileContents.substring(0, this.fileContents.indexOf(`"${this.key}"`)).split('\n').length;

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

    /*
    const output =
    `\n${type} ${level}\n`+
    `  Message: ${msg}\n`+
    `  File: ${this.locale}.json\n`+
    `  Line: ${line}:${column}\n`+
    `  Key: ${this.key}\n`+
    `  ${(build ? 'String' : 'Target')}: "${this.target}"`

    console.log(output);

    if (!build) console.log(`  (Source: "${this.source}")`);
    */

    return issue;

  //}
};

Reporter.prototype.warning = function(type, msg) {
  return this.log('warning', type, msg);
};

Reporter.prototype.error = function(type, msg, err) {

  const column = err ? err.location.start.column + this.key.length + 7 : 0;

  const issue = this.log('error', type, msg, column);
  if (build) {
    throw err || msg;
  }
  return issue;
};

module.exports = { Reporter };
