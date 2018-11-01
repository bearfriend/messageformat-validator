#!/usr/bin/env node

'use strict';

/* eslint-disable no-console */

const fs = require('fs');
const { promisify } = require('util');
const readFile = promisify(fs.readFile);
const commander = require('commander');
const findConfig = require('find-config');
const configPath = findConfig('mfv.config.json');
const { localesPath, sourceLocale } = require(configPath);
const { validateLocales } = require('../src/validate');

commander
  .version('0.0.22')
  .option('--no-issues', 'Don\'t output issues')
  .option('-l, --locales <items>', 'Process only these comma-separated locales', val => val.split(','))
  .option('-p, --path [path]', 'Path to a directory containing locale files')
  .parse(process.argv);

const absLocalesPath = `${process.cwd()}/${commander.path || localesPath}`;

fs.readdir(absLocalesPath, (err, files) => {
  if (err) console.log(`Failed to read ${absLocalesPath}`);
  let filteredFiles = files;
  if (commander.locales) {
    commander.locales.push(sourceLocale);
    filteredFiles = files.filter(file => commander.locales.includes(file.replace('.json', '')));
  }
  Promise.all(filteredFiles.map((file) => readFile(absLocalesPath + file, 'utf8')))
  .then((res) => {
    const locales = res.reduce((acc, json, idx) => {
      acc[filteredFiles[idx].replace('.json','')] = json;
      return acc;
    }, {});

    const output = validateLocales({ locales, sourceLocale });

    if (commander.issues) {
      const json = JSON.stringify(output, null, 2);
      console.log(json);
    }
    else {
      const noIssuesOutput = output.map((locale) => {
        const { issues, ...noIssues } = locale; // eslint-disable-line no-unused-vars
        return noIssues;
      });
      const json = JSON.stringify(noIssuesOutput, null, 2);
      console.log(json);
    }
  });
});
