using RailAgent.Setup;

// rail-uninstall.exe — removes the service, its configuration and its credentials.
//
//   (double-click)  confirm, then remove everything
//   --keep-config   remove only the service, leave configuration in place
//   --yes           skip the confirmation
//
// Separate from the installer because this is the one operation that must still
// work when the rest of the installation is broken, and because an uninstaller
// that is also the installer is one mis-click from a reinstall.

try { Console.OutputEncoding = System.Text.Encoding.UTF8; } catch { /* keep the default */ }

if (!Elevation.IsAdministrator())
{
    Console.Error.WriteLine("Removing a Windows Service needs Administrator. Re-run from an elevated prompt.");
    return 1;
}

return Uninstaller.Run(args);
