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

`--no-issues` - Don't output issues

`-i, --ignore <items>` - Ignore these comma-separated issue types

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
  "locales": ["ar", "de", "en", "es", "es-es", "hi", "tr"],
  "jsonObj": true
}
```

## Errors

`argument` - Unrecognized argument

`brace` - Mismatched braces

`category` - Unsupported category

`duplicate` - Multiple messages with the same name

`extraneous` - Message does not exist in the source locale

`missing` - Message missing from the target locale

`nbsp` - Message structure contains non-breaking space

`nest` - The nesting order of the target message does not match the source message

`option` - Unrecognized option

`option-missing` - Missing option used in the source

`other` - Missing "other" option

`parse` - Failed to parse message

`source` - Failed to parse source message

## Warnings

`category-missing` - Missing categories used by the target locale

`nest-ideal` - A `select` is nested inside a `plural` or `selectordinal`

`nest-order` - Nesting order does not match source

`split` - Split by a complex argument

`untranslated` - Message has not been translated


## Overrides

You can mark individual messages as

`mfv override fr option`

A global list of overrides is pre-loaded:

v Expand Me

## v3

- Always throws on error. The `--throw-errors` option has been removed.
- The `locales` option now takes an array when in the config files
- New `format` subcommand rewrites messages to a standard format
- Issue types renamed:
 - `case` -> `option`
 - `nest` -> `nest-source` and `nest-ideal`
 - `duplicate-keys` -> `duplicate`
 - `plural-key` -> `category`
 - `categories` -> `category-missing`
 - `source-error` -> `source`
- New issue types
 - `option-missing`
