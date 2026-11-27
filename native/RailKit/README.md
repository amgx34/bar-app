# RailKit

Dependency-free Swift package (iOS 17 / macOS 14): the `RailKit` library and its
Swift Testing suite, `RailKitTests`.

## Running the tests

```bash
swift test --package-path native/RailKit \
  -Xswiftc -plugin-path -Xswiftc "$(dirname "$(xcrun -f swift)")/../lib/swift/host/plugins/testing"
```

The extra flag is needed with the Swift 6.4.2 Command Line Tools; see below.

## If swift test fails with TestingMacros not found

Symptom: `external macro implementation type 'TestingMacros.SuiteDeclarationMacro'
could not be found for macro 'Suite'; plugin for module 'TestingMacros' not found`.

Cause: a toolchain defect, not this package and not a corrupt `.build`. With the
default `swiftbuild` build system, SwiftPM is supposed to pass the Swift Testing
macro plugin directory (`<toolchain>/usr/lib/swift/host/plugins/testing`) to the
compiler, but in some runs it leaves it out of the test target's compile
command. Which runs is random, and it happens just as often in a fresh
`--scratch-path`. When the flag is missing, the test target fails to compile.
When it reappears, the command line has changed, so the next run rebuilds and
passes. That is why the failure seems to come and go. Running `swift test -v`
shows it: in a failing run, the `builtin-SwiftDriver ... -module-name
RailKitTests` line has no `plugins/testing` argument.

- Fix: pass the directory yourself, as in the command above. The flag is then
  always present, whether or not SwiftPM adds its own copy.
- Cleaning does not fix it: `rm -rf native/RailKit/.build` and
  `swift package clean` change nothing.
- The other options in `swift test --help` do not work around it:
  `--disable-xctest` fails the same way, and `--build-system native` cannot find
  the `Testing` module at all with the Command Line Tools.
- `swift build` on its own always succeeds, because it does not compile the
  test target.
