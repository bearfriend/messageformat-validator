# messageformat-validator

Validates messageformat strings against various errors and warnings.

## Install

```
npm i messageformat-validator
```

## Usage

`mfv [options] [command]`

### Options:

`-V, --version` - output the version number
  
`-e, --throw-errors` - Throw an error if error issues are found
  
`--no-issues` - Don't output issues
  
`-i, --ignoreIssueTypes <items>` - Ignore these comma-separated issue types
  
`-l, --locales <items>` - Process only these comma-separated locales
  
`-p, --path <path>` - Path to a directory containing locale files
  
`-t, --translator-output` - Output JSON of all source strings that are missing or untranslated in the target
  
`-s, --source-locale <locale>` - The locale to use as the source
  
`-h, --help` - display help for command

### Commands:
  
`remove-extraneous` - Remove strings that do not exist in the source locale
  
`add-missing` - Add strings that do not exist in the target locale

`sort` - Sort strings alphabetically by key, maintaining any blocks
  
`rename <old-key> <new-key>` - Rename a string

`highlight <key>` - Output a string with all non-translatable ICU MessageFormat structure highlighted
  
`help [command]` - display help for command


## Errors

`argument` - There are unrecognized arguments in the target string.

`brace` - There are mismatched braces in the target string.

`case` - There are unrecognized cases in the target string.

`extraneous` - There is an extraneous key/string in the target locale.

`missing` - There is a key/string missing from the target locale.

`nbsp` - There are invalid non-breaking spaces in the structure of the target string.

`nest` - The nesting order of the target string does not match the source string.

`parse` - The target string can not be parsed.

`source` - There is an error in the source string.

## Warnings

`newline` - There are unnecessary newline characters in the target string.

`nest` - There is a `plural` nested inside a `select` in the target string.

`split` - The target string is split by a non-argument. `plural` and `select` cases should contain complete sentences/strings.

`untranslated` - The target string has not been translated.
