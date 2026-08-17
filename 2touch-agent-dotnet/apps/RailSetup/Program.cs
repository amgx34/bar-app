using RailAgent.Setup;

// rail-setup.exe — installs and configures the agent.
//
//   (double-click)  the menu: set up, diagnose, check for updates, remove
//   --setup         straight into the wizard
//   --unattended    no prompts, pairing code from a key file
//   --diagnose      check every prerequisite and write a transcript
//
// The same entry points the agent exe used to expose behind flags. They live
// here now so the agent binary is only ever the service — which is what lets
// rail-update.exe replace it while this installer stays put.

try { Console.OutputEncoding = System.Text.Encoding.UTF8; } catch { /* keep the default */ }

// Loads its own config rather than going through the host builder, which throws
// on an unreadable appsettings.local.json — and a non-elevated operator hitting
// exactly that is one of the things --diagnose exists to explain.
if (Has("--diagnose"))
    return await Diagnostics.RunAsync(CancellationToken.None);

if (Unattended.Requested(args))
{
    // Resolved before elevation so a missing or malformed key file fails in one
    // second, at the operator's prompt, instead of after a UAC dance.
    if (!Unattended.TryCreate(args, out var plan, out var problem))
    {
        Console.Error.WriteLine($"Unattended setup cannot start: {problem}");
        return 1;
    }
    return await new SetupWizard(args, plan).RunAsync(CancellationToken.None);
}

if (Has("--setup"))
    return await new SetupWizard(args).RunAsync(CancellationToken.None);

// No arguments: whoever double-clicked this needs the menu, not a wizard they
// cannot back out of.
return await StartMenu.RunAsync(args, CancellationToken.None);

bool Has(string flag) => args.Contains(flag, StringComparer.OrdinalIgnoreCase);
