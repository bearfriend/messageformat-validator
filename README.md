# messageformat-validator

Validates messageformat messages against various errors and warnings.

## Install

```shell
npm i messageformat-validator
```

## Usage

```shell
mfv [options] [subcommand]
```

### Examples

Check for issues in all files within `lang/`
```shell
mfv -s en -p lang/
```

Add messages that exist in `en` to all files within `lang/`, if they are missing
```shell
mfv -s en -p lang/ add-missing
```

Output the `myMessage` message from the `es-es` file with all messageformat structure highlighted
```shell
mfv -l es-es -p lang/ highlight myMessage
```

### Options:

`-V, --version` - output the version number

`-e, --throw-errors` - Throw an error if error issues are found

`--no-issues` - Don't output issues

`-i, --ignoreIssueTypes <items>` - Ignore these comma-separated issue types

`-l, --locales <items>` - Process only these comma-separated locales

`-p, --path <path>` - Path to a directory containing locale files

`-t, --translator-output` - Output JSON of all source messages that are missing or untranslated in the target

`-s, --source-locale <locale>` - The locale to use as the source

`--json-obj` - Indicate that the files to be parsed are JSON files with keys that have objects for values with their own keys: `translation` and `context`

`-h, --help` - display help for command

### Subommands:

`remove-extraneous` - Remove messages that do not exist in the source locale

`add-missing` - Add messages that do not exist in the target locale

`sort` - Sort messages alphabetically by key, maintaining any blocks

`rename <old-key> <new-key>` - Rename a message

`highlight <key>` - Output a message with all non-translatable ICU MessageFormat structure highlighted

`help [command]` - display help for command

## Config File

Some options can be configured with default values in `mfv.config.json`
```json
{
  "source": "en"
  "path": "lang/",
  "locales": "ar,de,en,es,es-es,hi,tr",
  "jsonObj": true
}
```

## Errors

`argument` - There are unrecognized arguments in the target message.

`brace` - There are mismatched braces in the target message.

`case` - There are unrecognized cases in the target message.

`extraneous` - There is an extraneous message in the target locale.

`missing` - There is a message missing from the target locale.

`nbsp` - There are invalid non-breaking spaces in the structure of the target message.

`nest` - The nesting order of the target message does not match the source message.

`other` - The target message is missing an `other` case

`parse` - The target message can not be parsed.

`source` - There is an error in the source message.

## Warnings

`nest` - There is a `select` nested inside a `plural` or `selectordinal` in the target message.

`split` - The target message is split by a non-argument. `plural`, `selectordinal`, and `select` cases should contain complete translations.

`untranslated` - The target message has not been translated.
