'use strict';

const fs = require('fs');

const build = process.env.BUILD;

function Reporter(locale, fileContents) {
  this.locale = locale;
  this.report = {};
  this.fileContents = fileContents;
  //this.fileContents = fs.readFileSync(`./test/locales/json/${this.locale}.json`, 'utf8');
}

Reporter.prototype.config = function({ key, targetString, sourceString }) {
  this.key = key;
  this.target = targetString;
  this.source = sourceString;
};

Reporter.prototype.log = function(level, type, msg, column) {

  //if (this.report[level]) {
  this.report[level] = this.report[level] || {};
  this.report[level][type] = this.report[level][type] || 0;
  this.report[level][type]++;
  this.issues = [];
  //}

  if (level === 'error' || process.env.verbose) {

    const line = this.fileContents.substring(0, this.fileContents.indexOf(`"${this.key}"`)).split('\n').length;

    const issue = {
      file: `${this.locale}.json`,
      line,
      column,
      level,
      msg
    };

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

  }
};

Reporter.prototype.warning = function(type, msg) {
  return this.log('warning', type, msg);
};

Reporter.prototype.error = function(type, msg, err) {

  const column = err ? err.location.start.column + this.key.length + 7 : '?';

  const issue = this.log('error', type, msg, column);
  if (build) {
    throw err || msg;
  }
  return issue;
};

module.exports = { Reporter };
