# messageformat-validator

Validates messageformat strings against various errors and warnings.

## Errors

`argument` - There are unrecognized arguments in the target string.

`brace` - There are mismatched braces in the target string.

`case` - There are unrecognized cases in the target string.

`extraneous` - There is an extraneous key/string in the target locale.

`json-parse` - The target locale contains invalid JSON.

`json-parse-fatal` - The target locale contains invalid JSON that is irrecoverable.

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